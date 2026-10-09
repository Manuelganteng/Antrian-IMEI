import 'dotenv/config';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { validateProduction } from '../lib/config';

let child: ChildProcess | undefined;
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  stopping = true;
  if (child) child.kill(signal);
  else process.exit(0);
});
function run(args: string[], env = process.env) {
  return new Promise<void>((resolve, reject) => {
    if (stopping) return reject(new Error('Startup dihentikan.'));
    child = spawn(process.execPath, args, { stdio: 'inherit', env });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      child = undefined;
      if (stopping || code === 0) resolve();
      else reject(new Error(`Proses aplikasi berhenti (${signal || code}).`));
    });
  });
}
async function main() {
  const config = validateProduction();
  // Create only if missing. Append mode preserves an existing database on restart.
  const databasePath = decodeURIComponent(process.env.DATABASE_URL!.slice(5).split('?')[0]);
  await mkdir(dirname(databasePath), { recursive: true });
  await (await open(databasePath, 'a', 0o600)).close();
  console.log('Memeriksa migrasi database produksi…');
  await run(['node_modules/prisma/build/index.js', 'migrate', 'deploy']);
  if (stopping) return;
  const { bootstrapProduction } = await import('../lib/bootstrap');
  const { db } = await import('../lib/db');
  try {
    const result = await bootstrapProduction();
    console.log(result.adminCreated ? 'Database dan akun admin produksi siap.' : 'Database siap; akun dan pengaturan yang ada dipertahankan.');
  } finally { await db.$disconnect(); }
  if (stopping) return;
  const runtimeEnv: NodeJS.ProcessEnv = { ...process.env, APP_URL: config.origin, NODE_ENV: 'production' };
  // The long-running web process does not need bootstrap credentials.
  delete runtimeEnv.ADMIN_PASSWORD;
  console.log(`Menjalankan aplikasi pada port ${config.port}.`);
  await run(['node_modules/next/dist/bin/next', 'start', '--hostname', '0.0.0.0', '--port', String(config.port)], runtimeEnv);
}
main().catch(error => { console.error('Gagal menyiapkan aplikasi:', error instanceof Error ? error.message : 'Konfigurasi tidak valid.'); process.exitCode = 1; });
