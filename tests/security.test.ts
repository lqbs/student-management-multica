import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { TestClient, createStudentViaHttp, startTestServer, type TestServer } from './helpers.js';

describe('请求安全与错误处理', () => {
  let server: TestServer;
  let client: TestClient;

  before(async () => {
    server = await startTestServer();
    client = new TestClient(server.baseUrl);
    await createStudentViaHttp(client, { studentNo: '001', name: '演示甲' });
  });

  after(async () => {
    await server.stop();
  });

  it('缺少 CSRF token 的 POST 被拒绝（403）且不写入数据', async () => {
    const response = await client.postForm('/students', { student_no: 'X-9', name: '伪造请求' }, { csrf: null });
    assert.equal(response.status, 403);
    assert.match(response.text, /CSRF/);
    const count = server.db.prepare('SELECT COUNT(*) AS total FROM students WHERE student_no = ?').get('X-9') as {
      total: number;
    };
    assert.equal(Number(count.total), 0);
  });

  it('CSRF token 错误时被拒绝（403）', async () => {
    const response = await client.postForm(
      '/classes',
      { name: '伪造班级' },
      { csrf: 'not-the-real-token-value' },
    );
    assert.equal(response.status, 403);
  });

  it('表单页面包含 CSRF 隐藏字段与 meta 标记', async () => {
    const page = await client.get('/students/new');
    assert.match(page.text, /name="_csrf" value="[A-Za-z0-9_-]{16,}"/);
    assert.match(page.text, /name="csrf-token" content="[A-Za-z0-9_-]{16,}"/);
  });

  it('GET 不会修改数据：删除只能用 POST', async () => {
    const response = await client.get('/students/1/delete');
    assert.equal(response.status, 404);
    const stillThere = server.db.prepare('SELECT COUNT(*) AS total FROM students WHERE id = 1').get() as {
      total: number;
    };
    assert.equal(Number(stillThere.total), 1);
  });

  it('未找到的页面与记录返回 404 页面', async () => {
    const missingRoute = await client.get('/not-a-real-page');
    assert.equal(missingRoute.status, 404);
    assert.match(missingRoute.text, /页面不存在（404）/);

    const missingStudent = await client.get('/students/9999');
    assert.equal(missingStudent.status, 404);

    const missingScore = await client.get('/scores/9999/edit');
    assert.equal(missingScore.status, 404);
  });

  it('用户输入在页面中被转义，不会注入 HTML/脚本', async () => {
    await createStudentViaHttp(client, { studentNo: 'XSS-1', name: '<script>alert(1)</script>' });
    const page = await client.get('/students?q=XSS-1');
    assert.doesNotMatch(page.text, /<script>alert\(1\)<\/script>/);
    assert.match(page.text, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  });

  it('健康检查接口可用', async () => {
    const response = await client.get('/healthz');
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.text), { status: 'ok' });
  });

  it('根路径重定向到学生档案', async () => {
    const response = await client.get('/');
    assert.equal(response.status, 302);
    assert.equal(response.location, '/students');
  });
});
