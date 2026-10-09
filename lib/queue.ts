import { randomBytes } from 'node:crypto';
import { db, transaction } from './db';
import { AppError, jakartaDay, jakartaTime } from './domain';
import { ticketInput, actionInput } from './validation';
import { z } from 'zod';

export async function createTicket(input: z.infer<typeof ticketInput>, now = new Date()) {
  const parsed = ticketInput.parse(input);
  return transaction(async tx => {
    // Acquire the SQLite write lock before reading quotas or sequence numbers.
    const settings = await tx.settings.update({ where: { id: 1 }, data: { lockVersion: { increment: 1 } } });
    const time = jakartaTime(now), day = jakartaDay(now);
    if (!settings.enabled || time < settings.openingTime || time >= settings.closingTime) throw new AppError(`Pengambilan antrian buka pukul ${settings.openingTime}–${settings.closingTime} WIB.`, 409);
    const service = await tx.service.findFirst({ where: { id: parsed.serviceId, active: true } });
    if (!service) throw new AppError('Layanan tidak tersedia.', 404);
    if (await tx.queue.count({ where: { day } }) >= settings.dailyLimit) throw new AppError('Kuota antrian hari ini telah habis.', 409);
    const sequence = await tx.dailySequence.upsert({ where: { day_serviceId: { day, serviceId: service.id } }, create: { day, serviceId: service.id, value: 1 }, update: { value: { increment: 1 } } });
    const queue = await tx.queue.create({ data: {
      token: randomBytes(24).toString('hex'), day, number: sequence.value,
      code: `${service.prefix}${String(sequence.value).padStart(3, '0')}`,
      name: parsed.name, phone: parsed.phone || null, serviceId: service.id, serviceName: service.name,
      createdAt: now, events: { create: { action: 'CREATED', status: 'WAITING', createdAt: now } }
    } });
    return { token: queue.token };
  });
}
export async function ticketByToken(token: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) throw new AppError('Tiket tidak ditemukan.', 404);
  const queue = await db.queue.findUnique({ where: { token }, include: { counter: true } });
  if (!queue) throw new AppError('Tiket tidak ditemukan.', 404);
  const ahead = queue.status === 'WAITING' ? await db.queue.count({ where: { day: queue.day, serviceId: queue.serviceId, status: 'WAITING', number: { lt: queue.number } } }) : 0;
  return { code: queue.code, name: queue.name, serviceName: queue.serviceName, day: queue.day, status: queue.status, createdAt: queue.createdAt, counter: queue.counter?.name, ahead, isToday: queue.day === jakartaDay() };
}
export async function queueAction(input: z.infer<typeof actionInput>, userId: string, now = new Date()) {
  const { action, counterId, serviceId, queueId } = actionInput.parse(input);
  return transaction(async tx => {
    await tx.settings.update({ where: { id: 1 }, data: { lockVersion: { increment: 1 } } });
    const counter = await tx.counter.findFirst({ where: { id: counterId, active: true } });
    const service = await tx.service.findFirst({ where: { id: serviceId, active: true } });
    if (!counter || !service) throw new AppError('Loket atau layanan tidak aktif.', 409);
    let queue;
    let status: string;
    if (action === 'NEXT' || action === 'RESTORE') {
      if (await tx.queue.findFirst({ where: { OR: [{ activeCounterKey: counterId }, { activeUserKey: userId }] } })) throw new AppError('Selesaikan atau lewati antrian aktif terlebih dahulu.', 409);
      queue = action === 'NEXT'
        ? await tx.queue.findFirst({ where: { day: jakartaDay(now), serviceId, status: 'WAITING' }, orderBy: { number: 'asc' } })
        : await tx.queue.findFirst({ where: { id: queueId || '', day: jakartaDay(now), serviceId, status: 'SKIPPED' } });
      if (!queue) throw new AppError(action === 'NEXT' ? 'Belum ada antrian menunggu.' : 'Antrian yang dilewati tidak ditemukan.', 409);
      status = 'CALLED';
    } else {
      queue = await tx.queue.findFirst({ where: { id: queueId || '', activeCounterKey: counterId, activeUserKey: userId, serviceId } });
      if (!queue) throw new AppError('Antrian ini tidak sedang ditangani oleh Anda di loket tersebut.', 409);
      const allowed: Record<string, string[]> = { RECALL: ['CALLED'], START: ['CALLED'], DONE: ['SERVING'], SKIP: ['CALLED', 'SERVING'] };
      if (!allowed[action]?.includes(queue.status)) throw new AppError('Status antrian telah berubah. Muat ulang daftar.', 409);
      status = ({ RECALL: 'CALLED', START: 'SERVING', DONE: 'DONE', SKIP: 'SKIPPED' } as Record<string, string>)[action];
    }
    const isActive = ['CALLED', 'SERVING'].includes(status);
    const updated = await tx.queue.updateMany({ where: { id: queue.id, status: queue.status }, data: {
      status, counterId, assignedUserId: userId,
      activeCounterKey: isActive ? counterId : null, activeUserKey: isActive ? userId : null
    } });
    if (updated.count !== 1) throw new AppError('Antrian baru saja diambil petugas lain.', 409);
    await tx.queueEvent.create({ data: { queueId: queue.id, action: ['NEXT', 'RESTORE', 'RECALL'].includes(action) ? 'CALL' : action, status, userId, counterId, counterName: counter.name, createdAt: now } });
    return { code: queue.code, status };
  });
}
export async function publicData(cursor?: number) {
  const day = jakartaDay();
  const [settings, services, active, waiting, latest, total] = await Promise.all([
    db.settings.findUniqueOrThrow({ where: { id: 1 } }),
    db.service.findMany({ where: { active: true }, orderBy: { prefix: 'asc' } }),
    db.queue.findMany({ where: { day, status: { in: ['CALLED', 'SERVING'] } }, select: { code: true, status: true, serviceName: true, counter: { select: { name: true } } }, orderBy: { updatedAt: 'desc' } }),
    db.queue.findMany({ where: { day, status: 'WAITING' }, select: { code: true, serviceId: true, serviceName: true }, orderBy: { createdAt: 'asc' } }),
    db.queueEvent.findFirst({ where: { action: 'CALL' }, orderBy: { id: 'desc' }, select: { id: true } }),
    db.queue.count({ where: { day } })
  ]);
  const events = cursor === undefined ? [] : await db.queueEvent.findMany({ where: { action: 'CALL', id: { gt: cursor, lte: latest?.id ?? 0 }, queue: { day } }, select: { id: true, counterName: true, queue: { select: { code: true } } }, orderBy: { id: 'asc' } });
  return { settings: { institution: settings.institution, logoUrl: settings.logoUrl, openingTime: settings.openingTime, closingTime: settings.closingTime, dailyLimit: settings.dailyLimit, enabled: settings.enabled }, services, active, waiting: waiting.slice(0, 12), waitingCount: waiting.length, waitingByService: Object.fromEntries(services.map(s => [s.id, waiting.filter(q => q.serviceId === s.id).length])), total, events, cursor: latest?.id ?? 0, day, serverTime: new Date().toISOString() };
}
