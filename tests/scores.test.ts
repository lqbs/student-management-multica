import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  TestClient,
  createScoreViaHttp,
  createStudentViaHttp,
  createSubjectViaHttp,
  startTestServer,
  textContent,
  type TestServer,
} from './helpers.js';

describe('成绩：范围校验、唯一性与增删改', () => {
  let server: TestServer;
  let client: TestClient;
  let studentA: number;
  let studentB: number;
  let mathId: number;

  before(async () => {
    server = await startTestServer();
    client = new TestClient(server.baseUrl);
    await createStudentViaHttp(client, { studentNo: '001', name: '演示甲' });
    await createStudentViaHttp(client, { studentNo: '002', name: '演示乙' });
    await createSubjectViaHttp(client, '数学');
    studentA = Number((server.db.prepare('SELECT id FROM students WHERE name = ?').get('演示甲') as { id: number }).id);
    studentB = Number((server.db.prepare('SELECT id FROM students WHERE name = ?').get('演示乙') as { id: number }).id);
    mathId = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('数学') as { id: number }).id);
  });

  after(async () => {
    await server.stop();
  });

  it('接受 0、100 与一位小数', async () => {
    const zero = await createScoreViaHttp(client, { studentId: studentA, subjectId: mathId, score: '0' });
    assert.equal(zero.status, 303);
    assert.equal(zero.location, '/scores?flash=score-created');

    const zeroPointZero = await createScoreViaHttp(client, { studentId: studentB, subjectId: mathId, score: '0.0' });
    assert.equal(zeroPointZero.status, 303);

    await createSubjectViaHttp(client, '语文');
    const chineseId = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('语文') as { id: number }).id);
    const full = await createScoreViaHttp(client, { studentId: studentA, subjectId: chineseId, score: '100' });
    assert.equal(full.status, 303);

    await createSubjectViaHttp(client, '英语');
    const englishId = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('英语') as { id: number }).id);
    const decimal = await createScoreViaHttp(client, { studentId: studentA, subjectId: englishId, score: '99.5' });
    assert.equal(decimal.status, 303);

    const list = await client.get('/scores');
    const text = textContent(list.text);
    assert.match(text, /99\.5/);
    assert.match(text, /100/);
    assert.match(text, /0/);
  });

  it('拒绝非法分值并保留输入', async () => {
    await createSubjectViaHttp(client, '物理');
    const physicsId = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('物理') as { id: number }).id);
    for (const raw of ['', '101', '-1', '100.1', '99.55', '1e2', 'NaN', 'abc']) {
      const response = await createScoreViaHttp(client, { studentId: studentB, subjectId: physicsId, score: raw });
      assert.equal(response.status, 422, `期望 ${JSON.stringify(raw)} 返回 422，实际 ${response.status}`);
      if (raw === '') {
        assert.match(response.text, /该字段为必填项/);
      } else {
        assert.match(response.text, /请输入 0-100 之间且最多一位小数的数值/);
      }
      assert.match(response.text, /请选择考试科目|请输入/);
    }
    const count = server.db.prepare('SELECT COUNT(*) AS total FROM scores WHERE subject_id = ?').get(physicsId) as {
      total: number;
    };
    assert.equal(Number(count.total), 0);
  });

  it('同一学生重复录入同一科目返回 409 并给出编辑直达链接', async () => {
    const existing = server.db
      .prepare('SELECT id FROM scores WHERE student_id = ? AND subject_id = ?')
      .get(studentB, mathId) as { id: number };
    const response = await createScoreViaHttp(client, { studentId: studentB, subjectId: mathId, score: '66' });
    assert.equal(response.status, 409);
    assert.match(response.text, /成绩记录已存在/);
    assert.match(response.text, new RegExp(`/scores/${Number(existing.id)}/edit`));

    const count = server.db
      .prepare('SELECT COUNT(*) AS total FROM scores WHERE student_id = ? AND subject_id = ?')
      .get(studentB, mathId) as { total: number };
    assert.equal(Number(count.total), 1);
  });

  it('数据库唯一约束兜底：绕过服务层也写不进第二条', () => {
    assert.throws(() => {
      server.db
        .prepare('INSERT INTO scores (student_id, subject_id, score_tenths, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(studentB, mathId, 700, new Date().toISOString(), new Date().toISOString());
    }, /UNIQUE constraint failed/);
  });

  it('数据库 CHECK 约束兜底：超出 0-100 与小数被拒绝', () => {
    const student = Number(
      (server.db.prepare('SELECT id FROM students WHERE name = ?').get('演示甲') as { id: number }).id,
    );
    const subject = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('物理') as { id: number }).id);
    assert.throws(() => {
      server.db
        .prepare('INSERT INTO scores (student_id, subject_id, score_tenths, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(student, subject, 1001, new Date().toISOString(), new Date().toISOString());
    }, /CHECK constraint failed/);
  });

  it('编辑成绩：更新分值并阻止改成已存在的学生+科目', async () => {
    const row = server.db
      .prepare('SELECT id FROM scores WHERE student_id = ? AND subject_id = ?')
      .get(studentA, mathId) as { id: number };

    const updated = await client.postForm(`/scores/${row.id}`, {
      student_id: String(studentA),
      subject_id: String(mathId),
      score: '59.9',
    });
    assert.equal(updated.status, 303);
    assert.equal(updated.location, '/scores?flash=score-updated');

    const conflict = await client.postForm(`/scores/${row.id}`, {
      student_id: String(studentB),
      subject_id: String(mathId),
      score: '80',
    });
    assert.equal(conflict.status, 409);
    assert.match(conflict.text, /成绩记录已存在/);

    const unchanged = server.db.prepare('SELECT student_id, score_tenths FROM scores WHERE id = ?').get(row.id) as {
      student_id: number;
      score_tenths: number;
    };
    assert.equal(Number(unchanged.student_id), studentA);
    assert.equal(Number(unchanged.score_tenths), 599);
  });

  it('编辑表单回填当前分值', async () => {
    const row = server.db
      .prepare('SELECT id FROM scores WHERE student_id = ? AND subject_id = ?')
      .get(studentA, mathId) as { id: number };
    const page = await client.get(`/scores/${row.id}/edit`);
    assert.equal(page.status, 200);
    assert.match(page.text, /value="59\.9"/);
  });

  it('删除成绩：确认页 → 删除成功 → 记录消失', async () => {
    const row = server.db
      .prepare('SELECT id FROM scores WHERE student_id = ? AND subject_id = ?')
      .get(studentA, mathId) as { id: number };

    const confirm = await client.get(`/scores/${row.id}/delete-confirm`);
    assert.equal(confirm.status, 200);
    assert.match(confirm.text, /确认删除该成绩/);

    const removed = await client.postForm(`/scores/${row.id}/delete`, {});
    assert.equal(removed.status, 303);
    assert.equal(removed.location, '/scores?flash=score-deleted');

    const missing = await client.get(`/scores/${row.id}/edit`);
    assert.equal(missing.status, 404);
  });

  it('学生详情页可直接带入学生 ID 录入成绩', async () => {
    const page = await client.get(`/students/${studentA}`);
    assert.match(page.text, new RegExp(`/scores/new\\?studentId=${studentA}`));

    const form = await client.get(`/scores/new?studentId=${studentA}`);
    assert.equal(form.status, 200);
    assert.match(form.text, new RegExp(`<option value="${studentA}" selected>`));
  });
});
