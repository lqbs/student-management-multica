export interface Breadcrumb {
  label: string;
  href?: string;
}

export type NavKey = 'students' | 'classes' | 'subjects' | 'scores';

export interface PageMeta {
  title: string;
  nav: NavKey;
  heading: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
}

export function makePage(meta: PageMeta): PageMeta {
  return meta;
}

export type FlashType = 'success' | 'danger' | 'info' | 'warning';

export interface Flash {
  type: FlashType;
  message: string;
}

/** 重定向成功提示：使用 flash 编码避免在 URL 中携带中文与自由文本。 */
export const FLASH_MESSAGES: Record<string, Flash> = {
  'student-created': { type: 'success', message: '学生档案保存成功' },
  'student-updated': { type: 'success', message: '学生档案更新成功' },
  'student-deleted': { type: 'success', message: '学生档案删除成功，该学生名下的成绩记录已同步删除' },
  'class-created': { type: 'success', message: '班级创建成功' },
  'class-updated': { type: 'success', message: '班级更新成功' },
  'class-deleted': { type: 'success', message: '班级删除成功' },
  'subject-created': { type: 'success', message: '科目创建成功' },
  'subject-updated': { type: 'success', message: '科目更新成功' },
  'subject-deleted': { type: 'success', message: '科目删除成功' },
  'score-created': { type: 'success', message: '成绩录入成功' },
  'score-updated': { type: 'success', message: '成绩更新成功' },
  'score-deleted': { type: 'success', message: '成绩删除成功' },
};

export function resolveFlash(query: Record<string, unknown>): Flash | null {
  const code = typeof query.flash === 'string' ? query.flash : '';
  return FLASH_MESSAGES[code] ?? null;
}

/** 时间统一以本地时区展示（数据库存 UTC ISO 字符串）。 */
export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
