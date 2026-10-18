/**
 * 纯校验函数：不依赖 Express、模板与数据库，便于单元测试与复用。
 * 服务端一律重新校验，前端 required/min/max 仅作为输入辅助。
 */

export const STUDENT_NO_MAX = 32;
export const NAME_MAX = 50;
export const SEARCH_MAX = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function asText(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return String(raw);
  }
  return '';
}

/** 学号规范化：去首尾空白并转大写，前导零作为字符串完整保留。 */
export function normalizeStudentNo(raw: unknown): string {
  return asText(raw).trim().toUpperCase();
}

export function validateStudentNo(raw: unknown): ParseResult<string> {
  const value = normalizeStudentNo(raw);
  if (value.length === 0) {
    return { ok: false, message: '该字段为必填项' };
  }
  if (value.length > STUDENT_NO_MAX) {
    return { ok: false, message: `学号长度不能超过 ${STUDENT_NO_MAX} 个字符` };
  }
  if (!/^[A-Z0-9-]+$/.test(value)) {
    return { ok: false, message: '学号只能包含字母、数字和连字符（-）' };
  }
  return { ok: true, value };
}

export function validateName(raw: unknown, label = '名称'): ParseResult<string> {
  const value = asText(raw).trim();
  if (value.length === 0) {
    return { ok: false, message: '该字段为必填项' };
  }
  if ([...value].length > NAME_MAX) {
    return { ok: false, message: `${label}长度不能超过 ${NAME_MAX} 个字符` };
  }
  return { ok: true, value };
}

const UNASSIGNED_VALUES = new Set(['', 'unassigned', 'none', 'null']);

/** 班级 ID：空值表示“未分班”，否则要求正整数 ID。 */
export function validateClassId(raw: unknown): ParseResult<number | null> {
  const value = asText(raw).trim();
  if (UNASSIGNED_VALUES.has(value.toLowerCase())) {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(value)) {
    return { ok: false, message: '请选择合法的班级' };
  }
  const id = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, message: '请选择合法的班级' };
  }
  return { ok: true, value: id };
}

/**
 * 列表筛选用的班级参数：空/非法 → 全部（null），"unassigned" → 未分班，正整数 → 班级 ID。
 */
export function parseClassIdFilter(raw: unknown): number | 'unassigned' | null {
  const value = asText(raw).trim();
  if (value.length === 0 || value.toLowerCase() === 'all') {
    return null;
  }
  if (value.toLowerCase() === 'unassigned') {
    return 'unassigned';
  }
  if (!/^\d+$/.test(value)) {
    return null;
  }
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function validatePositiveId(raw: unknown, label = '记录'): ParseResult<number> {
  const value = asText(raw).trim();
  if (!/^\d+$/.test(value)) {
    return { ok: false, message: `请选择合法的${label}` };
  }
  const id = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, message: `请选择合法的${label}` };
  }
  return { ok: true, value: id };
}

/**
 * 成绩校验：接受 0–100（含边界）、最多一位小数；拒绝空值、负数、超范围、
 * 科学计数法（1e2）、多位小数与其它非十进制文本。返回“十分值”整数，避免浮点近似。
 */
export function validateScore(raw: unknown): ParseResult<number> {
  const text = asText(raw).trim();
  if (text.length === 0) {
    return { ok: false, message: '该字段为必填项' };
  }
  if (!/^\d{1,3}(\.\d)?$/.test(text)) {
    return { ok: false, message: '请输入 0-100 之间且最多一位小数的数值' };
  }
  const [intPart = '0', decimalPart = ''] = text.split('.');
  const tenths = Number.parseInt(intPart, 10) * 10 + (decimalPart ? Number.parseInt(decimalPart, 10) : 0);
  if (tenths < 0 || tenths > 1000) {
    return { ok: false, message: '请输入 0-100 之间且最多一位小数的数值' };
  }
  return { ok: true, value: tenths };
}

/** 十分值转展示文本：0 → "0"，100 → "100"，98.5 → "98.5"。 */
export function formatScore(tenths: number): string {
  const text = (tenths / 10).toFixed(1);
  return text.endsWith('.0') ? text.slice(0, -2) : text;
}

export function scoreLevel(tenths: number): 'danger' | 'success' | 'plain' {
  if (tenths < 600) {
    return 'danger';
  }
  if (tenths >= 900) {
    return 'success';
  }
  return 'plain';
}

/** 搜索关键字：trim 并限制长度，避免超长 LIKE 查询。 */
export function normalizeSearch(raw: unknown): string {
  const value = asText(raw).trim();
  return value.length > SEARCH_MAX ? value.slice(0, SEARCH_MAX) : value;
}

/** 转义 LIKE 中的 % 与 _，使其按普通字符匹配（配合 ESCAPE '\' 使用）。 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (match) => `\\${match}`);
}

export function likePattern(search: string): string {
  return `%${escapeLike(search)}%`;
}

export function parsePageParam(raw: unknown): number {
  const value = asText(raw).trim();
  if (!/^\d+$/.test(value)) {
    return 1;
  }
  const page = Number.parseInt(value, 10);
  return page >= 1 ? page : 1;
}

export function parsePageSizeParam(raw: unknown): number {
  const value = asText(raw).trim();
  if (!/^\d+$/.test(value)) {
    return DEFAULT_PAGE_SIZE;
  }
  const size = Number.parseInt(value, 10);
  if (size < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(size, MAX_PAGE_SIZE);
}
