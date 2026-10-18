import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { TestClient, createClassViaHttp, createScoreViaHttp, startTestServer, textContent, type TestServer } from './helpers.js';

describe('学生档案：CRUD、唯一性、转班与级联删除', () => {
  let server: TestServer;
  let client: TestClient;
  let studentId: number;
  let classId: number;
  let subjectId: number;

  before(async () => {
    server = await startTestServer();
    client = new TestClient(server.baseUrl);
    await createClassViaHttp(client, '高一(1)班');
    await client.postForm('/subjects', { name: '数学' });
    classId = Number((server.db.prepare('SELECT id FROM classes WHERE name = ?').get('高一(1)班') as { id: number }).id);
    subjectId = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('数学') as { id: number }).id);
  });

  after(async () => {
    await server.stop();
  });

  it('新增学生：学号转大写并完整保留前导零', async () => {
    const response = await client.postForm('/students', { student_no: ' 001 ', name: '演示甲', class_id: String(classId) });
    assert.equal(response.status, 303);
    assert.equal(response.location, '/students?flash=student-created');

    const list = await client.get('/students');
    assert.match(list.text, />001</);
    assert.match(list.text, /演示甲/);
    assert.match(list.text, /高一\(1\)班/);

    const row = server.db.prepare('SELECT id, student_no, class_id FROM students WHERE name = ?').get('演示甲') as {
      id: number;
      student_no: string;
      class_id: number;
    };
    studentId = Number(row.id);
    assert.equal(row.student_no, '001');
    assert.equal(Number(row.class_id), classId);

    const detail = await client.get(`/students/${studentId}`);
    assert.equal(detail.status, 200);
    assert.match(detail.text, />001</);
    assert.match(detail.text, /该学生暂未录入任何成绩/);

    const edit = await client.get(`/students/${studentId}/edit`);
    assert.match(edit.text, /value="001"/);
  });

  it('学号大小写冲突时返回 422 并保留输入', async () => {
    const response = await client.postForm('/students', { student_no: 's-01', name: '演示乙', class_id: '' });
    assert.equal(response.status, 303);

    const conflict = await client.postForm('/students', { student_no: 'S-01', name: '演示丙', class_id: '' });
    assert.equal(conflict.status, 422);
    assert.match(conflict.text, /学号已存在，请使用其他学号/);
    assert.match(conflict.text, /value="S-01"/);
    assert.match(conflict.text, /value="演示丙"/);
    const count = server.db.prepare('SELECT COUNT(*) AS total FROM students WHERE student_no = ?').get('S-01') as {
      total: number;
    };
    assert.equal(Number(count.total), 1);
  });

  it('空姓名与非法班级返回 422', async () => {
    const emptyName = await client.postForm('/students', { student_no: '002', name: '   ', class_id: '' });
    assert.equal(emptyName.status, 422);
    assert.match(emptyName.text, /该字段为必填项/);

    const badStudentNo = await client.postForm('/students', { student_no: '001 002', name: '演示丁', class_id: '' });
    assert.equal(badStudentNo.status, 422);
    assert.match(badStudentNo.text, /学号只能包含字母、数字和连字符/);

    const missingClass = await client.postForm('/students', { student_no: '003', name: '演示戊', class_id: '99999' });
    assert.equal(missingClass.status, 422);
    assert.match(missingClass.text, /所选班级不存在/);
  });

  it('转班不影响已有成绩', async () => {
    const score = await createScoreViaHttp(client, { studentId, subjectId, score: '88.5' });
    assert.equal(score.status, 303);

    const transfer = await client.postForm(`/students/${studentId}`, {
      student_no: '001',
      name: '演示甲',
      class_id: '',
    });
    assert.equal(transfer.status, 303);
    assert.equal(transfer.location, '/students?flash=student-updated');

    const unassigned = await client.get('/students?classId=unassigned');
    assert.match(unassigned.text, /演示甲/);
    assert.match(textContent(unassigned.text), /未分班/);

    const scores = await client.get('/scores');
    assert.match(scores.text, /演示甲/);
    assert.match(scores.text, /88\.5/);
    assert.match(scores.text, /未分班/);

    const back = await client.postForm(`/students/${studentId}`, {
      student_no: '001',
      name: '演示甲',
      class_id: String(classId),
    });
    assert.equal(back.status, 303);
    const row = server.db.prepare('SELECT class_id FROM students WHERE id = ?').get(studentId) as { class_id: number };
    assert.equal(Number(row.class_id), classId);
  });

  it('删除确认页明确提示级联删除成绩', async () => {
    const page = await client.get(`/students/${studentId}/delete-confirm`);
    assert.equal(page.status, 200);
    assert.match(page.text, /将同步删除的成绩/);
    assert.match(textContent(page.text), /1 条/);
    assert.match(page.text, /数学/);
  });

  it('删除学生后其成绩一并消失（级联删除）', async () => {
    const before = server.db.prepare('SELECT COUNT(*) AS total FROM scores WHERE student_id = ?').get(studentId) as {
      total: number;
    };
    assert.equal(Number(before.total), 1);
    const scoreId = Number(
      (server.db.prepare('SELECT id FROM scores WHERE student_id = ?').get(studentId) as { id: number }).id,
    );

    const response = await client.postForm(`/students/${studentId}/delete`, {});
    assert.equal(response.status, 303);
    assert.equal(response.location, '/students?flash=student-deleted');

    const after = server.db.prepare('SELECT COUNT(*) AS total FROM scores WHERE student_id = ?').get(studentId) as {
      total: number;
    };
    assert.equal(Number(after.total), 0);

    const missingScore = await client.get(`/scores/${scoreId}/edit`);
    assert.equal(missingScore.status, 404);
    const missingStudent = await client.get(`/students/${studentId}`);
    assert.equal(missingStudent.status, 404);
  });

  it('删除确认页不会写入数据（取消路径）', async () => {
    const before = server.db.prepare('SELECT COUNT(*) AS total FROM students').get() as { total: number };
    const remaining = server.db.prepare('SELECT id FROM students ORDER BY id LIMIT 1').get() as { id: number };
    const page = await client.get(`/students/${Number(remaining.id)}/delete-confirm`);
    assert.equal(page.status, 200);
    const after = server.db.prepare('SELECT COUNT(*) AS total FROM students').get() as { total: number };
    assert.equal(Number(after.total), Number(before.total));
  });
});
