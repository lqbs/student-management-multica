import { likePattern } from '../../shared/validation.js';
import type { Database } from '../../db/index.js';

export interface ClassRow {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ClassWithCount extends ClassRow {
  student_count: number;
}

export interface ClassOption {
  id: number;
  name: string;
  student_count: number;
}

export function countClasses(db: Database, options: { search?: string } = {}): number {
  const search = options.search?.trim() ?? '';
  if (!search) {
    const row = db.prepare('SELECT COUNT(*) AS total FROM classes').get() as { total: number };
    return Number(row.total);
  }
  const row = db
    .prepare("SELECT COUNT(*) AS total FROM classes WHERE name LIKE ? ESCAPE '\\'")
    .get(likePattern(search)) as { total: number };
  return Number(row.total);
}

export function listClasses(
  db: Database,
  options: { search?: string; limit: number; offset: number },
): ClassWithCount[] {
  const search = options.search?.trim() ?? '';
  const where = search ? "WHERE c.name LIKE ? ESCAPE '\\'" : '';
  const params: Array<string | number> = search ? [likePattern(search)] : [];
  params.push(options.limit, options.offset);
  return db
    .prepare(
      `SELECT c.id, c.name, c.created_at, c.updated_at, COUNT(s.id) AS student_count
       FROM classes c
       LEFT JOIN students s ON s.class_id = c.id
       ${where}
       GROUP BY c.id, c.name, c.created_at, c.updated_at
       ORDER BY c.id
       LIMIT ? OFFSET ?`,
    )
    .all(...params) as unknown as ClassWithCount[];
}

export function listClassOptions(db: Database): ClassOption[] {
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(s.id) AS student_count
       FROM classes c
       LEFT JOIN students s ON s.class_id = c.id
       GROUP BY c.id, c.name
       ORDER BY c.id`,
    )
    .all() as unknown as ClassOption[];
}

export function getClassById(db: Database, id: number): ClassRow | undefined {
  return db.prepare('SELECT id, name, created_at, updated_at FROM classes WHERE id = ?').get(id) as
    | ClassRow
    | undefined;
}

export function findClassByName(db: Database, name: string, excludeId?: number): ClassRow | undefined {
  const row =
    excludeId === undefined
      ? db.prepare('SELECT id, name, created_at, updated_at FROM classes WHERE name = ?').get(name)
      : db
          .prepare('SELECT id, name, created_at, updated_at FROM classes WHERE name = ? AND id <> ?')
          .get(name, excludeId);
  return row as ClassRow | undefined;
}

export function insertClass(db: Database, input: { name: string; now: string }): number {
  const result = db
    .prepare('INSERT INTO classes (name, created_at, updated_at) VALUES (?, ?, ?)')
    .run(input.name, input.now, input.now);
  return Number(result.lastInsertRowid);
}

export function updateClass(db: Database, input: { id: number; name: string; now: string }): void {
  db.prepare('UPDATE classes SET name = ?, updated_at = ? WHERE id = ?').run(input.name, input.now, input.id);
}

export function deleteClass(db: Database, id: number): void {
  db.prepare('DELETE FROM classes WHERE id = ?').run(id);
}

export function countStudentsInClass(db: Database, id: number): number {
  const row = db.prepare('SELECT COUNT(*) AS total FROM students WHERE class_id = ?').get(id) as { total: number };
  return Number(row.total);
}
