/** Trusted deployment configuration, never inferred from client-supplied headers. */
export function appOrigin(env: Record<string, string | undefined> = process.env) {
  const value = env.APP_URL || env.RENDER_EXTERNAL_URL || (env.NODE_ENV === 'production' ? '' : 'http://localhost:3000');
  if (!value) throw new Error('APP_URL atau RENDER_EXTERNAL_URL wajib diisi untuk produksi.');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_URL harus berupa origin, misalnya https://antrian.example.com.');
  }
  return url.origin;
}

export function validateProduction(env: Record<string, string | undefined> = process.env) {
  const origin = appOrigin(env);
  if (!env.APP_SECRET || env.APP_SECRET.length < 32) throw new Error('APP_SECRET wajib berisi minimal 32 karakter acak.');
  if (!/^file:(?:\/|[A-Za-z]:[\\/])/.test(env.DATABASE_URL || '')) throw new Error('DATABASE_URL produksi wajib menggunakan path SQLite absolut pada disk permanen.');
  if (origin.startsWith('https:') && env.COOKIE_SECURE !== 'true') throw new Error('COOKIE_SECURE harus true untuk website HTTPS.');
  if (origin.startsWith('http:') && env.COOKIE_SECURE === 'true') throw new Error('Cookie aman memerlukan HTTPS. Gunakan COOKIE_SECURE=false hanya untuk pengujian HTTP lokal.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT tidak valid.');
  return { origin, port };
}
