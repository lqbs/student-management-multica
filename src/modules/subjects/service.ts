import { nowIso } from '../../config.js';
import { withTransaction, type Database } from '../../db/index.js';
import { HttpError, type FieldErrors } from '../../shared/errors.js';
import { asText, validateName } from '../../shared/validation.js';
import {
  countScoresForSubject,
  deleteSubject,
  findSubjectByName,
  getSubjectById,
  insertSubject,
  updateSubject,
} from './queries.js';
import type { SubjectRow } from './queries.js';

export interface SubjectFormValues {
  name: string;
}

export function toSubjectFormValues(raw: Record<string, unknown>): SubjectFormValues {
  return { name: asText(raw.name) };
}

export function parseSubjectInput(raw: Record<string, unknown>): { values: SubjectFormValues; errors: FieldErrors } {
  const nameResult = validateName(raw.name, '科目名称');
  const errors: FieldErrors = {};
  const values: SubjectFormValues = { name: asText(raw.name).trim() };
  if (!nameResult.ok) {
    errors.name = nameResult.message;
  } else {
    values.name = nameResult.value;
  }
  return { values, errors };
}

export function getSubjectOrThrow(db: Database, id: number): SubjectRow {
  const row = getSubjectById(db, id);
  if (!row) {
    throw HttpError.notFound('科目不存在，可能已被删除');
  }
  return row;
}

export function createSubject(db: Database, raw: Record<string, unknown>): number {
  const { values, errors } = parseSubjectInput(raw);
  if (Object.keys(errors).length > 0) {
    throw HttpError.validation(errors, '科目信息有误，请检查后重试');
  }
  if (findSubjectByName(db, values.name)) {
    throw HttpError.validation({ name: '科目名称已存在，请勿重复添加' });
  }
  return withTransaction(db, () => insertSubject(db, { name: values.name, now: nowIso() }));
}

export function updateSubjectById(db: Database, id: number, raw: Record<string, unknown>): void {
  getSubjectOrThrow(db, id);
  const { values, errors } = parseSubjectInput(raw);
  if (Object.keys(errors).length > 0) {
    throw HttpError.validation(errors, '科目信息有误，请检查后重试');
  }
  if (findSubjectByName(db, values.name, id)) {
    throw HttpError.validation({ name: '科目名称已存在，请勿重复添加' });
  }
  withTransaction(db, () => updateSubject(db, { id, name: values.name, now: nowIso() }));
}

/** 删除科目：已有关联成绩时拒绝，避免历史成绩脱靶（外键 ON DELETE RESTRICT 兜底）。 */
export function removeSubject(db: Database, id: number): { name: string; scoreCount: number } {
  const row = getSubjectOrThrow(db, id);
  const scoreCount = countScoresForSubject(db, id);
  if (scoreCount > 0) {
    throw HttpError.conflict(
      `无法删除科目：该科目已包含 ${scoreCount} 条成绩记录。为保留历史成绩，请改为编辑科目名称。`,
      { scoreCount },
    );
  }
  withTransaction(db, () => deleteSubject(db, id));
  return { name: row.name, scoreCount };
}
