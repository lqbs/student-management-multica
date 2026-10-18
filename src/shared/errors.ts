export type FieldErrors = Record<string, string>;

/**
 * 带 HTTP 状态语义的业务异常：
 * - 422 表单校验失败（保留输入并内联提示）
 * - 409 关联冲突（唯一键、被引用删除、删除保护）
 * - 404 记录不存在
 */
export class HttpError extends Error {
  readonly status: number;
  readonly fieldErrors: FieldErrors;
  readonly meta: Record<string, unknown>;

  constructor(status: number, message: string, options: { fieldErrors?: FieldErrors; meta?: Record<string, unknown> } = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.fieldErrors = options.fieldErrors ?? {};
    this.meta = options.meta ?? {};
  }

  static validation(fieldErrors: FieldErrors, message = '输入有误，请检查后重试'): HttpError {
    return new HttpError(422, message, { fieldErrors });
  }

  static conflict(message: string, meta: Record<string, unknown> = {}): HttpError {
    return new HttpError(409, message, { meta });
  }

  static notFound(message = '记录不存在，可能已被删除'): HttpError {
    return new HttpError(404, message);
  }

  static forbidden(message = '请求校验失败，请刷新页面后重试'): HttpError {
    return new HttpError(403, message);
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError;
}
