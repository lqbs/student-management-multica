import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { TestClient, createClassViaHttp, createScoreViaHttp, createStudentViaHttp, createSubjectViaHttp, startTestServer, textContent, type TestServer } from './helpers.js';

describe('班级与科目：重名校验与关联删除保护', () => {
  let server: TestServer;
  let client: TestClient;
  let classWithStudentId: number;
  let emptyClassId: number;
  let subjectId: number;

  before(async () => {
    server = await startTestServer();
    client = new TestClient(server.baseUrl);
  });

  after(async () => {
    await server.stop();
  });

  it('创建班级并拒绝重名', async () => {
    const created = await client.postForm('/classes', { name: '高一(1)班' });
    assert.equal(created.status, 303);
    assert.equal(created.location, '/classes?flash=class-created');

    const duplicated = await client.postForm('/classes', { name: '高一(1)班' });
    assert.equal(duplicated.status, 422);
    assert.match(duplicated.text, /班级名称已存在，请勿重复添加/);

    const emptyName = await client.postForm('/classes', { name: '   ' });
    assert.equal(emptyName.status, 422);
    assert.match(emptyName.text, /该字段为必填项/);

    classWithStudentId = Number(
      (server.db.prepare('SELECT id FROM classes WHERE name = ?').get('高一(1)班') as { id: number }).id,
    );
    await createClassViaHttp(client, '空的竞赛班');
    emptyClassId = Number(
      (server.db.prepare('SELECT id FROM classes WHERE name = ?').get('空的竞赛班') as { id: number }).id,
    );
    await createStudentViaHttp(client, { studentNo: '001', name: '演示甲', classId: classWithStudentId });
  });

  it('班级列表实时展示在读人数', async () => {
    const page = await client.get('/classes');
    assert.equal(page.status, 200);
    assert.match(page.text, /高一\(1\)班/);
    const text = textContent(page.text);
    assert.match(text, /1 人/);
    assert.match(text, /0 人/);
  });

  it('班级内仍有学生时删除被拦截并返回 409', async () => {
    const response = await client.postForm(`/classes/${classWithStudentId}/delete`, {});
    assert.equal(response.status, 409);
    assert.match(response.text, /无法删除该班级/);
    assert.match(textContent(response.text), /共有 1 名学生/);

    const stillThere = server.db.prepare('SELECT COUNT(*) AS total FROM classes WHERE id = ?').get(classWithStudentId) as {
      total: number;
    };
    assert.equal(Number(stillThere.total), 1);
  });

  it('空班级删除成功并重定向带回成功提示', async () => {
    const response = await client.postForm(`/classes/${emptyClassId}/delete`, {});
    assert.equal(response.status, 303);
    assert.equal(response.location, '/classes?flash=class-deleted');
    const follow = await client.get(response.location);
    assert.match(follow.text, /班级删除成功/);
    assert.doesNotMatch(follow.text, /空的竞赛班/);
  });

  it('重命名班级与空班级名称校验', async () => {
    const renamed = await client.postForm(`/classes/${classWithStudentId}`, { name: '高一(1)班（改）' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.location, '/classes?flash=class-updated');
    const page = await client.get('/classes');
    assert.match(page.text, /高一\(1\)班（改）/);
  });

  it('科目重名校验与唯一性', async () => {
    await createSubjectViaHttp(client, '数学');
    const duplicated = await client.postForm('/subjects', { name: '数学' });
    assert.equal(duplicated.status, 422);
    assert.match(duplicated.text, /科目名称已存在，请勿重复添加/);

    subjectId = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('数学') as { id: number }).id);
    const studentId = Number((server.db.prepare('SELECT id FROM students LIMIT 1').get() as { id: number }).id);
    const score = await createScoreViaHttp(client, { studentId, subjectId, score: '90' });
    assert.equal(score.status, 303);
  });

  it('已关联成绩的科目删除被拦截（409），改名为允许操作', async () => {
    const blocked = await client.postForm(`/subjects/${subjectId}/delete`, {});
    assert.equal(blocked.status, 409);
    assert.match(blocked.text, /无法删除科目/);
    assert.match(textContent(blocked.text), /1 条成绩记录/);

    const renamed = await client.postForm(`/subjects/${subjectId}`, { name: '高等数学' });
    assert.equal(renamed.status, 303);
    assert.equal(renamed.location, '/subjects?flash=subject-updated');

    const list = await client.get('/subjects');
    assert.match(list.text, /高等数学/);
  });

  it('未关联成绩的科目可删除', async () => {
    await createSubjectViaHttp(client, '临时科目');
    const tempId = Number(
      (server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('临时科目') as { id: number }).id,
    );
    const response = await client.postForm(`/subjects/${tempId}/delete`, {});
    assert.equal(response.status, 303);
    assert.equal(response.location, '/subjects?flash=subject-deleted');
    const count = server.db.prepare('SELECT COUNT(*) AS total FROM subjects WHERE id = ?').get(tempId) as {
      total: number;
    };
    assert.equal(Number(count.total), 0);
  });
});
