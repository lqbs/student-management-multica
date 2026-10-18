import { pathToFileURL } from 'node:url';

import { nowIso } from '../config.js';
import { createDatabase, withTransaction, type Database } from './index.js';

export interface SeedResult {
  seeded: boolean;
  message: string;
  counts: { classes: number; students: number; subjects: number; scores: number };
}

const SAMPLE_CLASSES = ['高一(1)班', '高一(2)班'];
const SAMPLE_SUBJECTS = ['数学', '语文', '英语'];

interface SampleStudent {
  studentNo: string;
  name: string;
  className: string | null;
  scores: Record<string, number>;
}

/** 全合成数据：无任何真实学生信息，符合“不导入真实学生资料”的交付边界。 */
const SAMPLE_STUDENTS: SampleStudent[] = [
  { studentNo: '001', name: '演示学生01', className: '高一(1)班', scores: { 数学: 985, 语文: 920, 英语: 1000 } },
  { studentNo: '002', name: '演示学生02', className: '高一(1)班', scores: { 数学: 0, 语文: 600, 英语: 455 } },
  { studentNo: '003', name: '演示学生03', className: '高一(1)班', scores: { 数学: 723, 英语: 882 } },
  { studentNo: '004', name: '演示学生04', className: '高一(2)班', scores: { 数学: 900, 语文: 768, 英语: 955 } },
  { studentNo: '005', name: '演示学生05', className: '高一(2)班', scores: { 语文: 100 } },
  { studentNo: '006', name: '演示学生06', className: null, scores: { 数学: 594, 英语: 731 } },
];

export function countRows(db: Database): SeedResult['counts'] {
  const count = (table: string): number => {
    const row = db.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get() as { total: number };
    return Number(row.total);
  };
  return {
    classes: count('classes'),
    students: count('students'),
    subjects: count('subjects'),
    scores: count('scores'),
  };
}

export function isDatabaseEmpty(db: Database): boolean {
  const counts = countRows(db);
  return counts.classes === 0 && counts.students === 0 && counts.subjects === 0 && counts.scores === 0;
}

/**
 * 初始化合成示例数据：
 * - 默认仅在四个表全部为空时写入，重复运行不会覆盖或重复用户录入；
 * - force=true 时先清空再写入（供 `npm run db:seed -- --force` 显式重置使用）；
 * - 整个操作在一个事务内完成，失败不留下半成品数据。
 */
export function seedDatabase(db: Database, options: { force?: boolean } = {}): SeedResult {
  if (!options.force && !isDatabaseEmpty(db)) {
    return {
      seeded: false,
      message: '数据库已存在数据，已跳过初始化（不会覆盖现有记录）。如需重置请显式使用 --force。',
      counts: countRows(db),
    };
  }

  withTransaction(db, () => {
    if (options.force) {
      db.exec('DELETE FROM scores; DELETE FROM students; DELETE FROM subjects; DELETE FROM classes;');
      resetAutoIncrement(db);
    }

    const timestamp = nowIso();
    const insertClass = db.prepare('INSERT INTO classes (name, created_at, updated_at) VALUES (?, ?, ?)');
    const insertSubject = db.prepare('INSERT INTO subjects (name, created_at, updated_at) VALUES (?, ?, ?)');
    const insertStudent = db.prepare(
      'INSERT INTO students (student_no, name, class_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    const insertScore = db.prepare(
      'INSERT INTO scores (student_id, subject_id, score_tenths, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    );

    const classIds = new Map<string, number>();
    for (const name of SAMPLE_CLASSES) {
      const result = insertClass.run(name, timestamp, timestamp);
      classIds.set(name, Number(result.lastInsertRowid));
    }

    const subjectIds = new Map<string, number>();
    for (const name of SAMPLE_SUBJECTS) {
      const result = insertSubject.run(name, timestamp, timestamp);
      subjectIds.set(name, Number(result.lastInsertRowid));
    }

    for (const student of SAMPLE_STUDENTS) {
      const classId = student.className ? (classIds.get(student.className) ?? null) : null;
      const result = insertStudent.run(student.studentNo, student.name, classId, timestamp, timestamp);
      const studentId = Number(result.lastInsertRowid);
      for (const [subjectName, scoreTenths] of Object.entries(student.scores)) {
        const subjectId = subjectIds.get(subjectName);
        if (subjectId === undefined) {
          continue;
        }
        insertScore.run(studentId, subjectId, scoreTenths, timestamp, timestamp);
      }
    }
  });

  return {
    seeded: true,
    message: options.force ? '已清空并重新写入合成示例数据。' : '已写入合成示例数据。',
    counts: countRows(db),
  };
}

function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(entry).href === moduleUrl;
}

/**
 * 重置 AUTOINCREMENT 自增序列：仅 DELETE 数据不会回退 sqlite_sequence，
 * 会让 `--force` 重置后的 ID 从旧值继续增长（与全新初始化不一致）。
 * sqlite_sequence 仅在存在 AUTOINCREMENT 表并写入过数据后才存在，因此需容错。
 */
function resetAutoIncrement(db: Database): void {
  const sequenceTable = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'")
    .get() as { ok: number } | undefined;
  if (!sequenceTable) {
    return;
  }
  db.prepare("DELETE FROM sqlite_sequence WHERE name IN ('scores', 'students', 'subjects', 'classes')").run();
}

if (isMainModule(import.meta.url)) {
  const force = process.argv.slice(2).includes('--force');
  const db = createDatabase();
  try {
    const result = seedDatabase(db, { force });
    console.log(result.message);
    console.log(
      `当前数据量：班级 ${result.counts.classes} · 学生 ${result.counts.students} · 科目 ${result.counts.subjects} · 成绩 ${result.counts.scores}`,
    );
  } finally {
    db.close();
  }
}
