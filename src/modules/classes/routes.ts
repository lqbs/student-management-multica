import { Router, type Request, type Response } from 'express';

import type { Database } from '../../db/index.js';
import { HttpError, isHttpError } from '../../shared/errors.js';
import { pageUrlFactory, readPagination, toFlashRedirect } from '../../shared/http.js';
import { normalizeSearch, validatePositiveId } from '../../shared/validation.js';
import { makePage, resolveFlash, type Flash } from '../../shared/view.js';
import { countClasses, countStudentsInClass, listClasses } from './queries.js';
import { createClass, getClassOrThrow, removeClass, toClassFormValues, updateClassById } from './service.js';

const LIST_PAGE = { title: '班级管理', heading: '班级管理' } as const;

function readId(raw: unknown): number {
  const result = validatePositiveId(raw, '班级');
  if (!result.ok) {
    throw HttpError.notFound('班级不存在或已被删除');
  }
  return result.value;
}

function formPage(mode: 'create' | 'edit') {
  return makePage({
    title: mode === 'create' ? '新建班级' : '编辑班级',
    nav: 'classes',
    heading: mode === 'create' ? '新建班级' : '编辑班级',
    description: mode === 'create' ? '班级名称必填，1-50 个字符且不可重名。' : '修改班级名称，不会影响已关联的学生。',
    breadcrumbs: [
      { label: '首页', href: '/students' },
      { label: '班级管理', href: '/classes' },
      { label: mode === 'create' ? '新建班级' : '编辑班级' },
    ],
  });
}

export function createClassesRouter(db: Database): Router {
  const router = Router();

  const renderList = (req: Request, res: Response, options: { status?: number; flash?: Flash | null; search?: string } = {}): void => {
    const query = req.query as Record<string, unknown>;
    const search = options.search ?? normalizeSearch(query.q);
    const total = countClasses(db, { search });
    const pagination = readPagination(query, total);
    res.status(options.status ?? 200).render('classes/list', {
      page: makePage({
        title: LIST_PAGE.title,
        nav: 'classes',
        heading: LIST_PAGE.heading,
        description: '班级列表展示在读学生人数；包含学生的班级禁止删除，需先转班或取消分班。',
        breadcrumbs: [{ label: '首页', href: '/students' }, { label: '班级管理' }],
      }),
      flash: options.flash ?? resolveFlash(query),
      classes: listClasses(db, { search, limit: pagination.pageSize, offset: pagination.offset }),
      pagination,
      search,
      urlFor: pageUrlFactory('/classes', { q: search }, pagination.pageSize),
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
    res.status(options.status ?? 200).render('classes/form', {
      page: formPage(options.mode),
      flash: options.flash,
      mode: options.mode,
      action: options.mode === 'create' ? '/classes' : `/classes/${options.id ?? ''}`,
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
      createClass(db, body);
      res.redirect(303, toFlashRedirect('/classes', 'class-created'));
    } catch (error) {
      if (isHttpError(error) && error.status === 422) {
        renderForm(res, {
          status: 422,
          mode: 'create',
          values: toClassFormValues(body),
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
    const row = getClassOrThrow(db, id);
    renderForm(res, { mode: 'edit', id, values: { name: row.name }, errors: {}, flash: null });
  });

  router.post('/:id', (req, res) => {
    const id = readId(req.params.id);
    const body = req.body as Record<string, unknown>;
    try {
      updateClassById(db, id, body);
      res.redirect(303, toFlashRedirect('/classes', 'class-updated'));
    } catch (error) {
      if (isHttpError(error) && error.status === 422) {
        renderForm(res, {
          status: 422,
          mode: 'edit',
          id,
          values: toClassFormValues(body),
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
    const row = getClassOrThrow(db, id);
    const studentCount = countStudentsInClass(db, id);
    res.status(status).render('classes/delete-confirm', {
      page: makePage({
        title: '确认删除班级',
        nav: 'classes',
        heading: '确认删除班级',
        breadcrumbs: [
          { label: '首页', href: '/students' },
          { label: '班级管理', href: '/classes' },
          { label: '删除确认' },
        ],
      }),
      flash,
      target: row,
      studentCount,
      canDelete: studentCount === 0,
    });
  };

  router.get('/:id/delete-confirm', (req, res) => {
    renderDeleteConfirm(req, res, 200, null);
  });

  router.post('/:id/delete', (req, res) => {
    const id = readId(req.params.id);
    try {
      removeClass(db, id);
      res.redirect(303, toFlashRedirect('/classes', 'class-deleted'));
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
