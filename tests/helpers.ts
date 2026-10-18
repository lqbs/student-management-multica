import fs from 'node:fs';
import type { Server } from 'node:http';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../src/app.js';
import { createDatabase, type Database } from '../src/db/index.js';
import { seedDatabase } from '../src/db/seed.js';

export interface TestServer {
  baseUrl: string;
  db: Database;
  databaseFile: string;
  stop(): Promise<void>;
}

export function createTempDatabaseFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'student-management-test-'));
  return path.join(dir, 'test.sqlite');
}

export async function startTestServer(
  options: { seed?: boolean; databaseFile?: string; migrate?: boolean } = {},
): Promise<TestServer> {
  const databaseFile = options.databaseFile ?? createTempDatabaseFile();
  const db = createDatabase(databaseFile, { migrate: options.migrate });
  if (options.seed) {
    seedDatabase(db);
  }
  const app = createApp({ db });
  const server: Server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    db,
    databaseFile,
    async stop(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      db.close();
    },
  };
}

export interface ClientResponse {
  status: number;
  location: string;
  text: string;
}

/** 带 Cookie 会话的最小测试客户端：GET/POST 表单并自动携带 CSRF token。 */
export class TestClient {
  private readonly cookies = new Map<string, string>();
  private csrfToken: string | null = null;

  constructor(readonly baseUrl: string) {}

  private cookieHeader(): string {
    return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
  }

  private storeCookies(response: Response): void {
    for (const raw of response.headers.getSetCookie()) {
      const pair = raw.split(';')[0] ?? '';
      const index = pair.indexOf('=');
      if (index <= 0) {
        continue;
      }
      this.cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
  }

  async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    const cookie = this.cookieHeader();
    if (cookie) {
      headers.set('cookie', cookie);
    }
    const response = await fetch(new URL(path, this.baseUrl), { ...init, headers, redirect: 'manual' });
    this.storeCookies(response);
    return response;
  }

  async get(path: string): Promise<ClientResponse> {
    const response = await this.fetch(path, { method: 'GET' });
    return { status: response.status, location: response.headers.get('location') ?? '', text: await response.text() };
  }

  async ensureCsrfToken(): Promise<string> {
    if (this.csrfToken) {
      return this.csrfToken;
    }
    const page = await this.get('/students');
    const match = /name="csrf-token" content="([^"]+)"/.exec(page.text);
    if (!match || !match[1]) {
      throw new Error('未能从页面中获取 CSRF token');
    }
    this.csrfToken = match[1];
    return this.csrfToken;
  }

  async postForm(
    path: string,
    fields: Record<string, string | number>,
    options: { csrf?: string | null } = {},
  ): Promise<ClientResponse> {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
      body.set(key, String(value));
    }
    const token = options.csrf === undefined ? await this.ensureCsrfToken() : options.csrf;
    if (token) {
      body.set('_csrf', token);
    }
    const response = await this.fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    return { status: response.status, location: response.headers.get('location') ?? '', text: await response.text() };
  }
}

/** 从列表页 HTML 中提取「班级」等页面的可见文本，用于断言。 */
export function textContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function countTableRows(html: string): number {
  const body = /<tbody>([\s\S]*?)<\/tbody>/.exec(html);
  if (!body || !body[1]) {
    return 0;
  }
  return (body[1].match(/<tr>/g) ?? []).length;
}

export async function createStudentViaHttp(
  client: TestClient,
  input: { studentNo: string; name: string; classId?: string | number },
): Promise<void> {
  const response = await client.postForm('/students', {
    student_no: input.studentNo,
    name: input.name,
    class_id: input.classId === undefined ? '' : String(input.classId),
  });
  if (response.status !== 303) {
    throw new Error(`创建学生失败：${response.status} ${response.text.slice(0, 200)}`);
  }
}

export async function createClassViaHttp(client: TestClient, name: string): Promise<void> {
  const response = await client.postForm('/classes', { name });
  if (response.status !== 303) {
    throw new Error(`创建班级失败：${response.status} ${response.text.slice(0, 200)}`);
  }
}

export async function createSubjectViaHttp(client: TestClient, name: string): Promise<void> {
  const response = await client.postForm('/subjects', { name });
  if (response.status !== 303) {
    throw new Error(`创建科目失败：${response.status} ${response.text.slice(0, 200)}`);
  }
}

export async function createScoreViaHttp(
  client: TestClient,
  input: { studentId: number | string; subjectId: number | string; score: string },
): Promise<ClientResponse> {
  return client.postForm('/scores', {
    student_id: String(input.studentId),
    subject_id: String(input.subjectId),
    score: input.score,
  });
}

export function firstIdFor(db: Database, table: 'classes' | 'students' | 'subjects', name: string): number {
  const row = db.prepare(`SELECT id FROM ${table} WHERE name = ? ORDER BY id LIMIT 1`).get(name) as
    | { id: number }
    | undefined;
  if (!row) {
    throw new Error(`未找到 ${table} 记录：${name}`);
  }
  return Number(row.id);
}
