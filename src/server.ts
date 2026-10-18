import { resolveDatabasePath, resolveHost, resolvePort } from './config.js';
import { createApp } from './app.js';
import { closeSharedDatabase, getSharedDatabase } from './db/index.js';

// 使用共享连接：正常停服时由 closeSharedDatabase() 统一关闭，
// 关闭会触发 SQLite 的 WAL checkpoint，只保留主库文件（避免备份时丢最新数据）。
const db = getSharedDatabase();
const app = createApp({ db });
const host = resolveHost();
const port = resolvePort();

const server = app.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : port;
  console.log('学生管理系统已启动');
  console.log(`  访问地址：http://${host}:${actualPort}`);
  console.log(`  数据库文件：${resolveDatabasePath()}`);
  console.log('  按 Ctrl+C 停止服务');
});

let shuttingDown = false;
let finished = false;

function finish(code: number): void {
  if (finished) {
    return;
  }
  finished = true;
  try {
    closeSharedDatabase();
  } catch (error) {
    console.error('关闭数据库连接失败：', error);
  }
  process.exit(code);
}

/**
 * 优雅关闭：停止接收新请求 → 只断开空闲 keep-alive 连接（进行中的请求正常完成）
 * → 关闭数据库连接（WAL checkpoint）→ 退出。5 秒兜底强制关闭剩余连接。
 */
function shutdown(signal: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`\n收到 ${signal}，正在关闭服务…`);

  server.close(() => finish(0));
  server.closeIdleConnections();

  const timer = setTimeout(() => {
    server.closeAllConnections();
    finish(0);
  }, 5000);
  timer.unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
