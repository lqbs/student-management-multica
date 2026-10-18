import { Router, type Request, type Response } from 'express';

import type { Database } from '../../db/index.js';
import { HttpError, isHttpError } from '../../shared/errors.js';
import { pageUrlFactory, readPagination, toFlashRedirect } from '../../shared/http.js';
import { normalizeSearch, validatePositiveId } from '../../shared/validation.js';
import { makePage, resolveFlash, type Flash, type PageMeta } from '../../shared/view.js';
import { countScoresForSubject, countSubjects, listSubjects } from './queries.js';
import { createSubject, getSubjectOrThrow, removeSubject, toSubjectFormValues, updateSubjectById } from './service.js';

function readId(raw: unknown): number {
  const result = validatePositiveId(raw, '科目');
  if (!result.ok) {
    throw HttpError.notFound('科目不存在或已被删除');
  }
  return result.value;
}

function formPage(mode: 'create' | 'edit'): PageMeta {
  return makePage({
    title: mode === 'create' ? '新增科目' : '编辑科目',
    nav: 'subjects',
    heading: mode === 'create' ? '新增科目' : '编辑科目',
    description: '科目名称必填，1-50 个字符且全局唯一；已有成绩的科目禁止删除。',
    breadcrumbs: [
      { label: '首页', href: '/students' },
      { label: '成绩管理', href: '/scores' },
      { label: '科目管理', href: '/subjects' },
      { label: mode === 'create' ? '新增科目' : '编辑科目' },
    ],
  });
}

export function createSubjectsRouter(db: Database): Router {
  const router = Router();

  const renderList = (req: Request, res: Response, options: { status?: number; flash?: Flash | null } = {}): void => {
    const query = req.query as Record<string, unknown>;
    const search = normalizeSearch(query.q);
    const total = countSubjects(db, { search });
    const pagination = readPagination(query, total);
    res.status(options.status ?? 200).render('subjects/list', {
      page: makePage({
        title: '科目管理',
        nav: 'subjects',
        heading: '科目管理',
        description: '科目为成绩录入的前置数据；已被成绩引用的科目禁止删除。',
        breadcrumbs: [
          { label: '首页', href: '/students' },
          { label: '成绩管理', href: '/scores' },
          { label: '科目管理' },
        ],
      }),
      flash: options.flash ?? resolveFlash(query),
      subjects: listSubjects(db, { search, limit: pagination.pageSize, offset: pagination.offset }),
      pagination,
      search,
      urlFor: pageUrlFactory('/subjects', { q: search }, pagination.pageSize),
    });
  };

  const renderForm = (
    res: Response,
    options: {
      status?: number;
      mode: 'create' | 'edit';
      id?: number;
      values: { name: string };
      errors: Record<string, string>;
      flash: Flash | null;
    },
  ): void => {
    res.status(options.status ?? 200).render('subjects/form', {
      page: formPage(options.mode),
      flash: options.flash,
      mode: options.mode,
      action: options.mode === 'create' ? '/subjects' : `/subjects/${options.id ?? ''}`,
      values: options.values,
      errors: options.errors,
    });
  };

  router.get('/', (req, res) => {
    renderList(req, res);
  });

  router.get('/new', (_req, res) => {
    renderForm(res, { mode: 'create', values: { name: '' }, errors: {}, flash: null });
  });

  router.post('/', (req, res) => {
    const body = req.body as Record<string, unknown>;
    try {
      createSubject(db, body);
      res.redirect(303, toFlashRedirect('/subjects', 'subject-created'));
    } catch (error) {
      if (isHttpError(error) && error.status === 422) {
        renderForm(res, {
          status: 422,
          mode: 'create',
          values: toSubjectFormValues(body),
          errors: error.fieldErrors,
          flash: { type: 'danger', message: error.message },
        });
        return;
      }
      throw error;
    }
  });

  router.get('/:id/edit', (req, res) => {
    const id = readId(req.params.id);
    const row = getSubjectOrThrow(db, id);
    renderForm(res, { mode: 'edit', id, values: { name: row.name }, errors: {}, flash: null });
  });

  router.post('/:id', (req, res) => {
    const id = readId(req.params.id);
    const body = req.body as Record<string, unknown>;
    try {
      updateSubjectById(db, id, body);
      res.redirect(303, toFlashRedirect('/subjects', 'subject-updated'));
    } catch (error) {
      if (isHttpError(error) && error.status === 422) {
        renderForm(res, {
          status: 422,
          mode: 'edit',
          id,
          values: toSubjectFormValues(body),
          errors: error.fieldErrors,
          flash: { type: 'danger', message: error.message },
        });
        return;
      }
      throw error;
    }
  });

  const renderDeleteConfirm = (req: Request, res: Response, status: number, flash: Flash | null): void => {
    const id = readId(req.params.id);
    const row = getSubjectOrThrow(db, id);
    const scoreCount = countScoresForSubject(db, id);
    res.status(status).render('subjects/delete-confirm', {
      page: makePage({
        title: '确认删除科目',
        nav: 'subjects',
        heading: '确认删除科目',
        breadcrumbs: [
          { label: '首页', href: '/students' },
          { label: '成绩管理', href: '/scores' },
          { label: '科目管理', href: '/subjects' },
          { label: '删除确认' },
        ],
      }),
      flash,
      target: row,
      scoreCount,
      canDelete: scoreCount === 0,
    });
  };

  router.get('/:id/delete-confirm', (req, res) => {
    renderDeleteConfirm(req, res, 200, null);
  });

  router.post('/:id/delete', (req, res) => {
    const id = readId(req.params.id);
    try {
      removeSubject(db, id);
      res.redirect(303, toFlashRedirect('/subjects', 'subject-deleted'));
    } catch (error) {
      if (isHttpError(error) && error.status === 409) {
        renderDeleteConfirm(req, res, 409, { type: 'danger', message: error.message });
        return;
      }
      throw error;
    }
  });

  return router;
}
