import { nowIso } from '../../config.js';
import { withTransaction, type Database } from '../../db/index.js';
import { HttpError, type FieldErrors } from '../../shared/errors.js';
import { asText, normalizeStudentNo, validateClassId, validateName, validateStudentNo } from '../../shared/validation.js';
import {
  countClassExists,
  countStudents,
  deleteStudent,
  findStudentByNo,
  getStudentById,
  insertStudent,
  updateStudent,
} from './queries.js';
import type { StudentRow } from './queries.js';

export interface StudentFormValues {
  student_no: string;
  name: string;
  /** 原始字符串，供表单回填；'' 表示未分班。 */
  class_id: string;
}

export interface StudentInput {
  studentNo: string;
  name: string;
  classId: number | null;
}

export function toStudentFormValues(raw: Record<string, unknown>): StudentFormValues {
  return {
    student_no: asText(raw.student_no),
    name: asText(raw.name),
    class_id: asText(raw.class_id),
  };
}

export function parseStudentInput(
  db: Database,
  raw: Record<string, unknown>,
  options: { excludeId?: number } = {},
): { values: StudentInput; errors: FieldErrors } {
  const studentNoResult = validateStudentNo(raw.student_no);
  const nameResult = validateName(raw.name, '学生姓名');
  const classIdResult = validateClassId(raw.class_id);

  const errors: FieldErrors = {};
  const values: StudentInput = {
    studentNo: normalizeStudentNo(raw.student_no),
    name: asText(raw.name).trim(),
    classId: null,
  };

  if (!studentNoResult.ok) {
    errors.student_no = studentNoResult.message;
  } else {
    values.studentNo = studentNoResult.value;
  }
  if (!nameResult.ok) {
    errors.name = nameResult.message;
  } else {
    values.name = nameResult.value;
  }
  if (!classIdResult.ok) {
    errors.class_id = classIdResult.message;
  } else {
    values.classId = classIdResult.value;
  }

  if (!errors.student_no && findStudentByNo(db, values.studentNo, options.excludeId)) {
    errors.student_no = '学号已存在，请使用其他学号';
  }
  if (!errors.class_id && values.classId !== null && !countClassExists(db, values.classId)) {
    errors.class_id = '所选班级不存在，请重新选择';
  }

  return { values, errors };
}

export function getStudentOrThrow(db: Database, id: number): StudentRow {
  const row = getStudentById(db, id);
  if (!row) {
    throw HttpError.notFound('学生不存在，可能已被删除');
  }
  return row;
}

export function createStudent(db: Database, raw: Record<string, unknown>): number {
  const { values, errors } = parseStudentInput(db, raw);
  if (Object.keys(errors).length > 0) {
    throw HttpError.validation(errors, '学生信息有误，请检查后重试');
  }
  return withTransaction(db, () =>
    insertStudent(db, { studentNo: values.studentNo, name: values.name, classId: values.classId, now: nowIso() }),
  );
}

export function updateStudentById(db: Database, id: number, raw: Record<string, unknown>): void {
  getStudentOrThrow(db, id);
  const { values, errors } = parseStudentInput(db, raw, { excludeId: id });
  if (Object.keys(errors).length > 0) {
    throw HttpError.validation(errors, '学生信息有误，请检查后重试');
  }
  withTransaction(db, () =>
    updateStudent(db, {
      id,
      studentNo: values.studentNo,
      name: values.name,
      classId: values.classId,
      now: nowIso(),
    }),
  );
}

/**
 * 删除学生：先删除其成绩再删除学生，两步在同一事务内完成；
 * 外键 ON DELETE CASCADE 作为并发/遗漏场景的最后防线。
 */
export function removeStudent(db: Database, id: number): { student: StudentRow; deletedScores: number } {
  const student = getStudentOrThrow(db, id);
  return withTransaction(db, () => {
    const result = db.prepare('DELETE FROM scores WHERE student_id = ?').run(id);
    deleteStudent(db, id);
    return { student, deletedScores: Number(result.changes) };
  });
}

export function countStudentsForClass(db: Database, classId: number): number {
  return countStudents(db, { classId });
}
