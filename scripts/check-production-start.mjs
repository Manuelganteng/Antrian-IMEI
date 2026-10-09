// Disposable database + dedicated port: verifies the actual production startup sequence.
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
mkdirSync('test-results', { recursive: true });
const origin = 'http://127.0.0.1:3101';
const password = randomBytes(24).toString('hex');
const databaseFile = resolve('test-results', `startup-${Date.now()}.db`);
const env = { ...process.env, NODE_ENV: 'production', PORT: '3101', APP_URL: origin,
  DATABASE_URL: 'file:' + databaseFile.replaceAll('\\', '/'),
  APP_SECRET: randomBytes(32).toString('hex'), COOKIE_SECURE: 'false', TRUST_PROXY: 'false',
  ADMIN_EMAIL: 'deployment-check@example.com', ADMIN_PASSWORD: password };
const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/start-production.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = '';
child.stdout.on('data', data => { logs += data; });
child.stderr.on('data', data => { logs += data; });
try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`Startup gagal: ${logs}`);
    try { ready = (await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert.ok(ready, 'Server produksi tidak siap dalam 30 detik.');
  const response = await fetch(origin + '/api/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email: env.ADMIN_EMAIL, password }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  const admin = await fetch(origin + '/api/admin/data', { headers: { cookie } }).then(r => r.json());
  assert.equal(admin.services.length, 3); assert.equal(admin.counters.length, 3);
  assert.equal(admin.users[0].email, env.ADMIN_EMAIL);
  assert.equal((await fetch(origin + '/api/admin/data')).status, 401);
  console.log('PASS: startup produksi, migrasi database baru, bootstrap admin, health check, login, dan pembatasan akses.');
} finally {
  if (process.platform === 'win32') {
    await new Promise(resolve => { const kill = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); kill.on('exit', resolve); });
  } else child.kill('SIGTERM');
}
