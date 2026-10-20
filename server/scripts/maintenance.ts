import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const [action, source, target] = process.argv.slice(2);
try {
  if (action === 'backup' && source) {
    if (fs.existsSync(source)) throw new Error('Backup destination already exists. Choose a new filename.');
    const { documentRepository } = await import('../repositories/documentRepository');
    documentRepository.backup(source);
    console.log('Consistent SQLite backup created. Store it on an encrypted, access-controlled volume.');
  } else if (action === 'restore' && source && target) {
    if (fs.existsSync(target)) throw new Error('Restore never overwrites a database. Choose a new filename.');
    if (fs.existsSync(path.resolve(source) + '-wal')) throw new Error('Restore requires a standalone backup, not an active WAL database. Create a backup first.');
    const backup = new DatabaseSync(path.resolve(source), { readOnly: true });
    try {
      const check = backup.prepare('PRAGMA integrity_check').get() as Record<string, unknown>;
      if (Object.values(check)[0] !== 'ok') throw new Error('Backup integrity check failed.');
      for (const table of ['documents', 'settings', 'events']) backup.prepare('SELECT * FROM ' + table + ' LIMIT 1').get();
    } finally { backup.close(); }
    fs.copyFileSync(path.resolve(source), path.resolve(target), fs.constants.COPYFILE_EXCL);
    console.log('Restored to a new file. Stop the app, set DATA_PATH to that absolute path, then restart.');
  } else { throw new Error('Usage: npm run backup -- destination.sqlite OR npm run restore -- backup.sqlite new-database.sqlite'); }
} catch (error) { console.error(error instanceof Error ? error.message : 'Maintenance failed.'); process.exitCode = 1; }
