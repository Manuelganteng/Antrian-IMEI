import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { NextRequest } from 'next/server';
import type { PrismaClient } from '@prisma/client';
import { jakartaDay, csvCell } from '../lib/domain';
import { hashPassword, verifyPassword } from '../lib/password';

let db: PrismaClient;
let queue: typeof import('../lib/queue');
let routes: typeof import('../app/api/[...path]/route');
let auth: typeof import('../lib/auth');
let serviceId: string, counter1: string, counter2: string, user1: string, user2: string, adminId: string;
let staffToken: string, adminToken: string;
const now = new Date('2026-10-08T03:00:00Z');
const secret = randomBytes(32).toString('hex');
before(async () => {
  mkdirSync('test-results', { recursive: true });
  const file = resolve('test-results', `integration-${Date.now()}.db`);
  process.env.DATABASE_URL = 'file:' + file.replaceAll('\\', '/');
  process.env.APP_URL = 'http://localhost:3000'; process.env.APP_SECRET = secret; process.env.TRUST_PROXY = 'false';
  const sqlite = new DatabaseSync(file);
  for (const folder of readdirSync('prisma/migrations').filter(f => /^\d/.test(f)).sort()) sqlite.exec(readFileSync(`prisma/migrations/${folder}/migration.sql`, 'utf8'));
  sqlite.close();
  db = (await import('../lib/db')).db;
  queue = await import('../lib/queue'); routes = await import('../app/api/[...path]/route'); auth = await import('../lib/auth');
  const passwordHash = await hashPassword('test-password-12345');
  const service = await db.service.create({ data: { name: 'Registrasi IMEI', prefix: 'R' } }); serviceId = service.id;
  counter1 = (await db.counter.create({ data: { name: 'Loket 1' } })).id;
  counter2 = (await db.counter.create({ data: { name: 'Loket 2' } })).id;
  user1 = (await db.user.create({ data: { name: 'Petugas satu', email: 'satu@test.id', passwordHash } })).id;
  user2 = (await db.user.create({ data: { name: 'Petugas dua', email: 'dua@test.id', passwordHash } })).id;
  adminId = (await db.user.create({ data: { name: 'Admin', email: 'admin@test.id', passwordHash, role: 'ADMIN' } })).id;
  staffToken = (await auth.newSession(user1)).token; adminToken = (await auth.newSession(adminId)).token;
});
beforeEach(async () => {
  await db.queueEvent.deleteMany(); await db.queue.deleteMany(); await db.dailySequence.deleteMany(); await db.rateBucket.deleteMany();
  await db.settings.upsert({ where: { id: 1 }, update: { openingTime: '00:00', closingTime: '23:59', dailyLimit: 100, enabled: true }, create: { id: 1, openingTime: '00:00', closingTime: '23:59', dailyLimit: 100 } });
});
after(async () => { await db?.$disconnect(); });
async function request(path: string, data?: unknown, token?: string, origin = 'http://localhost:3000') {
  const req = new NextRequest(`http://localhost:3000/api/${path}`, { method: data === undefined ? 'GET' : 'POST', headers: { origin, 'content-type': 'application/json', ...(token ? { cookie: `imei_session=${token}` } : {}) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  return (data === undefined ? routes.GET : routes.POST)(req, { params: Promise.resolve({ path: path.split('?')[0].split('/') }) });
}
test('tanggal Jakarta berganti pada 17:00 UTC', () => {
  assert.equal(jakartaDay(new Date('2026-10-08T16:59:59Z')), '2026-10-08');
  assert.equal(jakartaDay(new Date('2026-10-08T17:00:00Z')), '2026-10-09');
});
test('12 permintaan bersamaan mendapat nomor unik dan urut', async () => {
  const tickets = await Promise.all(Array.from({ length: 12 }, (_, i) => queue.createTicket({ name: `Pengunjung ${i}`, serviceId }, now)));
  assert.equal(new Set(tickets.map(t => t.token)).size, 12);
  const numbers = await db.queue.findMany({ orderBy: { number: 'asc' } });
  assert.deepEqual(numbers.map(q => q.code), Array.from({ length: 12 }, (_, i) => `R${String(i + 1).padStart(3, '0')}`));
  assert.equal(await db.queueEvent.count(), 12);
});
test('kuota tidak terlampaui saat pengambilan bersamaan', async () => {
  await db.settings.update({ where: { id: 1 }, data: { dailyLimit: 3 } });
  const result = await Promise.allSettled(Array.from({ length: 8 }, () => queue.createTicket({ name: 'Pengunjung kuota', serviceId }, now)));
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 3);
  assert.equal(await db.queue.count(), 3);
});
test('nomor dimulai kembali pada hari baru tanpa menghapus riwayat', async () => {
  await queue.createTicket({ name: 'Hari pertama', serviceId }, now);
  await queue.createTicket({ name: 'Hari kedua', serviceId }, new Date('2026-10-08T17:00:00Z'));
  const rows = await db.queue.findMany({ orderBy: { createdAt: 'asc' } });
  assert.deepEqual(rows.map(q => [q.day, q.code]), [['2026-10-08', 'R001'], ['2026-10-09', 'R001']]);
});
test('dua petugas tidak dapat memanggil antrian yang sama', async () => {
  await queue.createTicket({ name: 'Satu pengunjung', serviceId }, now);
  const results = await Promise.allSettled([
    queue.queueAction({ action: 'NEXT', counterId: counter1, serviceId }, user1, now),
    queue.queueAction({ action: 'NEXT', counterId: counter2, serviceId }, user2, now)
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await db.queueEvent.count({ where: { action: 'CALL' } }), 1);
});
test('loket hanya dapat menangani satu antrian aktif', async () => {
  await Promise.all([queue.createTicket({ name: 'Pertama', serviceId }, now), queue.createTicket({ name: 'Kedua', serviceId }, now)]);
  const results = await Promise.allSettled([
    queue.queueAction({ action: 'NEXT', counterId: counter1, serviceId }, user1, now),
    queue.queueAction({ action: 'NEXT', counterId: counter1, serviceId }, user2, now)
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(await db.queue.count({ where: { status: 'WAITING' } }), 1);
});
test('alur panggil ulang, lewati, panggil kembali, layani, selesai tercatat', async () => {
  await queue.createTicket({ name: 'Alur pelayanan', serviceId }, now);
  await queue.queueAction({ action: 'NEXT', counterId: counter1, serviceId }, user1, now);
  const row = await db.queue.findFirstOrThrow();
  for (const action of ['RECALL', 'SKIP', 'RESTORE', 'START', 'DONE'] as const) await queue.queueAction({ action, counterId: counter1, serviceId, queueId: row.id }, user1, now);
  const done = await db.queue.findUniqueOrThrow({ where: { id: row.id } });
  assert.equal(done.status, 'DONE'); assert.equal(done.activeCounterKey, null); assert.equal(done.activeUserKey, null);
  const events = await db.queueEvent.findMany({ where: { userId: user1 } });
  assert.equal(events.length, 6); assert.ok(events.every(e => e.counterId === counter1));
});
test('petugas lain tidak dapat mengubah antrian aktif dan urutan status divalidasi', async () => {
  await queue.createTicket({ name: 'Uji akses antrian', serviceId }, now);
  await queue.queueAction({ action: 'NEXT', counterId: counter1, serviceId }, user1, now);
  const row = await db.queue.findFirstOrThrow();
  await assert.rejects(queue.queueAction({ action: 'START', counterId: counter1, serviceId, queueId: row.id }, user2, now));
  await assert.rejects(queue.queueAction({ action: 'DONE', counterId: counter1, serviceId, queueId: row.id }, user1, now));
});
test('akses admin ditolak untuk anonim dan petugas; admin dapat mengakses', async () => {
  assert.equal((await request('admin/data')).status, 401);
  assert.equal((await request('admin/data', undefined, staffToken)).status, 403);
  assert.equal((await request('admin/data', undefined, adminToken)).status, 200);
  assert.equal((await request('staff')).status, 401);
});
test('permintaan lintas asal ditolak dan input divalidasi', async () => {
  assert.equal((await request('tickets', { name: 'Pengunjung', serviceId }, undefined, 'https://evil.example')).status, 403);
  assert.equal((await request('tickets', { name: '', serviceId })).status, 400);
  assert.equal((await request('admin/settings', { institution: 'Test' }, adminToken)).status, 400);
});
test('password di-hash, password salah gagal, login benar membuat cookie HttpOnly', async () => {
  const hash = await hashPassword('password-aman-123');
  assert.notEqual(hash, 'password-aman-123'); assert.ok(await verifyPassword('password-aman-123', hash)); assert.equal(await verifyPassword('salah', hash), false);
  assert.equal((await request('login', { email: 'satu@test.id', password: 'salah' })).status, 401);
  const response = await request('login', { email: 'satu@test.id', password: 'test-password-12345' });
  assert.equal(response.status, 200); assert.match(response.headers.get('set-cookie') || '', /HttpOnly/i);
});
test('display tidak membocorkan data pengunjung dan event panggilan tidak berulang', async () => {
  await queue.createTicket({ name: 'Nama Sangat Rahasia', phone: '081299998888', serviceId });
  const before = await queue.publicData();
  await queue.queueAction({ action: 'NEXT', counterId: counter1, serviceId }, user1);
  const called = await queue.publicData(before.cursor);
  assert.equal(called.events.length, 1);
  assert.equal((await queue.publicData(called.cursor)).events.length, 0);
  const payload = JSON.stringify(called);
  assert.ok(!payload.includes('Nama Sangat Rahasia')); assert.ok(!payload.includes('081299998888')); assert.ok(!payload.includes('token'));
});
test('tiket dengan token acak tersedia; token tidak valid ditolak', async () => {
  const ticket = await queue.createTicket({ name: 'Pemegang tiket', serviceId }, now);
  assert.equal((await queue.ticketByToken(ticket.token)).code, 'R001');
  assert.equal((await request('tickets/' + '0'.repeat(48))).status, 404);
  assert.equal((await request('tickets/R001')).status, 404);
});
test('jam tutup mencegah penerbitan tiket', async () => {
  await db.settings.update({ where: { id: 1 }, data: { openingTime: '08:00', closingTime: '16:00' } });
  await assert.rejects(queue.createTicket({ name: 'Di luar jam', serviceId }, new Date('2026-10-08T10:00:00Z')));
});
test('pembatasan permintaan tersimpan di database', async () => {
  const req = new NextRequest('http://localhost:3000/api/tickets');
  await auth.rateLimit(req, 'test', 2, 60000); await auth.rateLimit(req, 'test', 2, 60000);
  await assert.rejects(auth.rateLimit(req, 'test', 2, 60000), /Terlalu banyak/);
});
test('ekspor CSV mengamankan formula spreadsheet', () => {
  assert.equal(csvCell('=1+1'), '"\'=1+1"');
  assert.equal(csvCell('nama "A"'), '"nama ""A"""');
  assert.equal(csvCell('  +SUM(A1)'), '"\'  +SUM(A1)"');
});
