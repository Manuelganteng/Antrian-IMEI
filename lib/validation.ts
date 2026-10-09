import { z } from 'zod';
z.config(z.locales.id());
const name = z.string().trim().min(2, 'Nama minimal 2 karakter.').max(100, 'Nama maksimal 100 karakter.');
export const ticketInput = z.object({
  name,
  serviceId: z.string().min(1, 'Pilih jenis layanan.'),
  phone: z.string().trim().max(20).regex(/^(?:\+?[0-9][0-9 ()-]{6,19})?$/, 'Nomor HP tidak valid.').optional()
});
export const loginInput = z.object({ email: z.email('Email tidak valid.').transform(v => v.toLowerCase()), password: z.string().min(1, 'Masukkan kata sandi.').max(200) });
export const userInput = z.object({ id: z.string().optional(), name, email: z.email('Email tidak valid.').transform(v => v.toLowerCase()), password: z.string().min(12, 'Kata sandi minimal 12 karakter.').max(128).optional(), role: z.enum(['ADMIN', 'STAFF']), active: z.boolean() });
export const serviceInput = z.object({ id: z.string().optional(), name, prefix: z.string().trim().toUpperCase().regex(/^[A-Z]{1,3}$/, 'Awalan harus 1–3 huruf.'), active: z.boolean() });
export const counterInput = z.object({ id: z.string().optional(), name, active: z.boolean() });
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Jam tidak valid.');
export const settingsInput = z.object({ institution: name, logoUrl: z.string().max(1000).refine(v => !v || /^https:\/\//.test(v) || /^\/(?!\/)[^\\]*$/.test(v), 'Gunakan URL HTTPS atau path logo lokal.'), openingTime: time, closingTime: time, dailyLimit: z.number().int().min(1).max(10000), enabled: z.boolean() }).refine(v => v.openingTime < v.closingTime, { message: 'Jam tutup harus sesudah jam buka.' });
export const actionInput = z.object({ action: z.enum(['NEXT', 'RECALL', 'START', 'DONE', 'SKIP', 'RESTORE']), counterId: z.string().min(1), serviceId: z.string().min(1), queueId: z.string().optional() });
export const historyInput = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), serviceId: z.string().optional(), status: z.enum(['WAITING', 'CALLED', 'SERVING', 'DONE', 'SKIPPED']).optional(), page: z.coerce.number().int().min(1).default(1) });
