import { likePattern } from '../../shared/validation.js';
import type { Database } from '../../db/index.js';

export interface SubjectRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SubjectWithCount extends SubjectRow {
  score_count: number;
}

export interface SubjectOption {
  id: number;
  name: string;
}

export function countSubjects(db: Database, options: { search?: string } = {}): number {
  const search = options.search?.trim() ?? '';
  if (!search) {
    const row = db.prepare('SELECT COUNT(*) AS total FROM subjects').get() as { total: number };
    return Number(row.total);
  }
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM subjects WHERE name LIKE ? ESCAPE '\\'")
    .get(likePattern(search)) as { total: number };
  return Number(row.total);
}

export function listSubjects(
  db: Database,
  options: { search?: string; limit: number; offset: number },
): SubjectWithCount[] {
  const search = options.search?.trim() ?? '';
  const where = search ? "WHERE su.name LIKE ? ESCAPE '\\'" : '';
  const params: Array<string | number> = search ? [likePattern(search)] : [];
  params.push(options.limit, options.offset);
  return db
    .prepare(
      `SELECT su.id, su.name, su.created_at, su.updated_at, COUNT(sc.id) AS score_count
       FROM subjects su
       LEFT JOIN scores sc ON sc.subject_id = su.id
       ${where}
       GROUP BY su.id, su.name, su.created_at, su.updated_at
       ORDER BY su.id
       LIMIT ? OFFSET ?`,
    )
    .all(...params) as unknown as SubjectWithCount[];
}

export function listSubjectOptions(db: Database): SubjectOption[] {
  return db.prepare('SELECT id, name FROM subjects ORDER BY id').all() as unknown as SubjectOption[];
}

export function getSubjectById(db: Database, id: number): SubjectRow | undefined {
  return db.prepare('SELECT id, name, created_at, updated_at FROM subjects WHERE id = ?').get(id) as
    | SubjectRow
    | undefined;
}

export function findSubjectByName(db: Database, name: string, excludeId?: number): SubjectRow | undefined {
  const row =
    excludeId === undefined
      ? db.prepare('SELECT id, name, created_at, updated_at FROM subjects WHERE name = ?').get(name)
      : db
          .prepare('SELECT id, name, created_at, updated_at FROM subjects WHERE name = ? AND id <> ?')
          .get(name, excludeId);
  return row as SubjectRow | undefined;
}

export function insertSubject(db: Database, input: { name: string; now: string }): number {
  const result = db
    .prepare('INSERT INTO subjects (name, created_at, updated_at) VALUES (?, ?, ?)')
    .run(input.name, input.now, input.now);
  return Number(result.lastInsertRowid);
}

export function updateSubject(db: Database, input: { id: number; name: string; now: string }): void {
  db.prepare('UPDATE subjects SET name = ?, updated_at = ? WHERE id = ?').run(input.name, input.now, input.id);
}

export function deleteSubject(db: Database, id: number): void {
  db.prepare('DELETE FROM subjects WHERE id = ?').run(id);
}

export function countScoresForSubject(db: Database, id: number): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM scores WHERE subject_id = ?').get(id) as { total: number };
  return Number(row.total);
}
