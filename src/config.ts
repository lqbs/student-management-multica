import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 从给定目录向上查找包含 package.json 的目录，兼容 src/ 与 dist/src/ 两种运行位置。 */
function findProjectRoot(startDir: string): string {
  let dir = startDir;
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  throw new Error(`无法定位项目根目录（起点：${startDir}）`);
}

export const projectRoot: string = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));
export const viewsDir: string = path.join(projectRoot, 'src', 'views');
export const publicDir: string = path.join(projectRoot, 'src', 'public');
export const dataDir: string = path.join(projectRoot, 'data');

/** 数据库默认位于仓库根目录 data/ 下，可用 DATABASE_PATH 覆盖（相对路径按项目根解析）。 */
export function resolveDatabasePath(): string {
  const override = process.env.DATABASE_PATH?.trim();
  if (override) {
    return path.isAbsolute(override) ? override : path.resolve(projectRoot, override);
  }
  return path.join(dataDir, 'student-management.sqlite');
}

export function resolveHost(): string {
  return process.env.HOST?.trim() || '127.0.0.1';
}

export function resolvePort(): number {
  const raw = process.env.PORT?.trim();
  if (!raw) {
    return 3000;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
    throw new Error(`PORT 不是合法端口：${raw}`);
  }
  return parsed;
}

export function nowIso(): string {
  return new Date().toISOString();
}
