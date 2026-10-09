import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { db, transaction } from '@/lib/db';
import { AppError, csvCell, jakartaDay, statusLabels } from '@/lib/domain';
import { checkOrigin, currentUser, digest, newSession, rateLimit, safeUser, sessionCookie } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { actionInput, counterInput, historyInput, loginInput, serviceInput, settingsInput, ticketInput, userInput } from '@/lib/validation';
import { createTicket, publicData, queueAction, ticketByToken } from '@/lib/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
type Context = { params: Promise<{ path: string[] }> };
async function body(request: NextRequest) {
  if (Number(request.headers.get('content-length')) > 20000) throw new AppError('Permintaan terlalu besar.', 413);
  const text = await request.text();
  if (Buffer.byteLength(text) > 20000) throw new AppError('Permintaan terlalu besar.', 413);
  try { return JSON.parse(text); } catch { throw new AppError('Data permintaan tidak valid.'); }
}
async function handle(request: NextRequest, context: Context) {
  try {
    const path = (await context.params).path.join('/');
    if (request.method === 'POST') checkOrigin(request);
    if (request.method === 'GET') {
      if (path === 'public') {
        const value = request.nextUrl.searchParams.get('cursor');
        if (value !== null && (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)))) throw new AppError('Cursor tidak valid.');
        return json(await publicData(value === null ? undefined : Number(value)));
      }
      if (path.startsWith('tickets/')) return json(await ticketByToken(path.split('/')[1]));
      const user = await currentUser(request, path.startsWith('admin/'));
      if (path === 'me') return json(safeUser(user));
      if (path === 'staff') {
        const [counters, services, queues, ownActive] = await Promise.all([
          db.counter.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
          db.service.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
          db.queue.findMany({ where: { day: jakartaDay(), status: { not: 'DONE' } }, select: { id: true, code: true, name: true, serviceId: true, serviceName: true, status: true, counterId: true, assignedUserId: true, createdAt: true }, orderBy: { createdAt: 'asc' } }),
          db.queue.findFirst({ where: { activeUserKey: user.id }, select: { id: true, code: true, name: true, serviceId: true, serviceName: true, status: true, counterId: true, assignedUserId: true, createdAt: true } })
        ]);
        return json({ user: safeUser(user), counters, services, queues, ownActive });
      }
      if (path === 'admin/data') {
        const [users, counters, services, settings, counts] = await Promise.all([
          db.user.findMany({ select: { id: true, name: true, email: true, role: true, active: true }, orderBy: { name: 'asc' } }),
          db.counter.findMany({ orderBy: { name: 'asc' } }), db.service.findMany({ orderBy: { name: 'asc' } }),
          db.settings.findUniqueOrThrow({ where: { id: 1 } }),
          db.queue.groupBy({ by: ['status'], where: { day: jakartaDay() }, _count: true })
        ]);
        return json({ users, counters, services, settings, counts: Object.fromEntries(counts.map(c => [c.status, c._count])) });
      }
      if (path === 'admin/history' || path === 'admin/export') {
        const filters = historyInput.parse(Object.fromEntries(request.nextUrl.searchParams));
        const where: Prisma.QueueWhereInput = { day: filters.day || jakartaDay(), ...(filters.serviceId ? { serviceId: filters.serviceId } : {}), ...(filters.status ? { status: filters.status } : {}) };
        if (path === 'admin/export') {
          const rows = await db.queue.findMany({ where, include: { counter: true }, orderBy: { createdAt: 'asc' }, take: 10000 });
          const csv = [['Tanggal', 'Nomor', 'Nama', 'Nomor HP', 'Layanan', 'Status', 'Loket', 'Waktu dibuat (UTC)'].map(csvCell).join(','), ...rows.map(q => [q.day, q.code, q.name, q.phone, q.serviceName, statusLabels[q.status], q.counter?.name, q.createdAt.toISOString()].map(csvCell).join(','))].join('\r\n');
          return new NextResponse('\uFEFF' + csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="antrian-${filters.day || jakartaDay()}.csv"`, 'Cache-Control': 'no-store' } });
        }
        const [rows, total] = await Promise.all([
          db.queue.findMany({ where, select: { id: true, code: true, name: true, phone: true, serviceName: true, status: true, createdAt: true, counter: { select: { name: true } }, events: { select: { id: true, action: true, status: true, counterName: true, createdAt: true, user: { select: { name: true } } }, orderBy: { id: 'asc' } } }, orderBy: { createdAt: 'desc' }, skip: (filters.page - 1) * 30, take: 30 }),
          db.queue.count({ where })
        ]);
        return json({ rows, total, page: filters.page });
      }
    } else {
      if (path === 'tickets') {
        await rateLimit(request, 'ticket-network', 60, 60000);
        let device = request.cookies.get('imei_device')?.value;
        if (!device || !/^[a-f0-9]{48}$/.test(device)) device = (await import('node:crypto')).randomBytes(24).toString('hex');
        await rateLimit(request, 'ticket-device', 3, 60000, device);
        const result = await createTicket(ticketInput.parse(await body(request)));
        const response = json(result, 201);
        response.cookies.set('imei_device', device, { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/', maxAge: 86400 });
        return response;
      }
      if (path === 'login') {
        await rateLimit(request, 'login-network', 30, 15 * 60000);
        const input = loginInput.parse(await body(request));
        await rateLimit(request, 'login-account', 8, 15 * 60000, input.email);
        const user = await db.user.findUnique({ where: { email: input.email } });
        const dummyHash = '00000000000000000000000000000000:' + '0'.repeat(128);
        const valid = await verifyPassword(input.password, user?.passwordHash || dummyHash);
        if (!user || !user.active || !valid) throw new AppError('Email atau kata sandi tidak sesuai.', 401);
        const session = await newSession(user.id);
        const response = json(safeUser(user));
        response.cookies.set(sessionCookie, session.token, { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/', expires: session.expiresAt });
        return response;
      }
      if (path === 'logout') {
        const token = request.cookies.get(sessionCookie)?.value;
        if (token) await db.session.deleteMany({ where: { id: digest(token) } });
        const response = json({ ok: true }); response.cookies.delete(sessionCookie); return response;
      }
      const user = await currentUser(request, path.startsWith('admin/'));
      if (path === 'staff/action') return json(await queueAction(actionInput.parse(await body(request)), user.id));
      if (path === 'admin/settings') {
        const input = settingsInput.parse(await body(request));
        await db.settings.update({ where: { id: 1 }, data: input }); return json({ ok: true });
      }
      if (path === 'admin/users') {
        const { id, password, ...input } = userInput.parse(await body(request));
        if (!id && !password) throw new AppError('Kata sandi wajib diisi untuk akun baru.');
        if (id === user.id && (!input.active || input.role !== 'ADMIN')) throw new AppError('Anda tidak dapat menonaktifkan atau menurunkan peran akun sendiri.');
        const passwordHash = password ? await hashPassword(password) : undefined;
        await transaction(async tx => {
          await tx.settings.update({ where: { id: 1 }, data: { lockVersion: { increment: 1 } } });
          if (id) {
            if (!input.active && await tx.queue.findFirst({ where: { activeUserKey: id } })) throw new AppError('Petugas masih menangani antrian aktif.', 409);
            await tx.user.update({ where: { id }, data: { ...input, ...(passwordHash ? { passwordHash } : {}) } });
            await tx.session.deleteMany({ where: { userId: id } });
          } else await tx.user.create({ data: { ...input, passwordHash: passwordHash! } });
        });
        return json({ ok: true });
      }
      if (path === 'admin/services') {
        const { id, ...input } = serviceInput.parse(await body(request));
        await transaction(async tx => {
          await tx.settings.update({ where: { id: 1 }, data: { lockVersion: { increment: 1 } } });
          if (id) {
            const old = await tx.service.findUniqueOrThrow({ where: { id } });
            if (input.prefix !== old.prefix && await tx.queue.count({ where: { serviceId: id } })) throw new AppError('Awalan layanan yang sudah dipakai tidak dapat diubah. Buat layanan baru.');
            if (!input.active && await tx.queue.count({ where: { serviceId: id, OR: [{ day: jakartaDay(), status: { in: ['WAITING', 'SKIPPED'] } }, { activeCounterKey: { not: null } }] } })) throw new AppError('Selesaikan antrian layanan ini sebelum menonaktifkannya.');
            await tx.service.update({ where: { id }, data: input });
          } else await tx.service.create({ data: input });
        });
        return json({ ok: true });
      }
      if (path === 'admin/counters') {
        const { id, ...input } = counterInput.parse(await body(request));
        await transaction(async tx => {
          await tx.settings.update({ where: { id: 1 }, data: { lockVersion: { increment: 1 } } });
          if (id) {
            if (!input.active && await tx.queue.count({ where: { activeCounterKey: id } })) throw new AppError('Loket masih menangani antrian aktif.');
            await tx.counter.update({ where: { id }, data: input });
          } else await tx.counter.create({ data: input });
        });
        return json({ ok: true });
      }
    }
    throw new AppError('Halaman tidak ditemukan.', 404);
  } catch (error) {
    if (error instanceof ZodError) return json({ error: error.issues[0]?.message || 'Data tidak valid.' }, 400);
    if (error instanceof AppError) return json({ error: error.message }, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return json({ error: 'Data sudah digunakan. Periksa email, awalan layanan, atau nama loket.' }, 409);
    console.error('API error', error);
    return json({ error: 'Terjadi gangguan pada server. Silakan coba kembali.' }, 500);
  }
}
export const GET = handle;
export const POST = handle;
