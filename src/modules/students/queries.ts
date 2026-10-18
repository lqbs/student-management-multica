import { likePattern, normalizeStudentNo } from '../../shared/validation.js';
import type { Database } from '../../db/index.js';

export interface StudentRow {
  id: number;
  student_no: string;
  name: string;
  class_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface StudentWithClass extends StudentRow {
  class_name: string | null;
  score_count: number;
}

export interface StudentDetail extends StudentWithClass {
  score_count: number;
}

export interface StudentOption {
  id: number;
  student_no: string;
  name: string;
  class_name: string | null;
}

export interface StudentListOptions {
  search?: string;
  /** 数字表示班级 ID，"unassigned" 表示未分班，null 表示全部。 */
  classId?: number | 'unassigned' | null;
  limit: number;
  offset: number;
}

interface WhereClause {
  sql: string;
  params: Array<string | number>;
}

function buildWhere(options: Pick<StudentListOptions, 'search' | 'classId'>): WhereClause {
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

  return {
    sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}

const STUDENT_SELECT = `
  SELECT st.id, st.student_no, st.name, st.class_id, st.created_at, st.updated_at, c.name AS class_name,
         (SELECT COUNT(*) FROM scores sc WHERE sc.student_id = st.id) AS score_count
  FROM students st
  LEFT JOIN classes c ON c.id = st.class_id
`;

export function countStudents(db: Database, options: Pick<StudentListOptions, 'search' | 'classId'> = {}): number {
  const where = buildWhere(options);
  const row = db
    .prepare(`SELECT COUNT(*) AS total FROM students st ${where.sql}`)
    .get(...where.params) as { total: number };
  return Number(row.total);
}

export function listStudents(db: Database, options: StudentListOptions): StudentWithClass[] {
  const where = buildWhere(options);
  const params = [...where.params, options.limit, options.offset];
  return db
    .prepare(`${STUDENT_SELECT} ${where.sql} ORDER BY st.id LIMIT ? OFFSET ?`)
    .all(...params) as unknown as StudentWithClass[];
}

export function getStudentById(db: Database, id: number): StudentRow | undefined {
  return db
    .prepare('SELECT id, student_no, name, class_id, created_at, updated_at FROM students WHERE id = ?')
    .get(id) as StudentRow | undefined;
}

export function getStudentDetailById(db: Database, id: number): StudentDetail | undefined {
  return db
    .prepare(
      `SELECT st.id, st.student_no, st.name, st.class_id, st.created_at, st.updated_at, c.name AS class_name,
              (SELECT COUNT(*) FROM scores sc WHERE sc.student_id = st.id) AS score_count
       FROM students st
       LEFT JOIN classes c ON c.id = st.class_id
       WHERE st.id = ?`,
    )
    .get(id) as StudentDetail | undefined;
}

export function findStudentByNo(db: Database, studentNo: string, excludeId?: number): StudentRow | undefined {
  const row =
    excludeId === undefined
      ? db
          .prepare('SELECT id, student_no, name, class_id, created_at, updated_at FROM students WHERE student_no = ?')
          .get(studentNo)
      : db
          .prepare(
            'SELECT id, student_no, name, class_id, created_at, updated_at FROM students WHERE student_no = ? AND id <> ?',
          )
          .get(studentNo, excludeId);
  return row as StudentRow | undefined;
}

export function listStudentOptions(db: Database): StudentOption[] {
  return db
    .prepare(
      `SELECT st.id, st.student_no, st.name, c.name AS class_name
       FROM students st
       LEFT JOIN classes c ON c.id = st.class_id
       ORDER BY st.student_no, st.id`,
    )
    .all() as unknown as StudentOption[];
}

export function insertStudent(
  db: Database,
  input: { studentNo: string; name: string; classId: number | null; now: string },
): number {
  const result = db
    .prepare('INSERT INTO students (student_no, name, class_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(input.studentNo, input.name, input.classId, input.now, input.now);
  return Number(result.lastInsertRowid);
}

export function updateStudent(
  db: Database,
  input: { id: number; studentNo: string; name: string; classId: number | null; now: string },
): void {
  db.prepare('UPDATE students SET student_no = ?, name = ?, class_id = ?, updated_at = ? WHERE id = ?').run(
    input.studentNo,
    input.name,
    input.classId,
    input.now,
    input.id,
  );
}

export function deleteStudent(db: Database, id: number): void {
  db.prepare('DELETE FROM students WHERE id = ?').run(id);
}

export function countClassExists(db: Database, id: number): boolean {
  const row = db.prepare('SELECT 1 AS ok FROM classes WHERE id = ?').get(id) as { ok: number } | undefined;
  return row !== undefined;
}
