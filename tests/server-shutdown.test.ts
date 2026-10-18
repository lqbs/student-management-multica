import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { TestClient, createStudentViaHttp, createTempDatabaseFile } from './helpers.js';

// dist/tests/<this file> → 仓库根
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const serverEntry = path.join(projectRoot, 'dist', 'src', 'server.js');

interface RunningServer {
  child: ChildProcess;
  baseUrl: string;
}

function startServerProcess(databaseFile: string): Promise<RunningServer> {
  const child = spawn(process.execPath, [serverEntry], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_PATH: databaseFile, HOST: '127.0.0.1', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return new Promise<RunningServer>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`服务启动超时：${output}`)), 20000);
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /访问地址：http:\/\/127\.0\.0\.1:(\d+)/.exec(output);
      if (match && match[1]) {
        clearTimeout(timer);
        resolve({ child, baseUrl: `http://127.0.0.1:${match[1]}` });
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`服务提前退出（code=${code}）：${output}`));
    });
  });
}

function waitForExit(child: ChildProcess, timeoutMs = 15000): Promise<number | null> {
  return new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('等待进程退出超时')), timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

describe('停服与 WAL 合并（D1 回归）', () => {
  it('SIGINT 正常停服后关闭连接、合并 WAL，仅复制主库文件即可读到最新数据', async () => {
    const databaseFile = createTempDatabaseFile();
    const { child, baseUrl } = await startServerProcess(databaseFile);

    try {
      const client = new TestClient(baseUrl);
      // 写入发生在服务进程自己的连接上，才能验证“未关闭连接会丢最新数据”的场景
      await createStudentViaHttp(client, { studentNo: '001', name: '停服验证学生' });
      const exitPromise = waitForExit(child);
      child.kill('SIGINT');
      const code = await exitPromise;
      assert.equal(code, 0, 'SIGINT 停服应以退出码 0 结束');
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }

    assert.equal(fs.existsSync(`${databaseFile}-wal`), false, '正常停服后不应残留 -wal 文件');
    assert.equal(fs.existsSync(`${databaseFile}-shm`), false, '正常停服后不应残留 -shm 文件');

    // 只复制主库文件：应包含停服前写入的全部数据
    const copyDir = fs.mkdtempSync(path.join(path.dirname(databaseFile), 'copy-'));
    const copiedFile = path.join(copyDir, 'student-management.sqlite');
    fs.copyFileSync(databaseFile, copiedFile);

    const copied = new DatabaseSync(copiedFile);
    try {
      const table = copied
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'students'")
        .get() as { name: string } | undefined;
      assert.ok(table, '仅复制主库文件后应仍包含 students 表（不应出现 no such table）');

      const row = copied.prepare('SELECT student_no, name FROM students').get() as
        | { student_no: string; name: string }
        | undefined;
      assert.deepEqual(row && { student_no: row.student_no, name: row.name }, {
        student_no: '001',
        name: '停服验证学生',
      });
    } finally {
      copied.close();
    }
  });

  it('运行期间确实存在 WAL 文件（说明上面的断言验证的是真实场景）', async () => {
    const databaseFile = createTempDatabaseFile();
    const { child, baseUrl } = await startServerProcess(databaseFile);
    try {
      const client = new TestClient(baseUrl);
      await createStudentViaHttp(client, { studentNo: '002', name: 'WAL 存在性学生' });
      assert.equal(fs.existsSync(`${databaseFile}-wal`), true, '运行期间的 WAL 文件应当存在');
    } finally {
      const exitPromise = waitForExit(child);
      child.kill('SIGINT');
      await exitPromise;
    }
    assert.equal(fs.existsSync(`${databaseFile}-wal`), false, '停服后 WAL 文件应被移除');
  });
});
