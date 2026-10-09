import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { db } from '../lib/db';
import { hashPassword } from '../lib/password';
async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@lokal.id').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || randomBytes(18).toString('base64url');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD minimal 12 karakter.');
  if (await db.user.findUnique({ where: { email } })) throw new Error('Email sudah ada. Ubah akun melalui dashboard admin.');
  await db.user.create({ data: { name: process.env.ADMIN_NAME || 'Administrator', email, passwordHash: await hashPassword(password), role: 'ADMIN' } });
  if (!process.env.ADMIN_PASSWORD) {
    writeFileSync('AKSES-LOKAL.txt', `Akses administrator lokal\nURL: ${process.env.APP_URL}/login\nEmail: ${email}\nKata sandi: ${password}\n\nSimpan di pengelola kata sandi, lalu hapus file ini. File ini diabaikan Git.\n`, { mode: 0o600 });
    console.log('Admin dibuat. Kredensial acak disimpan di AKSES-LOKAL.txt (diabaikan Git).');
  } else console.log('Akun admin berhasil dibuat dari environment variables.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
