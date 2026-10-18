import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { DatabaseSync } from 'node:sqlite';

import { publicDir, viewsDir } from './config.js';
import { createClassesRouter } from './modules/classes/routes.js';
import { createScoresRouter } from './modules/scores/routes.js';
import { createStudentsRouter } from './modules/students/routes.js';
import { createSubjectsRouter } from './modules/subjects/routes.js';
import { HttpError, isHttpError } from './shared/errors.js';
import { csrfProtection } from './shared/http.js';
import { formatScore, scoreLevel } from './shared/validation.js';
import { formatDateTime, makePage } from './shared/view.js';

export interface AppOptions {
  db: DatabaseSync;
}

export function createApp({ db }: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', viewsDir);

  // 所有模板共用的小工具
  app.locals.formatDateTime = formatDateTime;
  app.locals.formatScore = formatScore;
  app.locals.scoreLevel = scoreLevel;

  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(publicDir));
  app.use(csrfProtection());

  app.get('/', (_req, res) => {
    res.redirect(302, '/students');
  });

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/students', createStudentsRouter(db));
  app.use('/classes', createClassesRouter(db));
  app.use('/subjects', createSubjectsRouter(db));
  app.use('/scores', createScoresRouter(db));

  app.use((req: Request, res: Response) => {
    res.status(404).render('errors/error', {
      page: makePage({
        title: '页面不存在',
        nav: 'students',
        heading: '页面不存在（404）',
        breadcrumbs: [{ label: '首页', href: '/students' }],
      }),
      flash: null,
      status: 404,
      message: `没有找到地址 ${req.method} ${req.path} 对应的页面。`,
    });
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    if (isHttpError(error)) {
      res.status(error.status).render('errors/error', {
        page: makePage({
          title: `请求未能完成（${error.status}）`,
          nav: 'students',
          heading: `请求未能完成（${error.status}）`,
          breadcrumbs: [{ label: '首页', href: '/students' }],
        }),
        flash: null,
        status: error.status,
        message: error.message,
      });
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error('[student-management] 未处理的服务端错误:', error);
    res.status(500).render('errors/error', {
      page: makePage({
        title: '服务器内部错误',
        nav: 'students',
        heading: '服务器内部错误（500）',
        breadcrumbs: [{ label: '首页', href: '/students' }],
      }),
      flash: null,
      status: 500,
      message: `操作未完成：${message}。数据未被修改，请返回重试。`,
    });
  });

  return app;
}

export { HttpError };
