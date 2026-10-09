export const statusLabels: Record<string, string> = {
  WAITING: 'Menunggu', CALLED: 'Dipanggil', SERVING: 'Dilayani', DONE: 'Selesai', SKIPPED: 'Dilewati'
};
export function jakartaDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function jakartaTime(date = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}
export function formattedDate(value: string | Date, time = true) {
  return new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } as const : {}) }).format(new Date(value));
}
export class AppError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function csvCell(value: unknown) {
  const text = String(value ?? '');
  // Neutralize spreadsheet formulas, including leading control characters.
  return '"' + (/^[\s]*[=+@-]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
}
