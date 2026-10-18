/**
 * 开发模式：并行运行 tsc --watch 与 node --watch dist/src/server.js。
 * 无需额外依赖；生产/演示请使用 npm run build && npm start。
 */
import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let shuttingDown = false;

function terminateAll() {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
  // 宽限期后强制收尾，避免 --watch 子进程残留占用端口
  setTimeout(() => {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
      }
    }
    process.exit(0);
  }, 2000);
}

function shutdown(code) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  terminateAll();
  process.exitCode = code;
}

function run(command, args, name) {
  const child = spawn(command, args, { stdio: 'inherit' });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (signal || shuttingDown) {
      return;
    }
    console.log(`[dev] ${name} 退出（code=${code}），停止全部子进程。`);
    shutdown(code ?? 0);
  });
  return child;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

console.log('[dev] 启动 TypeScript 增量编译与 Node 热重启…');
run(npmCommand, ['run', 'build', '--', '--watch', '--preserveWatchOutput'], 'tsc');
run(process.execPath, ['--watch', 'dist/src/server.js'], 'server');
