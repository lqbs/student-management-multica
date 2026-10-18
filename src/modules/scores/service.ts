import { nowIso } from '../../config.js';
import { withTransaction, type Database } from '../../db/index.js';
import { HttpError, type FieldErrors } from '../../shared/errors.js';
import { asText, formatScore, validatePositiveId, validateScore } from '../../shared/validation.js';
import { getStudentById } from '../students/queries.js';
import { getSubjectById } from '../subjects/queries.js';
import { deleteScore, findScoreByStudentAndSubject, getScoreById, insertScore, updateScore } from './queries.js';
import type { ScoreRow } from './queries.js';

export interface ScoreFormValues {
  student_id: string;
  subject_id: string;
  score: string;
}

export interface ScoreInput {
  studentId: number;
  subjectId: number;
  scoreTenths: number;
}

export function toScoreFormValues(raw: Record<string, unknown>): ScoreFormValues {
  return {
    student_id: asText(raw.student_id),
    subject_id: asText(raw.subject_id),
    score: asText(raw.score),
  };
}

export function parseScoreInput(
  db: Database,
  raw: Record<string, unknown>,
  options: { excludeId?: number } = {},
): { values: ScoreInput; errors: FieldErrors } {
  const studentResult = validatePositiveId(raw.student_id, '学生');
  const subjectResult = validatePositiveId(raw.subject_id, '科目');
  const scoreResult = validateScore(raw.score);

  const errors: FieldErrors = {};
  const values: ScoreInput = { studentId: 0, subjectId: 0, scoreTenths: 0 };

  if (!studentResult.ok) {
    errors.student_id = studentResult.message;
  } else {
    values.studentId = studentResult.value;
    if (!getStudentById(db, values.studentId)) {
      errors.student_id = '所选学生不存在，请重新选择';
    }
  }
  if (!subjectResult.ok) {
    errors.subject_id = subjectResult.message;
  } else {
    values.subjectId = subjectResult.value;
    if (!getSubjectById(db, values.subjectId)) {
      errors.subject_id = '所选科目不存在，请重新选择';
    }
  }
  if (!scoreResult.ok) {
    errors.score = scoreResult.message;
  } else {
    values.scoreTenths = scoreResult.value;
  }

  if (!errors.student_id && !errors.subject_id) {
    const existing = findScoreByStudentAndSubject(db, values.studentId, values.subjectId, options.excludeId);
    if (existing) {
      const student = getStudentById(db, values.studentId);
      const subject = getSubjectById(db, values.subjectId);
      throw HttpError.conflict(
        `成绩记录已存在：学生 ${student?.name ?? ''}（学号 ${student?.student_no ?? ''}）的 ${subject?.name ?? ''} 成绩已录入为 ${formatScore(existing.score_tenths)} 分。无需重复新增，可直接编辑该成绩记录。`,
        { editUrl: `/scores/${existing.id}/edit`, scoreId: existing.id },
      );
    }
  }

  return { values, errors };
}

export function getScoreOrThrow(db: Database, id: number): ScoreRow {
  const row = getScoreById(db, id);
  if (!row) {
    throw HttpError.notFound('成绩记录不存在，可能已被删除');
  }
  return row;
}

export function createScore(db: Database, raw: Record<string, unknown>): number {
  const { values, errors } = parseScoreInput(db, raw);
  if (Object.keys(errors).length > 0) {
    throw HttpError.validation(errors, '成绩信息有误，请检查后重试');
  }
  return withTransaction(db, () =>
    insertScore(db, {
      studentId: values.studentId,
      subjectId: values.subjectId,
      scoreTenths: values.scoreTenths,
      now: nowIso(),
    }),
  );
}

export function updateScoreById(db: Database, id: number, raw: Record<string, unknown>): void {
  getScoreOrThrow(db, id);
  const { values, errors } = parseScoreInput(db, raw, { excludeId: id });
  if (Object.keys(errors).length > 0) {
    throw HttpError.validation(errors, '成绩信息有误，请检查后重试');
  }
  withTransaction(db, () =>
    updateScore(db, {
      id,
      studentId: values.studentId,
      subjectId: values.subjectId,
      scoreTenths: values.scoreTenths,
      now: nowIso(),
    }),
  );
}

export function removeScore(db: Database, id: number): ScoreRow {
  const row = getScoreOrThrow(db, id);
  withTransaction(db, () => deleteScore(db, id));
  return row;
}
