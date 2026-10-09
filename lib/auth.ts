import { createHash, createHmac, randomBytes } from 'node:crypto';
import { NextRequest } from 'next/server';
import { db, transaction } from './db';
import { AppError } from './domain';
import { appOrigin } from './config';
export const sessionCookie = 'imei_session';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export function checkOrigin(request: NextRequest) {
  const expected = appOrigin();
  if (request.headers.get('origin') !== expected) throw new AppError('Asal permintaan tidak diizinkan. Muat ulang halaman.', 403);
}
export async function currentUser(request: NextRequest, admin = false) {
  const token = request.cookies.get(sessionCookie)?.value;
  if (!token) throw new AppError('Silakan masuk terlebih dahulu.', 401);
  const session = await db.session.findUnique({ where: { id: digest(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) throw new AppError('Sesi telah berakhir. Silakan masuk kembali.', 401);
  if (admin && session.user.role !== 'ADMIN') throw new AppError('Halaman ini hanya untuk admin.', 403);
  return session.user;
}
export async function newSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
  await db.session.create({ data: { id: digest(token), userId, expiresAt } });
  return { token, expiresAt };
}
export const safeUser = (user: { id: string; name: string; email: string; role: string; active: boolean }) => ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active });
export async function rateLimit(request: NextRequest, scope: string, limit: number, windowMs: number, identity = '') {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 32) throw new AppError('APP_SECRET belum dikonfigurasi.', 503);
  // Without a trusted proxy use one shared bucket; never trust arbitrary client IP headers.
  const ip = process.env.TRUST_PROXY === 'true' ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'shared' : 'shared';
  const key = createHmac('sha256', secret).update(`${scope}:${identity || ip}:${Math.floor(Date.now() / windowMs)}`).digest('hex');
  const bucket = await transaction(tx => tx.rateBucket.upsert({ where: { id: key }, create: { id: key, count: 1, expiresAt: new Date(Date.now() + windowMs) }, update: { count: { increment: 1 } } }));
  if (bucket.count > limit) throw new AppError('Terlalu banyak permintaan. Silakan coba lagi beberapa saat.', 429);
  if (Math.random() < 0.02) await db.rateBucket.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
