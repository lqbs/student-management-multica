import type { DatabaseSync } from 'node:sqlite';

import { nowIso } from '../config.js';
import { withTransaction } from './index.js';

interface Migration {
  version: number;
  name: string;
  sql: string;
}

/**
 * 版本化迁移：按 version 顺序执行，已应用的版本跳过；
 * 每个版本在独立事务内执行并写入 schema_migrations，失败即抛出、进程停止启动。
 */
const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: `
      CREATE TABLE classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE students (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_no TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        class_id INTEGER NULL REFERENCES classes(id) ON DELETE RESTRICT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX idx_students_class_id ON students(class_id);

      CREATE TABLE subjects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
        score_tenths INTEGER NOT NULL CHECK (typeof(score_tenths) = 'integer' AND score_tenths BETWEEN 0 AND 1000),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (student_id, subject_id)
      );

      CREATE INDEX idx_scores_subject_id ON scores(subject_id);
    `,
  },
];

export function runMigrations(db: DatabaseSync): { applied: number[]; skipped: number[] } {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const rows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>;
  const appliedVersions = new Set(rows.map((row) => Number(row.version)));
  const applied: number[] = [];
  const skipped: number[] = [];

  for (const migration of [...MIGRATIONS].sort((a, b) => a.version - b.version)) {
    if (appliedVersions.has(migration.version)) {
      skipped.push(migration.version);
      continue;
    }
    withTransaction(db, () => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
        migration.version,
        migration.name,
        nowIso(),
      );
    });
    applied.push(migration.version);
  }

  return { applied, skipped };
}

export function listAppliedMigrations(db: DatabaseSync): Array<{ version: number; name: string; applied_at: string }> {
  return db
    .prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version')
    .all() as Array<{ version: number; name: string; applied_at: string }>;
}
