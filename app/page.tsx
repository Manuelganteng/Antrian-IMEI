'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Ticket, Users, Clock3, CheckCircle2, Smartphone, MessageCircle, FilePenLine } from 'lucide-react';
import { api, Empty, Loading, Notice, Shell, Submit, usePoll } from '@/components/ui';
import type { PublicData } from '@/lib/types';
import { jakartaTime } from '@/lib/domain';
import { ticketInput } from '@/lib/validation';

export default function VisitorPage() {
  const { data, error, loading } = usePoll<PublicData>('public');
  const [serviceId, setServiceId] = useState(''), [busy, setBusy] = useState(false), [formError, setFormError] = useState('');
  const router = useRouter();
  const open = data && data.settings.enabled && jakartaTime(new Date(data.serverTime)) >= data.settings.openingTime && jakartaTime(new Date(data.serverTime)) < data.settings.closingTime && data.total < data.settings.dailyLimit;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError('');
    const form = new FormData(event.currentTarget);
    const input = ticketInput.safeParse({ name: form.get('name'), phone: form.get('phone'), serviceId });
    if (!input.success) { setFormError(input.error.issues[0].message); setBusy(false); return; }
    try { const ticket = await api<{ token: string }>('tickets', input.data); router.push('/tiket/' + ticket.token); }
    catch (e) { setFormError((e as Error).message); setBusy(false); }
  }
  return <Shell title="Ambil nomor antrian" subtitle="Pilih layanan Anda, lalu isi data untuk mendapatkan tiket antrian."><Notice>{error}</Notice>
    <div className="stats-grid"><div className="stat"><span className="stat-icon"><Users/></span><div><small>Sedang menunggu</small><strong>{data?.waitingCount ?? '—'} <em>pengunjung</em></strong></div></div><div className="stat"><span className="stat-icon gold"><Clock3/></span><div><small>Jam pelayanan</small><strong className="time-value">{data ? `${data.settings.openingTime} – ${data.settings.closingTime}` : '—'} <em>WIB</em></strong></div></div><div className="stat"><span className="stat-icon green"><CheckCircle2/></span><div><small>Pengambilan antrian</small><strong className="time-value">{data ? open ? 'Sedang dibuka' : 'Sedang ditutup' : 'Memuat…'}</strong></div></div></div>
    <div className="visitor-grid"><section className="card form-card"><div className="card-heading"><span className="step-number">01</span><div><h2>Pilih layanan</h2><p>Sesuaikan dengan kebutuhan kunjungan Anda.</p></div></div>{loading && !data ? <Loading/> : <form onSubmit={submit}>
      <fieldset className="services"><legend className="sr-only">Jenis layanan</legend>{data?.services.map((service, index) => { const Icon = [Smartphone, MessageCircle, FilePenLine][index % 3]; return <label className={`service-option ${serviceId === service.id ? 'chosen' : ''}`} key={service.id}><input type="radio" name="service" required value={service.id} checked={serviceId === service.id} onChange={() => setServiceId(service.id)}/><Icon size={24}/><span><strong>{service.name}</strong><small>{data.waitingByService[service.id] || 0} antrian menunggu</small></span><span className="radio-dot"/></label>; })}</fieldset>
      <div className="card-heading divided"><span className="step-number">02</span><div><h2>Data pengunjung</h2><p>Nama digunakan petugas untuk mengenali antrian Anda.</p></div></div>
      <label className="field">Nama lengkap <input name="name" placeholder="Masukkan nama lengkap Anda" required minLength={2} maxLength={100} autoComplete="name"/></label><label className="field">Nomor HP <span className="optional">Opsional</span><input name="phone" type="tel" placeholder="Contoh: 0812 3456 7890" maxLength={20} autoComplete="tel"/></label>
      <Notice>{formError}</Notice>{data && !open && <Notice>{data.total >= data.settings.dailyLimit ? 'Kuota antrian hari ini telah habis.' : `Pengambilan nomor dibuka pukul ${data.settings.openingTime}–${data.settings.closingTime} WIB.`}</Notice>}
      <button className="primary full" type="submit" disabled={busy || !open}>{busy ? 'Menyiapkan tiket…' : <><Ticket size={20}/>Ambil nomor antrian</>}</button><p className="form-hint">Simpan tiket Anda sampai pelayanan selesai.</p>
    </form>}</section>
    <aside className="visitor-aside"><section className="live-card"><div className="live-heading"><span className="live-dot"/>PANGGILAN SAAT INI</div>{data?.active[0] ? <><div className="big-number">{data.active[0].code}</div><div className="counter-pill">{data.active[0].counter?.name}</div><p>{data.active[0].serviceName}</p></> : <><div className="big-number">—</div><p>Belum ada nomor yang dipanggil</p></>}<a href="/display" className="display-link">Lihat layar antrian</a></section><section className="card guide"><h2>Alur pelayanan</h2>{[['Ambil nomor', 'Pilih layanan dan lengkapi nama Anda.'], ['Tunggu panggilan', 'Pantau nomor Anda pada layar antrian.'], ['Menuju loket', 'Datang ke loket yang memanggil nomor Anda.']].map(([title, text], i) => <div className="guide-step" key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{text}</p></div></div>)}</section></aside></div>
  </Shell>;
}
