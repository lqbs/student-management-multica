import { resolveDatabasePath, resolveHost, resolvePort } from './config.js';
import { createApp } from './app.js';
import { closeSharedDatabase, createDatabase } from './db/index.js';

const db = createDatabase();
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

function shutdown(signal: string): void {
  console.log(`\n收到 ${signal}，正在关闭服务…`);
  server.close(() => {
    closeSharedDatabase();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
