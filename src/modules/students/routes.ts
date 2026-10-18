import { Router, type Request, type Response } from 'express';

import type { Database } from '../../db/index.js';
import { HttpError, isHttpError } from '../../shared/errors.js';
import { pageUrlFactory, readPagination, toFlashRedirect } from '../../shared/http.js';
import { normalizeSearch, parseClassIdFilter, validatePositiveId } from '../../shared/validation.js';
import { makePage, resolveFlash, type Flash, type PageMeta } from '../../shared/view.js';
import { listClassOptions } from '../classes/queries.js';
import { listScoresByStudent } from '../scores/queries.js';
import { countStudents, getStudentDetailById, listStudents } from './queries.js';
import {
  createStudent,
  getStudentOrThrow,
  removeStudent,
  toStudentFormValues,
  updateStudentById,
} from './service.js';

function readId(raw: unknown): number {
  const result = validatePositiveId(raw, '学生');
  if (!result.ok) {
    throw HttpError.notFound('学生不存在或已被删除');
  }
  return result.value;
}

function formPage(mode: 'create' | 'edit'): PageMeta {
  return makePage({
    title: mode === 'create' ? '新建学生' : '编辑学生',
    nav: 'students',
    heading: mode === 'create' ? '新建学生' : '编辑学生',
    description: '学号 1-32 位字母、数字或连字符，自动转大写并保留前导零；姓名 1-50 个字符。',
    breadcrumbs: [
      { label: '首页', href: '/students' },
      { label: '学生档案', href: '/students' },
      { label: mode === 'create' ? '新建学生' : '编辑学生' },
    ],
  });
}

export function createStudentsRouter(db: Database): Router {
  const router = Router();

  const renderList = (req: Request, res: Response, options: { status?: number; flash?: Flash | null } = {}): void => {
    const query = req.query as Record<string, unknown>;
    const search = normalizeSearch(query.q);
    const classFilter = parseClassIdFilter(query.classId);
    const total = countStudents(db, { search, classId: classFilter });
    const pagination = readPagination(query, total);
    res.status(options.status ?? 200).render('students/list', {
      page: makePage({
        title: '学生档案',
        nav: 'students',
        heading: '学生档案',
        description: '管理全校注册学生档案及所在班级关联；支持按学号 / 姓名与班级组合筛选。',
        breadcrumbs: [{ label: '首页', href: '/students' }, { label: '学生档案' }],
      }),
      flash: options.flash ?? resolveFlash(query),
      students: listStudents(db, { search, classId: classFilter, limit: pagination.pageSize, offset: pagination.offset }),
      classes: listClassOptions(db),
      search,
      classFilter,
      pagination,
      urlFor: pageUrlFactory(
        '/students',
        { q: search, classId: classFilter === null ? undefined : String(classFilter) },
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
      values: { student_no: string; name: string; class_id: string };
      errors: Record<string, string>;
      flash: Flash | null;
    },
  ): void => {
    res.status(options.status ?? 200).render('students/form', {
      page: formPage(options.mode),
      flash: options.flash,
      mode: options.mode,
      action: options.mode === 'create' ? '/students' : `/students/${options.id ?? ''}`,
      values: options.values,
      errors: options.errors,
      classes: listClassOptions(db),
    });
  };

  router.get('/', (req, res) => {
    renderList(req, res);
  });

  router.get('/new', (_req, res) => {
    renderForm(res, { mode: 'create', values: { student_no: '', name: '', class_id: '' }, errors: {}, flash: null });
  });

  router.post('/', (req, res) => {
    const body = req.body as Record<string, unknown>;
    try {
      createStudent(db, body);
      res.redirect(303, toFlashRedirect('/students', 'student-created'));
    } catch (error) {
      if (isHttpError(error) && error.status === 422) {
        renderForm(res, {
          status: 422,
          mode: 'create',
          values: toStudentFormValues(body),
          errors: error.fieldErrors,
          flash: { type: 'danger', message: error.message },
        });
        return;
      }
      throw error;
    }
  });

  router.get('/:id', (req, res) => {
    const id = readId(req.params.id);
    const student = getStudentDetailById(db, id);
    if (!student) {
      throw HttpError.notFound('学生不存在，可能已被删除');
    }
    const scores = listScoresByStudent(db, id);
    res.render('students/detail', {
      page: makePage({
        title: `${student.name} 的档案`,
        nav: 'students',
        heading: `${student.name} 的档案`,
        description: '学生基本信息与已修科目成绩；删除学生将同步删除其成绩记录。',
        breadcrumbs: [
          { label: '首页', href: '/students' },
          { label: '学生档案', href: '/students' },
          { label: student.name },
        ],
      }),
      flash: resolveFlash(req.query as Record<string, unknown>),
      student,
      scores,
    });
  });

  router.get('/:id/edit', (req, res) => {
    const id = readId(req.params.id);
    const student = getStudentOrThrow(db, id);
    renderForm(res, {
      mode: 'edit',
      id,
      values: {
        student_no: student.student_no,
        name: student.name,
        class_id: student.class_id === null ? '' : String(student.class_id),
      },
      errors: {},
      flash: null,
    });
  });

  router.post('/:id', (req, res) => {
    const id = readId(req.params.id);
    const body = req.body as Record<string, unknown>;
    try {
      updateStudentById(db, id, body);
      res.redirect(303, toFlashRedirect('/students', 'student-updated'));
    } catch (error) {
      if (isHttpError(error) && error.status === 422) {
        renderForm(res, {
          status: 422,
          mode: 'edit',
          id,
          values: toStudentFormValues(body),
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
    const student = getStudentDetailById(db, id);
    if (!student) {
      throw HttpError.notFound('学生不存在，可能已被删除');
    }
    res.status(status).render('students/delete-confirm', {
      page: makePage({
        title: '确认删除学生',
        nav: 'students',
        heading: '确认删除学生',
        breadcrumbs: [
          { label: '首页', href: '/students' },
          { label: '学生档案', href: '/students' },
          { label: student.name },
          { label: '删除确认' },
        ],
      }),
      flash,
      target: student,
      scoreCount: student.score_count,
      scores: listScoresByStudent(db, id),
    });
  };

  router.get('/:id/delete-confirm', (req, res) => {
    renderDeleteConfirm(req, res, 200, null);
  });

  router.post('/:id/delete', (req, res) => {
    const id = readId(req.params.id);
    try {
      removeStudent(db, id);
      res.redirect(303, toFlashRedirect('/students', 'student-deleted'));
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
