import { pathToFileURL } from 'node:url';

import { resolveDatabasePath } from '../config.js';
import { createDatabase } from './index.js';
import { listAppliedMigrations } from './migrations.js';

function isMainModule(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(entry).href === moduleUrl;
}

if (isMainModule(import.meta.url)) {
  const db = createDatabase();
  try {
    const applied = listAppliedMigrations(db);
    console.log(`数据库位置：${resolveDatabasePath()}`);
    console.log(`已应用迁移版本：${applied.map((row) => row.version).join(', ') || '（无）'}`);
  } finally {
    db.close();
  }
}
