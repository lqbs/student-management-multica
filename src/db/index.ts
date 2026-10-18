import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { resolveDatabasePath } from '../config.js';
import { runMigrations } from './migrations.js';

export type Database = DatabaseSync;

/** 打开（必要时创建）数据库文件，并启用外键与忙等待。 */
export function openDatabase(file: string): DatabaseSync {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (file !== ':memory:') {
    db.prepare('PRAGMA journal_mode = WAL;').get();
  }
  return db;
}

export interface CreateDatabaseOptions {
  /** 默认自动执行迁移；测试可显式关闭以便单测迁移本身。 */
  migrate?: boolean;
}

export function createDatabase(file: string = resolveDatabasePath(), options: CreateDatabaseOptions = {}): DatabaseSync {
  const db = openDatabase(file);
  if (options.migrate !== false) {
    runMigrations(db);
  }
  return db;
}

let sharedDatabase: DatabaseSync | null = null;

/** 服务进程共享的数据库连接（启动时自动迁移）；server.ts 使用它以便停服时能真正关闭连接。 */
export function getSharedDatabase(): DatabaseSync {
  if (!sharedDatabase) {
    sharedDatabase = createDatabase();
  }
  return sharedDatabase;
}

/** 关闭共享连接：SQLite 在最后一个连接关闭时执行 WAL checkpoint 并移除 -wal / -shm。 */
export function closeSharedDatabase(): void {
  if (sharedDatabase) {
    const database = sharedDatabase;
    sharedDatabase = null;
    database.close();
  }
}

const transactionDepth = new WeakMap<object, number>();

/**
 * 在事务中执行 fn；嵌套调用复用外层事务，避免 SQLite 不支持嵌套 BEGIN。
 * 任一异常都会回滚，保证删除学生与成绩等组合操作的数据一致性。
 */
export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  const depth = transactionDepth.get(db) ?? 0;
  if (depth > 0) {
    transactionDepth.set(db, depth + 1);
    try {
      return fn();
    } finally {
      transactionDepth.set(db, depth);
    }
  }

  db.exec('BEGIN IMMEDIATE');
  transactionDepth.set(db, 1);
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 回滚失败时保留原始异常，交由上层与日志处理。
    }
    throw error;
  } finally {
    transactionDepth.set(db, 0);
  }
}
