'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { Notice, Shell } from '@/components/ui';
export default function StatusPage() {
  const [error, setError] = useState(''); const router = useRouter();
  return <Shell title="Periksa status antrian" subtitle="Gunakan tautan atau kode akses yang tercantum pada tiket Anda."><section className="card narrow"><h2>Temukan tiket Anda</h2><form onSubmit={event => { event.preventDefault(); const value = String(new FormData(event.currentTarget).get('token')).trim(); const token = value.split('/tiket/').pop()?.split(/[?#]/)[0]; if (!token || !/^[a-f0-9]{48}$/.test(token)) return setError('Masukkan tautan tiket atau kode akses 48 karakter yang valid.'); router.push('/tiket/' + token); }}><label className="field">Tautan tiket atau kode akses<input name="token" required placeholder="Tempel tautan tiket Anda" autoComplete="off"/></label><Notice>{error}</Notice><button className="primary full"><Search size={19}/>Periksa status</button></form><p className="muted">Kode akses bersifat pribadi. Nomor antrian saja tidak dapat digunakan untuk membuka data tiket.</p></section></Shell>;
}
