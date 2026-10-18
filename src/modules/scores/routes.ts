import { Router, type Request, type Response } from 'express';

import type { Database } from '../../db/index.js';
import { HttpError, isHttpError } from '../../shared/errors.js';
import { pageUrlFactory, readPagination, toFlashRedirect } from '../../shared/http.js';
import { formatScore, normalizeSearch, parseClassIdFilter, validatePositiveId } from '../../shared/validation.js';
import { makePage, resolveFlash, type Flash, type PageMeta } from '../../shared/view.js';
import { listClassOptions } from '../classes/queries.js';
import { listStudentOptions } from '../students/queries.js';
import { listSubjectOptions } from '../subjects/queries.js';
import { countScores, getScoreWithRelations, listScores } from './queries.js';
import { createScore, getScoreOrThrow, removeScore, toScoreFormValues, updateScoreById } from './service.js';

function readId(raw: unknown): number {
  const result = validatePositiveId(raw, '成绩');
  if (!result.ok) {
    throw HttpError.notFound('成绩记录不存在或已被删除');
  }
  return result.value;
}

function formPage(mode: 'create' | 'edit'): PageMeta {
  return makePage({
    title: mode === 'create' ? '录入成绩' : '编辑成绩',
    nav: 'scores',
    heading: mode === 'create' ? '录入成绩' : '编辑成绩',
    description: '成绩范围 0-100，最多一位小数；每位学生每科只保留一条当前成绩。',
    breadcrumbs: [
      { label: '首页', href: '/students' },
      { label: '成绩管理', href: '/scores' },
      { label: mode === 'create' ? '录入成绩' : '编辑成绩' },
    ],
  });
}

