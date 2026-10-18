/**
 * 端到端验收走查（不进入 npm test）：以真实子进程启动服务，按 README《演示步骤》走一遍主要流程。
 * 前置：数据库已执行 db:seed（全新初始化或 `--force` 重置后的库均可）。
 * 用法：node scripts/acceptance-walkthrough.mjs
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = process.env.PORT ?? '3211';
const baseUrl = `http://127.0.0.1:${port}`;
const cookies = new Map();
let csrf = null;
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ` — ${detail}` : ''}`);
}

function startServer() {
  // 故意用项目根之外的 cwd 启动，验证数据库路径按项目根定位
  const child = spawn(process.execPath, [path.join(projectRoot, 'dist/src/server.js')], {
    cwd: projectRoot,
    env: { ...process.env, PORT: port, HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('学生管理系统已启动')) {
        resolve(child);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', reject);
    child.on('exit', (code) => reject(new Error(`服务提前退出（code=${code}）：${output}`)));
    setTimeout(() => reject(new Error(`启动超时：${output}`)), 15000);
  });
}

async function stopServer(child) {
  await new Promise((resolve) => {
    child.once('exit', resolve);
    child.kill('SIGINT');
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000).unref();
  });
}

async function request(pathname, init = {}) {
  const headers = new Headers(init.headers);
  if (cookies.size > 0) {
    headers.set('cookie', [...cookies].map(([k, v]) => `${k}=${v}`).join('; '));
  }
  const response = await fetch(new URL(pathname, baseUrl), { ...init, headers, redirect: 'manual' });
  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(';')[0] ?? '';
    const index = pair.indexOf('=');
    if (index > 0) {
      cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }
  return { status: response.status, location: response.headers.get('location') ?? '', text: await response.text() };
}

async function ensureCsrf() {
  if (csrf) {
    return csrf;
  }
  const page = await request('/students');
  const match = /name="csrf-token" content="([^"]+)"/.exec(page.text);
  if (!match) {
    throw new Error('未获取到 CSRF token');
  }
  csrf = match[1];
  return csrf;
}

/**
 * 从列表页按名称解析记录 ID，避免硬编码自增主键：
 * `db:seed -- --force` 重置过的库中班级 / 科目 ID 与全新初始化不同。
 */
function findIdByName(html, name, section) {
  for (const row of html.split('<tr>')) {
    if (!row.includes(name)) {
      continue;
    }
    const match = new RegExp(`/${section}/(\\d+)/edit`).exec(row);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

async function postForm(pathname, fields) {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    body.set(key, String(value));
  }
  body.set('_csrf', await ensureCsrf());
  return request(pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
}

const server = await startServer();
try {
  const list = await request('/students');
  record('学生列表可访问且示例学号保留前导零', list.status === 200 && list.text.includes('>001<'), `HTTP ${list.status}`);

  const unassigned = await request('/students?classId=unassigned');
  record('未分班筛选生效', unassigned.status === 200 && unassigned.text.includes('演示学生06'), `HTTP ${unassigned.status}`);

  // 动态解析种子数据中的班级 / 科目 ID（与自增序列无关）
  const classId = findIdByName((await request('/classes')).text, '高一(1)班', 'classes');
  const subjectId = findIdByName((await request('/subjects')).text, '数学', 'subjects');
  record('按名称解析种子班级与科目 ID', classId !== null && subjectId !== null, `classId=${classId} subjectId=${subjectId}`);
  if (classId === null || subjectId === null) {
    throw new Error('未能解析种子数据的班级 / 科目 ID，无法继续走查');
  }

  const created = await postForm('/students', { student_no: '007', name: '走查学生', class_id: '' });
  record('新增学生成功并重定向', created.status === 303 && created.location.includes('flash=student-created'), created.location);

  const duplicated = await postForm('/students', { student_no: '007', name: '走查学生2', class_id: '' });
  record('学号重复返回 422 且保留输入', duplicated.status === 422 && duplicated.text.includes('学号已存在') && duplicated.text.includes('value="007"'));

  const studentRow = /\/students\/(\d+)\/edit/.exec((await request('/students?q=007')).text);
  const studentId = studentRow ? Number(studentRow[1]) : null;
  record('可通过搜索定位新建学生', studentId !== null, `studentId=${studentId}`);

  const badScore = await postForm('/scores', { student_id: String(studentId), subject_id: String(subjectId), score: '99.55' });
  record('成绩两位小数被 422 拒绝', badScore.status === 422 && badScore.text.includes('最多一位小数'));

  const okScore = await postForm('/scores', { student_id: String(studentId), subject_id: String(subjectId), score: '99.5' });
  record('成绩 99.5 录入成功', okScore.status === 303, okScore.location);

  const duplicatedScore = await postForm('/scores', {
    student_id: String(studentId),
    subject_id: String(subjectId),
    score: '88',
  });
  record(
    '重复成绩返回 409 并给出编辑链接',
    duplicatedScore.status === 409 && duplicatedScore.text.includes('成绩记录已存在') && /\/scores\/\d+\/edit/.test(duplicatedScore.text),
  );

  const blockedClass = await postForm(`/classes/${classId}/delete`, {});
  record('有学生的班级删除被 409 拦截', blockedClass.status === 409 && blockedClass.text.includes('无法删除该班级'));

  const blockedSubject = await postForm(`/subjects/${subjectId}/delete`, {});
  record('有成绩的科目删除被 409 拦截', blockedSubject.status === 409 && blockedSubject.text.includes('无法删除科目'));

  const confirmPage = await request(`/students/${studentId}/delete-confirm`);
  record('学生删除确认页提示级联删除成绩', confirmPage.status === 200 && confirmPage.text.includes('将同步删除的成绩'));

  const renamed = await postForm(`/students/${studentId}`, {
    student_no: '007',
    name: '走查学生（改）',
    class_id: String(classId),
  });
  record('转班 / 改名成功', renamed.status === 303 && renamed.location.includes('flash=student-updated'));
} finally {
  await stopServer(server);
}

// 重启验证持久化（不重新初始化数据）
const restarted = await startServer();
try {
  const list = await request('/students?q=007');
  record(
    '重启服务后数据仍然保留（含转班）',
    list.status === 200 && list.text.includes('走查学生（改）') && list.text.includes('高一(1)班'),
  );
  const scores = await request('/scores?q=007');
  record('重启服务后成绩仍然保留', scores.status === 200 && scores.text.includes('99.5'));
} finally {
  await stopServer(restarted);
}

const failed = results.filter((item) => !item.ok);
console.log(`\n走查结果：${results.length - failed.length}/${results.length} 项通过`);
if (failed.length > 0) {
  process.exitCode = 1;
}
