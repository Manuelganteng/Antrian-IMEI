'use client';
import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api, Notice, Shell, Submit } from '@/components/ui';
import type { User } from '@/lib/types';
export default function LoginPage() {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Shell title="Masuk ke ruang petugas" subtitle="Gunakan akun yang telah disiapkan oleh administrator."><section className="card login-card"><span className="login-icon"><ShieldCheck size={32}/></span><h2>Selamat datang kembali</h2><p className="muted">Kelola antrian dan layani pengunjung dari satu tempat.</p><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { const user = await api<User>('login', { email: form.get('email'), password: form.get('password') }); window.location.assign(user.role === 'ADMIN' ? '/admin' : '/petugas'); } catch (e) { setError((e as Error).message); setBusy(false); } }}><label className="field">Email<input type="email" name="email" autoComplete="username" required placeholder="nama@instansi.go.id"/></label><label className="field">Kata sandi<input type="password" name="password" autoComplete="current-password" required maxLength={200} placeholder="Masukkan kata sandi"/></label><Notice>{error}</Notice><Submit busy={busy} className="primary full">Masuk</Submit></form><p className="form-hint">Hubungi admin jika Anda memerlukan akses akun.</p></section></Shell>;
}
