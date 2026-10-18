import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
  TestClient,
  countTableRows,
  createClassViaHttp,
  createScoreViaHttp,
  createStudentViaHttp,
  createSubjectViaHttp,
  firstIdFor,
  startTestServer,
  textContent,
  type TestServer,
} from './helpers.js';

describe('列表：组合筛选、分页保留与空状态', () => {
  let server: TestServer;
  let client: TestClient;
  let classOneId: number;
  let classTwoId: number;

  before(async () => {
    server = await startTestServer();
    client = new TestClient(server.baseUrl);
    await createClassViaHttp(client, '高一(1)班');
    await createClassViaHttp(client, '高一(2)班');
    classOneId = firstIdFor(server.db, 'classes', '高一(1)班');
    classTwoId = firstIdFor(server.db, 'classes', '高一(2)班');

    await createStudentViaHttp(client, { studentNo: '001', name: '演示张', classId: classOneId });
    await createStudentViaHttp(client, { studentNo: '002', name: '演示李', classId: classTwoId });
    await createStudentViaHttp(client, { studentNo: 'S-100', name: '演示王' });
    for (let index = 10; index < 34; index += 1) {
      await createStudentViaHttp(client, {
        studentNo: `P${String(index).padStart(3, '0')}`,
        name: `分页学生${index}`,
        classId: classOneId,
      });
    }
    await createSubjectViaHttp(client, '数学');
    await createSubjectViaHttp(client, '语文');
  });

  after(async () => {
    await server.stop();
  });

  it('按姓名关键字筛选', async () => {
    const page = await client.get(`/students?q=${encodeURIComponent('演示张')}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /演示张/);
    assert.doesNotMatch(page.text, /演示李/);
  });

  it('按学号筛选并忽略大小写（学号查询同样转大写）', async () => {
    const page = await client.get('/students?q=s-100');
    assert.equal(page.status, 200);
    assert.match(page.text, /S-100/);
    assert.match(page.text, /演示王/);
    assert.doesNotMatch(page.text, /演示张/);
  });

  it('未分班筛选用 classId=unassigned 且展示灰色徽章', async () => {
    const page = await client.get('/students?classId=unassigned');
    assert.equal(page.status, 200);
    assert.match(page.text, /演示王/);
    assert.doesNotMatch(page.text, /演示张/);
    assert.match(page.text, /badge--neutral">未分班/);

    const classPage = await client.get(`/students?classId=${classTwoId}`);
    assert.match(classPage.text, /演示李/);
    assert.doesNotMatch(classPage.text, /演示王/);
  });

  it('关键字与班级条件按 AND 组合', async () => {
    const page = await client.get(`/students?q=${encodeURIComponent('分页学生1')}&classId=${classOneId}`);
    assert.match(page.text, /分页学生1[0-9]/);
    assert.equal(countTableRows(page.text), 10);
  });

  it('分页默认 20 条且翻页保留查询参数', async () => {
    const first = await client.get('/students');
    assert.equal(countTableRows(first.text), 20);
    assert.match(first.text, /共 27 条记录/);
    assert.match(first.text, /第 1 \/ 2 页/);

    const filtered = await client.get(`/students?q=${encodeURIComponent('分页学生')}&pageSize=5`);
    assert.equal(countTableRows(filtered.text), 5);
    assert.match(filtered.text, /q=%E5%88%86%E9%A1%B5%E5%AD%A6%E7%94%9F&amp;pageSize=5&amp;page=2/);

    const secondPage = await client.get(`/students?q=${encodeURIComponent('分页学生')}&pageSize=5&page=2`);
    assert.equal(secondPage.status, 200);
    assert.match(secondPage.text, /第 2 \/ 5 页/);
    assert.equal(countTableRows(secondPage.text), 5);

    const thirdPage = await client.get(`/students?q=${encodeURIComponent('分页学生')}&classId=${classOneId}&pageSize=5&page=2`);
    assert.match(thirdPage.text, new RegExp(`classId=${classOneId}`));
    // 第 2 页上的翻页链接必须同时保留 q、classId 与 pageSize（当前页为 span，无 href）
    assert.match(
      thirdPage.text,
      new RegExp(`q=%E5%88%86%E9%A1%B5%E5%AD%A6%E7%94%9F&amp;classId=${classOneId}&amp;pageSize=5&amp;page=3`),
    );
  });

  it('页码越界收敛到最后一页而非报错', async () => {
    const page = await client.get('/students?page=999&pageSize=10');
    assert.equal(page.status, 200);
    assert.match(page.text, /第 3 \/ 3 页/);
    assert.equal(countTableRows(page.text), 7);
  });

  it('区分“未搜索到匹配项”和“系统暂无数据”', async () => {
    const noMatch = await client.get('/students?q=zzzz-not-exist');
    assert.match(noMatch.text, /未找到符合条件的记录/);
    assert.doesNotMatch(noMatch.text, /暂无学生数据/);

    const emptyServer = await startTestServer();
    try {
      const emptyClient = new TestClient(emptyServer.baseUrl);
      const emptyPage = await emptyClient.get('/students');
      assert.match(emptyPage.text, /暂无学生数据/);
      assert.match(emptyPage.text, /添加新学生/);
      const emptyScores = await emptyClient.get('/scores');
      assert.match(emptyScores.text, /暂无成绩数据/);
    } finally {
      await emptyServer.stop();
    }
  });

  it('LIKE 通配符按普通字符处理（% 不会匹配所有记录）', async () => {
    const page = await client.get('/students?q=%25');
    assert.match(page.text, /未找到符合条件的记录/);
    assert.doesNotMatch(page.text, /演示张/);
  });

  it('成绩列表支持学生关键字、班级与科目组合筛选', async () => {
    const studentId = firstIdFor(server.db, 'students', '演示张');
    const mathId = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('数学') as { id: number }).id);
    const chineseId = Number(
      (server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('语文') as { id: number }).id,
    );
    await createScoreViaHttp(client, { studentId, subjectId: mathId, score: '77' });
    await createScoreViaHttp(client, { studentId, subjectId: chineseId, score: '88' });

    const bySubject = await client.get(`/scores?subjectId=${chineseId}`);
    assert.equal(countTableRows(bySubject.text), 1);
    assert.match(bySubject.text, /88/);

    const byClassAndSubject = await client.get(`/scores?classId=${classOneId}&subjectId=${mathId}`);
    assert.equal(countTableRows(byClassAndSubject.text), 1);
    assert.match(byClassAndSubject.text, /演示张/);

    const byKeyword = await client.get(`/scores?q=${encodeURIComponent('演示李')}`);
    assert.match(byKeyword.text, /未找到符合条件的记录/);

    const secondStudentId = firstIdFor(server.db, 'students', '演示李');
    await createScoreViaHttp(client, { studentId: secondStudentId, subjectId: mathId, score: '66.5' });

    const paging = await client.get(`/scores?subjectId=${mathId}&pageSize=1`);
    assert.equal(countTableRows(paging.text), 1);
    assert.match(paging.text, new RegExp(`subjectId=${mathId}&amp;pageSize=1&amp;page=2`));
    const secondPage = await client.get(`/scores?subjectId=${mathId}&pageSize=1&page=2`);
    assert.equal(countTableRows(secondPage.text), 1);
    assert.match(secondPage.text, /第 2 \/ 2 页/);
  });

  it('未分班学生在成绩列表显示未分班徽章', async () => {
    const studentId = firstIdFor(server.db, 'students', '演示王');
    const mathId = Number((server.db.prepare('SELECT id FROM subjects WHERE name = ?').get('数学') as { id: number }).id);
    await createScoreViaHttp(client, { studentId, subjectId: mathId, score: '61' });
    const page = await client.get('/scores?classId=unassigned');
    assert.match(page.text, /演示王/);
    assert.match(textContent(page.text), /未分班/);
  });
});