export function createScoresRouter(db: Database): Router {
  const router = Router();

  const renderList = (req: Request, res: Response, options: { status?: number; flash?: Flash | null } = {}): void => {
    const query = req.query as Record<string, unknown>;
    const search = normalizeSearch(query.q);
    const classFilter = parseClassIdFilter(query.classId);
    const subjectResult = validatePositiveId(query.subjectId, '科目');
    const subjectFilter = subjectResult.ok && String(query.subjectId ?? '').trim() !== '' ? subjectResult.value : null;

    const total = countScores(db, { search, classId: classFilter, subjectId: subjectFilter });
    const pagination = readPagination(query, total);
    res.status(options.status ?? 200).render('scores/list', {
      page: makePage({
        title: '成绩管理',
        nav: 'scores',
        heading: '成绩管理',
        description: '按学生、班级与科目组合筛选成绩；支持录入、编辑与删除当前成绩。',
        breadcrumbs: [{ label: '首页', href: '/students' }, { label: '成绩管理' }],
      }),
      flash: options.flash ?? resolveFlash(query),
      scores: listScores(db, {
        search,
        classId: classFilter,
        subjectId: subjectFilter,
        limit: pagination.pageSize,
        offset: pagination.offset,
      }),
      classes: listClassOptions(db),
      subjects: listSubjectOptions(db),
      search,
      classFilter,
      subjectFilter,
      pagination,
      urlFor: pageUrlFactory(
        '/scores',
        {
          q: search,
          classId: classFilter === null ? undefined : String(classFilter),
          subjectId: subjectFilter ?? undefined,
        },
        pagination.pageSize,
      ),
    });
  };

  const renderForm = (
    res: Response,
    options: {
      status?: number;
      mode: 'create' | 'edit';
      id?: number;
      values: { student_id: string; subject_id: string; score: string };
      errors: Record<string, string>;
      flash: Flash | null;
      conflictEditUrl?: string | null;
    },
  ): void => {
    res.status(options.status ?? 200).render('scores/form', {
      page: formPage(options.mode),
      flash: options.flash,
      mode: options.mode,
      action: options.mode === 'create' ? '/scores' : `/scores/${options.id ?? ''}`,
      values: options.values,
      errors: options.errors,
      students: listStudentOptions(db),
      subjects: listSubjectOptions(db),
      conflictEditUrl: options.conflictEditUrl ?? null,
    });
  };

  router.get('/', (req, res) => {
    renderList(req, res);
  });

  router.get('/new', (req, res) => {
    const presetStudent = validatePositiveId(req.query.studentId, '学生');
    renderForm(res, {
      mode: 'create',
      values: {
        student_id: presetStudent.ok ? String(presetStudent.value) : '',
        subject_id: '',
        score: '',
      },
      errors: {},
      flash: null,
    });
  });

  router.post('/', (req, res) => {
    const body = req.body as Record<string, unknown>;
    try {
      createScore(db, body);
      res.redirect(303, toFlashRedirect('/scores', 'score-created'));
    } catch (error) {
      if (isHttpError(error) && error.status === 422) {
        renderForm(res, {
          status: 422,
          mode: 'create',
          values: toScoreFormValues(body),
          errors: error.fieldErrors,
          flash: { type: 'danger', message: error.message },
        });
        return;
      }
      if (isHttpError(error) && error.status === 409) {
        renderForm(res, {
          status: 409,
          mode: 'create',
          values: toScoreFormValues(body),
          errors: {},
          flash: { type: 'danger', message: error.message },
          conflictEditUrl: typeof error.meta.editUrl === 'string' ? error.meta.editUrl : null,
        });
        return;
      }
      throw error;
    }
  });

  router.get('/:id/edit', (req, res) => {
    const id = readId(req.params.id);
    const row = getScoreOrThrow(db, id);
    renderForm(res, {
      mode: 'edit',
      id,
      values: {
        student_id: String(row.student_id),
        subject_id: String(row.subject_id),
        score: formatScore(row.score_tenths),
      },
      errors: {},
      flash: null,
    });
  });

  router.post('/:id', (req, res) => {
    const id = readId(req.params.id);
    const body = req.body as Record<string, unknown>;
    try {
      updateScoreById(db, id, body);
      res.redirect(303, toFlashRedirect('/scores', 'score-updated'));
    } catch (error) {
      if (isHttpError(error) && error.status === 422) {
        renderForm(res, {
          status: 422,
          mode: 'edit',
          id,
          values: toScoreFormValues(body),
          errors: error.fieldErrors,
          flash: { type: 'danger', message: error.message },
        });
        return;
      }
      if (isHttpError(error) && error.status === 409) {
        renderForm(res, {
          status: 409,
          mode: 'edit',
          id,
          values: toScoreFormValues(body),
          errors: {},
          flash: { type: 'danger', message: error.message },
          conflictEditUrl: typeof error.meta.editUrl === 'string' ? error.meta.editUrl : null,
        });
        return;
      }
      throw error;
    }
  });

  const renderDeleteConfirm = (req: Request, res: Response, status: number, flash: Flash | null): void => {
    const id = readId(req.params.id);
    getScoreOrThrow(db, id);
    const detail = getScoreWithRelations(db, id);
    res.status(status).render('scores/delete-confirm', {
      page: makePage({
        title: '确认删除成绩',
        nav: 'scores',
        heading: '确认删除成绩',
        breadcrumbs: [
          { label: '首页', href: '/students' },
          { label: '成绩管理', href: '/scores' },
          { label: '删除确认' },
        ],
      }),
      flash,
      target: detail,
    });
  };

  router.get('/:id/delete-confirm', (req, res) => {
    renderDeleteConfirm(req, res, 200, null);
  });

  router.post('/:id/delete', (req, res) => {
    const id = readId(req.params.id);
    try {
      removeScore(db, id);
      res.redirect(303, toFlashRedirect('/scores', 'score-deleted'));
    } catch (error) {
      if (isHttpError(error) && error.status === 404) {
        renderList(req, res, { status: 404, flash: { type: 'danger', message: error.message } });
        return;
      }
      throw error;
    }
  });

  return router;
}
