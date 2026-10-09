import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const origin = process.env.APP_URL || 'http://localhost:3000';
for (const path of ['/', '/login', '/status', '/petugas', '/admin', '/display']) {
  const response = await fetch(origin + path);
  assert.equal(response.status, 200, path);
  assert.match(await response.text(), /lang="id"/);
  console.log(`OK halaman ${path}`);
}
const info = await fetch(origin + '/api/public').then(r => r.json());
assert.equal(info.services.length, 3);
assert.ok(info.settings.institution);
assert.equal((await fetch(origin + '/api/admin/data')).status, 401);
const access = readFileSync('AKSES-LOKAL.txt', 'utf8');
const email = access.match(/Email: (.+)/)[1].trim();
const password = access.match(/Kata sandi: (.+)/)[1].trim();
const login = await fetch(origin + '/api/login', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
assert.equal(login.status, 200);
const cookie = login.headers.get('set-cookie').split(';')[0];
const admin = await fetch(origin + '/api/admin/data', { headers: { cookie } });
assert.equal(admin.status, 200);
assert.ok((await admin.json()).users.length);
const csv = await fetch(origin + '/api/admin/export', { headers: { cookie } });
assert.equal(csv.status, 200);
assert.match(csv.headers.get('content-type'), /text\/csv/);
await fetch(origin + '/api/logout', { method: 'POST', headers: { cookie, origin, 'content-type': 'application/json' }, body: '{}' });
assert.equal((await fetch(origin + '/api/admin/data', { headers: { cookie } })).status, 401);
console.log('OK API publik, akses terproteksi, login admin, ekspor CSV, dan logout');
