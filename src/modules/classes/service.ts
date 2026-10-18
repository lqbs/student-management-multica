import { nowIso } from '../../config.js';
import { withTransaction, type Database } from '../../db/index.js';
import { HttpError, type FieldErrors } from '../../shared/errors.js';
import { asText, validateName } from '../../shared/validation.js';
import { countStudentsInClass, findClassByName, getClassById, insertClass, deleteClass, updateClass } from './queries.js';
import type { ClassRow } from './queries.js';

export interface ClassFormValues {
  name: string;
}

export function toClassFormValues(raw: Record<string, unknown>): ClassFormValues {
  return { name: asText(raw.name) };
}

export function parseClassInput(raw: Record<string, unknown>): { values: ClassFormValues; errors: FieldErrors } {
  const nameResult = validateName(raw.name, '班级名称');
  const errors: FieldErrors = {};
  const values: ClassFormValues = { name: asText(raw.name).trim() };
  if (!nameResult.ok) {
    errors.name = nameResult.message;
  } else {
    values.name = nameResult.value;
  }
  return { values, errors };
}

export function getClassOrThrow(db: Database, id: number): ClassRow {
  const row = getClassById(db, id);
  if (!row) {
    throw HttpError.notFound('班级不存在，可能已被删除');
  }
  return row;
}

export function createClass(db: Database, raw: Record<string, unknown>): number {
  const { values, errors } = parseClassInput(raw);
  if (Object.keys(errors).length > 0) {
    throw HttpError.validation(errors, '班级信息有误，请检查后重试');
  }
  if (findClassByName(db, values.name)) {
    throw HttpError.validation({ name: '班级名称已存在，请勿重复添加' });
  }
  return withTransaction(db, () => insertClass(db, { name: values.name, now: nowIso() }));
}

export function updateClassById(db: Database, id: number, raw: Record<string, unknown>): void {
  getClassOrThrow(db, id);
  const { values, errors } = parseClassInput(raw);
  if (Object.keys(errors).length > 0) {
    throw HttpError.validation(errors, '班级信息有误，请检查后重试');
  }
  if (findClassByName(db, values.name, id)) {
    throw HttpError.validation({ name: '班级名称已存在，请勿重复添加' });
  }
  withTransaction(db, () => updateClass(db, { id, name: values.name, now: nowIso() }));
}

/** 删除班级：仍有关联学生时一律拒绝（外键 ON DELETE RESTRICT 为最后防线）。 */
export function removeClass(db: Database, id: number): { name: string; studentCount: number } {
  const row = getClassOrThrow(db, id);
  const studentCount = countStudentsInClass(db, id);
  if (studentCount > 0) {
    throw HttpError.conflict(
      `无法删除该班级：该班级目前共有 ${studentCount} 名学生，请先在学生档案中转班或取消分班后再删除。`,
      { studentCount },
    );
  }
  withTransaction(db, () => deleteClass(db, id));
  return { name: row.name, studentCount };
}
