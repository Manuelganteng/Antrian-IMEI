import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { appOrigin, validateProduction } from '../lib/config';
import { verifyPassword } from '../lib/password';

let db: PrismaClient;
let bootstrap: typeof import('../lib/bootstrap').bootstrapProduction;
const settings: NodeJS.ProcessEnv = {
  NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://antrian-test.onrender.com',
  APP_SECRET: 'a'.repeat(64), DATABASE_URL: 'file:/data/antrian.db', COOKIE_SECURE: 'true'
};
before(async () => {
  mkdirSync('test-results', { recursive: true });
  const file = resolve('test-results', `deployment-${Date.now()}.db`);
  process.env.DATABASE_URL = 'file:' + file.replaceAll('\\', '/');
  const sqlite = new DatabaseSync(file);
  for (const migration of readdirSync('prisma/migrations').filter(name => /^\d/.test(name)).sort()) sqlite.exec(readFileSync(`prisma/migrations/${migration}/migration.sql`, 'utf8'));
  sqlite.close();
  db = (await import('../lib/db')).db;
  bootstrap = (await import('../lib/bootstrap')).bootstrapProduction;
});
after(async () => db?.$disconnect());

test('origin Render digunakan otomatis dan domain sendiri dapat menggantikannya', () => {
  assert.equal(appOrigin(settings), 'https://antrian-test.onrender.com');
  assert.equal(appOrigin({ ...settings, APP_URL: 'https://antrian.example.com' }), 'https://antrian.example.com');
  assert.equal(validateProduction(settings).port, 3000);
  assert.equal(validateProduction({ ...settings, PORT: '10000' }).port, 10000);
});
test('konfigurasi produksi yang tidak aman ditolak sebelum server dimulai', () => {
  assert.throws(() => appOrigin({ NODE_ENV: 'production' }), /wajib/);
  for (const APP_URL of ['https://user:pass@example.com', 'https://example.com/path', 'javascript:alert(1)', 'https://example.com?x=1']) assert.throws(() => appOrigin({ APP_URL }));
  assert.throws(() => validateProduction({ ...settings, APP_SECRET: 'pendek' }), /APP_SECRET/);
  assert.throws(() => validateProduction({ ...settings, DATABASE_URL: 'file:./temp.db' }), /absolut/);
  assert.throws(() => validateProduction({ ...settings, COOKIE_SECURE: 'false' }), /COOKIE_SECURE/);
  assert.throws(() => validateProduction({ ...settings, PORT: 'abc' }), /PORT/);
});
test('bootstrap wajib memakai kredensial produksi pada database kosong', async () => {
  await assert.rejects(bootstrap({}));
  await assert.rejects(bootstrap({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'pendek' }));
  assert.equal(await db.user.count(), 0);
});
test('bootstrap membuat admin, layanan dan loket tanpa menulis password plaintext', async () => {
  const result = await bootstrap({ ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'sandi-produksi-uji-2026' });
  assert.deepEqual(result, { initialized: true, adminCreated: true });
  assert.equal(await db.service.count(), 3);
  assert.equal(await db.counter.count(), 3);
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@example.com' } });
  assert.ok(await verifyPassword('sandi-produksi-uji-2026', admin.passwordHash));
});
test('restart mempertahankan perubahan admin, jam, nama loket, dan password', async () => {
  await db.settings.update({ where: { id: 1 }, data: { institution: 'Instansi Produksi', openingTime: '09:00' } });
  const counter = await db.counter.findFirstOrThrow();
  await db.counter.update({ where: { id: counter.id }, data: { name: 'Loket Utama' } });
  const result = await bootstrap({ ADMIN_EMAIL: 'lain@example.com', ADMIN_PASSWORD: 'password-baru-bukan-reset' });
  assert.deepEqual(result, { initialized: false, adminCreated: false });
  assert.equal(await db.user.count(), 1);
  assert.equal(await db.counter.count(), 3);
  assert.equal((await db.settings.findUniqueOrThrow({ where: { id: 1 } })).openingTime, '09:00');
  assert.ok(await db.counter.findUnique({ where: { name: 'Loket Utama' } }));
  assert.ok(await verifyPassword('sandi-produksi-uji-2026', (await db.user.findFirstOrThrow()).passwordHash));
  assert.deepEqual(await bootstrap({}), { initialized: false, adminCreated: false });
});
test('health check memeriksa database tanpa membocorkan pengaturan atau kredensial', async () => {
  const response = await (await import('../app/api/health/route')).GET();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
