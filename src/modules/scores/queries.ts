import { likePattern, normalizeStudentNo } from '../../shared/validation.js';
import type { Database } from '../../db/index.js';

export interface ScoreRow {
  id: number;
  student_id: number;
  subject_id: number;
  score_tenths: number;
  created_at: string;
  updated_at: string;
}

export interface ScoreWithRelations extends ScoreRow {
  student_no: string;
  student_name: string;
  class_name: string | null;
  subject_name: string;
}

export interface ScoreListOptions {
  search?: string;
  classId?: number | 'unassigned' | null;
  subjectId?: number | null;
  limit: number;
  offset: number;
}

interface WhereClause {
  sql: string;
  params: Array<string | number>;
}

function buildWhere(options: Pick<ScoreListOptions, 'search' | 'classId' | 'subjectId'>): WhereClause {
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  const search = options.search?.trim() ?? '';

  if (search) {
    conditions.push("(st.name LIKE ? ESCAPE '\\' OR st.student_no LIKE ? ESCAPE '\\')");
    params.push(likePattern(search), likePattern(normalizeStudentNo(search)));
  }
  if (options.classId === 'unassigned') {
    conditions.push('st.class_id IS NULL');
  } else if (typeof options.classId === 'number') {
    conditions.push('st.class_id = ?');
    params.push(options.classId);
  }
  if (typeof options.subjectId === 'number') {
    conditions.push('sc.subject_id = ?');
    params.push(options.subjectId);
  }

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

const SCORE_SELECT = `
  SELECT sc.id, sc.student_id, sc.subject_id, sc.score_tenths, sc.created_at, sc.updated_at,
         st.student_no, st.name AS student_name, c.name AS class_name, su.name AS subject_name
  FROM scores sc
  JOIN students st ON st.id = sc.student_id
  JOIN subjects su ON su.id = sc.subject_id
  LEFT JOIN classes c ON c.id = st.class_id
`;

export function countScores(
  db: Database,
  options: Pick<ScoreListOptions, 'search' | 'classId' | 'subjectId'> = {},
): number {
  const where = buildWhere(options);
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total
       FROM scores sc
       JOIN students st ON st.id = sc.student_id
       ${where.sql}`,
    )
    .get(...where.params) as { total: number };
  return Number(row.total);
}

export function listScores(db: Database, options: ScoreListOptions): ScoreWithRelations[] {
  const where = buildWhere(options);
  const params = [...where.params, options.limit, options.offset];
  return db
    .prepare(`${SCORE_SELECT} ${where.sql} ORDER BY sc.id LIMIT ? OFFSET ?`)
    .all(...params) as unknown as ScoreWithRelations[];
}

export function listScoresByStudent(db: Database, studentId: number): ScoreWithRelations[] {
  return db
    .prepare(`${SCORE_SELECT} WHERE sc.student_id = ? ORDER BY sc.id`)
    .all(studentId) as unknown as ScoreWithRelations[];
}

export function getScoreById(db: Database, id: number): ScoreRow | undefined {
  return db
    .prepare('SELECT id, student_id, subject_id, score_tenths, created_at, updated_at FROM scores WHERE id = ?')
    .get(id) as ScoreRow | undefined;
}

export function getScoreWithRelations(db: Database, id: number): ScoreWithRelations | undefined {
  return db.prepare(`${SCORE_SELECT} WHERE sc.id = ?`).get(id) as ScoreWithRelations | undefined;
}

export function findScoreByStudentAndSubject(
  db: Database,
  studentId: number,
  subjectId: number,
  excludeId?: number,
): ScoreRow | undefined {
  const row =
    excludeId === undefined
      ? db
          .prepare(
            'SELECT id, student_id, subject_id, score_tenths, created_at, updated_at FROM scores WHERE student_id = ? AND subject_id = ?',
          )
          .get(studentId, subjectId)
      : db
          .prepare(
            'SELECT id, student_id, subject_id, score_tenths, created_at, updated_at FROM scores WHERE student_id = ? AND subject_id = ? AND id <> ?',
          )
          .get(studentId, subjectId, excludeId);
  return row as ScoreRow | undefined;
}

export function insertScore(
  db: Database,
  input: { studentId: number; subjectId: number; scoreTenths: number; now: string },
): number {
  const result = db
    .prepare('INSERT INTO scores (student_id, subject_id, score_tenths, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(input.studentId, input.subjectId, input.scoreTenths, input.now, input.now);
  return Number(result.lastInsertRowid);
}

export function updateScore(
  db: Database,
  input: { id: number; studentId: number; subjectId: number; scoreTenths: number; now: string },
): void {
  db.prepare('UPDATE scores SET student_id = ?, subject_id = ?, score_tenths = ?, updated_at = ? WHERE id = ?').run(
    input.studentId,
    input.subjectId,
    input.scoreTenths,
    input.now,
    input.id,
  );
}

export function deleteScore(db: Database, id: number): void {
  db.prepare('DELETE FROM scores WHERE id = ?').run(id);
}

export function countScoresForStudent(db: Database, studentId: number): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM scores WHERE student_id = ?').get(studentId) as {
    total: number;
  };
  return Number(row.total);
}
