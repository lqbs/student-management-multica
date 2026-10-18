import crypto from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { HttpError } from './errors.js';
import { DEFAULT_PAGE_SIZE, parsePageParam, parsePageSizeParam } from './validation.js';

export const CSRF_COOKIE = 'csrf_token';
export const CSRF_FIELD = '_csrf';

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) {
      continue;
    }
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  }
  return cookies;
}

/**
 * CSRF 防护：双提交 Cookie。GET 请求下发随机 token，表单以隐藏字段回传，
 * POST 请求比对两者；本地同源演示系统无需服务端会话存储。
 */
export function csrfProtection(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookies = parseCookies(req.headers.cookie);
    let token = cookies[CSRF_COOKIE];
    if (!token || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
      token = crypto.randomBytes(24).toString('base64url');
      res.cookie(CSRF_COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/' });
    }
    res.locals.csrfToken = token;

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const submitted = typeof body[CSRF_FIELD] === 'string' ? (body[CSRF_FIELD] as string) : '';
      if (!submitted || submitted !== token) {
        return next(HttpError.forbidden('表单校验失败（CSRF），请返回页面刷新后重试。'));
      }
    }
    return next();
  };
}

export interface Pagination {
  page: number;
  pageSize: number;
  offset: number;
  total: number;
  totalPages: number;
  hasPrev: boolean;
  hasNext: boolean;
  from: number;
  to: number;
}

/** 计算分页信息，并把越界页码收敛到最后一页。 */
export function resolvePagination(total: number, requestedPage: number, pageSize: number): Pagination {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;
  return {
    page,
    pageSize,
    offset,
    total,
    totalPages,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    from: total === 0 ? 0 : offset + 1,
    to: Math.min(offset + pageSize, total),
  };
}

export function readPagination(query: Record<string, unknown>, total: number): Pagination {
  return resolvePagination(total, parsePageParam(query.page), parsePageSizeParam(query.pageSize));
}

/** 构造保留筛选条件的 URL；空值不写入查询串。 */
export function buildUrl(basePath: string, params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    const text = String(value);
    if (text === '') {
      continue;
    }
    search.append(key, text);
  }
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

/** 生成分页链接构造函数：翻页时保留 q / classId / subjectId / pageSize 等筛选参数。 */
export function pageUrlFactory(
  basePath: string,
  params: Record<string, string | number | null | undefined>,
  pageSize: number,
): (page: number) => string {
  return (page: number) =>
    buildUrl(basePath, {
      ...params,
      pageSize: pageSize === DEFAULT_PAGE_SIZE ? undefined : pageSize,
      page,
    });
}

export function toFlashRedirect(path: string, code: string, params: Record<string, string | number | null | undefined> = {}): string {
  return buildUrl(path, { ...params, flash: code });
}
