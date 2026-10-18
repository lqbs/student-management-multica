import assert from 'node:assert/strict';
import fs from 'node:fs';
import { describe, it } from 'node:test';

import { createDatabase, withTransaction } from '../src/db/index.js';
import { runMigrations } from '../src/db/migrations.js';
import { countRows, seedDatabase } from '../src/db/seed.js';
import {
  TestClient,
  createClassViaHttp,
  createScoreViaHttp,
  createStudentViaHttp,
  createSubjectViaHttp,
  createTempDatabaseFile,
  startTestServer,
} from './helpers.js';

describe('持久化与初始化', () => {
  it('迁移幂等：重复执行不重复应用', () => {
    const db = createDatabase(createTempDatabaseFile());
    try {
      const first = runMigrations(db);
      assert.deepEqual(first.applied, []);
      assert.deepEqual(first.skipped, [1]);
      const applied = db.prepare('SELECT COUNT(*) AS total FROM schema_migrations').get() as { total: number };
      assert.equal(Number(applied.total), 1);
    } finally {
      db.close();
    }
  });

  it('数据在进程重启（重新打开数据库文件）后保留', async () => {
    const databaseFile = createTempDatabaseFile();
    const first = await startTestServer({ databaseFile });
    const client = new TestClient(first.baseUrl);
    await createClassViaHttp(client, '高一(1)班');
    const classId = Number((first.db.prepare('SELECT id FROM classes LIMIT 1').get() as { id: number }).id);
    await createStudentViaHttp(client, { studentNo: '001', name: '演示甲', classId });
    await createSubjectViaHttp(client, '数学');
    const subjectId = Number((first.db.prepare('SELECT id FROM subjects LIMIT 1').get() as { id: number }).id);
    const studentId = Number((first.db.prepare('SELECT id FROM students LIMIT 1').get() as { id: number }).id);
    const score = await createScoreViaHttp(client, { studentId, subjectId, score: '91.5' });
    assert.equal(score.status, 303);
    await first.stop();

    const second = await startTestServer({ databaseFile });
    try {
      const reopened = new TestClient(second.baseUrl);
      const list = await reopened.get('/students');
      assert.equal(list.status, 200);
      assert.match(list.text, /演示甲/);
      assert.match(list.text, />001</);

      const scores = await reopened.get('/scores');
      assert.match(scores.text, /91\.5/);

      const counts = countRows(second.db);
      assert.deepEqual(counts, { classes: 1, students: 1, subjects: 1, scores: 1 });
    } finally {
      await second.stop();
    }
  });

  it('种子数据仅在空库写入一次，重复运行不覆盖用户录入', async () => {
    const databaseFile = createTempDatabaseFile();
    const server = await startTestServer({ databaseFile });
    try {
      const first = seedDatabase(server.db);
      assert.equal(first.seeded, true);
      assert.deepEqual(first.counts, { classes: 2, students: 6, subjects: 3, scores: 14 });

      const client = new TestClient(server.baseUrl);
      await createStudentViaHttp(client, { studentNo: 'USER-1', name: '用户录入学生' });

      const second = seedDatabase(server.db);
      assert.equal(second.seeded, false);
      assert.equal(second.counts.students, 7);

      const userRow = server.db.prepare('SELECT COUNT(*) AS total FROM students WHERE student_no = ?').get('USER-1') as {
        total: number;
      };
      assert.equal(Number(userRow.total), 1);

      const sample = server.db
        .prepare('SELECT COUNT(*) AS total FROM students WHERE name LIKE ?')
        .get('演示学生%') as { total: number };
      assert.equal(Number(sample.total), 6);
    } finally {
      await server.stop();
    }

    // 显式 force 重置：清空后重新写入，用户录入被移除（只在显式调用时发生）
    const reopened = await startTestServer({ databaseFile });
    try {
      const forced = seedDatabase(reopened.db, { force: true });
      assert.equal(forced.seeded, true);
      assert.deepEqual(forced.counts, { classes: 2, students: 6, subjects: 3, scores: 14 });
      const user = reopened.db.prepare('SELECT COUNT(*) AS total FROM students WHERE student_no = ?').get('USER-1') as {
        total: number;
      };
      assert.equal(Number(user.total), 0);
    } finally {
      await reopened.stop();
    }
  });

  it('--force 重置会回退自增序列，使 ID 与全新初始化一致（O1 回归）', () => {
    const db = createDatabase(createTempDatabaseFile());
    try {
      seedDatabase(db);
      const idsOf = (table: 'classes' | 'subjects' | 'students'): number[] =>
        (db.prepare(`SELECT id FROM ${table} ORDER BY id`).all() as { id: number }[]).map((row) => Number(row.id));
      assert.deepEqual(idsOf('classes'), [1, 2]);
      assert.deepEqual(idsOf('subjects'), [1, 2, 3]);
      assert.deepEqual(idsOf('students'), [1, 2, 3, 4, 5, 6]);

      // 连续重置（模拟用户反复执行 db:seed -- --force）后 ID 仍从 1 开始
      seedDatabase(db, { force: true });
      seedDatabase(db, { force: true });
      assert.deepEqual(idsOf('classes'), [1, 2]);
      assert.deepEqual(idsOf('subjects'), [1, 2, 3]);
      assert.deepEqual(idsOf('students'), [1, 2, 3, 4, 5, 6]);

      const now = new Date().toISOString();
      const newClassId = Number(
        db.prepare('INSERT INTO classes (name, created_at, updated_at) VALUES (?, ?, ?)').run('新班级', now, now)
          .lastInsertRowid,
      );
      assert.equal(newClassId, 3, '重置后新增记录应从 1..N 之后继续编号');

      const counts = countRows(db);
      assert.deepEqual(counts, { classes: 3, students: 6, subjects: 3, scores: 14 });
    } finally {
      db.close();
    }
  });

  it('种子数据包含未分班学生与边界成绩（0 / 100 / 小数）', async () => {
    const server = await startTestServer({ seed: true });
    try {
      const client = new TestClient(server.baseUrl);
      const unassigned = await client.get('/students?classId=unassigned');
      assert.match(unassigned.text, /演示学生06/);

      const scores = server.db.prepare('SELECT MIN(score_tenths) AS min, MAX(score_tenths) AS max FROM scores').get() as {
        min: number;
        max: number;
      };
      assert.equal(Number(scores.min), 0);
      assert.equal(Number(scores.max), 1000);

      const decimal = server.db
        .prepare('SELECT COUNT(*) AS total FROM scores WHERE score_tenths % 10 <> 0')
        .get() as { total: number };
      assert.ok(Number(decimal.total) > 0);
    } finally {
      await server.stop();
    }
  });

  it('事务回滚：失败时不留下半成品数据', () => {
    const db = createDatabase(createTempDatabaseFile());
    try {
      const before = countRows(db);
      assert.throws(() => {
        withTransaction(db, () => {
          db.prepare('INSERT INTO classes (name, created_at, updated_at) VALUES (?, ?, ?)').run(
            '临时班级',
            new Date().toISOString(),
            new Date().toISOString(),
          );
          throw new Error('模拟失败');
        });
      }, /模拟失败/);
      const after = countRows(db);
      assert.deepEqual(after, before);
    } finally {
      db.close();
    }
  });

  it('外键保护：无法直接删除仍有学生的班级（数据库层兜底）', () => {
    const databaseFile = createTempDatabaseFile();
    const db = createDatabase(databaseFile);
    try {
      const now = new Date().toISOString();
      const classId = Number(
        db.prepare('INSERT INTO classes (name, created_at, updated_at) VALUES (?, ?, ?)').run('高一(9)班', now, now)
          .lastInsertRowid,
      );
      db.prepare('INSERT INTO students (student_no, name, class_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
        'F-1',
        '外键学生',
        classId,
        now,
        now,
      );
      assert.throws(() => {
        db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
      }, /FOREIGN KEY constraint failed/);
    } finally {
      db.close();
      fs.rmSync(databaseFile, { force: true });
    }
  });
});
