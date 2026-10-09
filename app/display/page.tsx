'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Maximize, Volume2, VolumeX, Smartphone, ArrowLeft } from 'lucide-react';
import { api, Clock, Notice } from '@/components/ui';
import type { PublicData } from '@/lib/types';
export default function DisplayPage() {
  const [data, setData] = useState<PublicData | null>(null), [error, setError] = useState(''), [sound, setSound] = useState(false);
  const enabled = useRef(false), cursor = useRef<number | undefined>(undefined);
  useEffect(() => {
    let stop = false; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result = await api<PublicData>('public' + (cursor.current === undefined ? '' : '?cursor=' + cursor.current));
        if (stop) return;
        if (enabled.current && 'speechSynthesis' in window) for (const event of result.events) {
          const speech = new SpeechSynthesisUtterance(`Nomor antrian ${event.queue.code.split('').join(' ')}, silakan menuju ${event.counterName || 'loket pelayanan'}.`);
          speech.lang = 'id-ID'; speech.rate = 0.85;
          const voice = speechSynthesis.getVoices().find(v => v.lang.startsWith('id')); if (voice) speech.voice = voice;
          speechSynthesis.speak(speech);
        }
        cursor.current = result.cursor; setData(result); setError('');
      } catch (e) { if (!stop) setError('Koneksi terputus. Menghubungkan kembali… ' + (e as Error).message); }
      if (!stop) timer = setTimeout(poll, 2000);
    }
    void poll(); return () => { stop = true; clearTimeout(timer); if ('speechSynthesis' in window) speechSynthesis.cancel(); };
  }, []);
  const current = data?.active[0];
  return <main className="display-page"><header className="display-header"><Link href="/" className="brand">{data?.settings.logoUrl ? <img src={data.settings.logoUrl} alt="Logo instansi" className="brand-logo"/> : <span className="brand-mark"><Smartphone/></span>}<span>{data?.settings.institution || 'Pusat Layanan IMEI'}<small>INFORMASI ANTRIAN PELAYANAN</small></span></Link><Clock date/></header><Notice>{error}</Notice><div className="display-grid"><section className="display-current"><span className="display-label">NOMOR ANTRIAN SAAT INI</span><div className="display-number">{current?.code || '—'}</div><div className="display-destination">{current?.counter?.name || 'Menunggu panggilan'}</div><p>{current?.serviceName || 'Silakan ambil nomor antrian untuk mendapatkan pelayanan.'}</p><div className="display-rule"/><span>Silakan menuju loket saat nomor Anda dipanggil.</span></section><section className="display-upcoming"><div className="section-title"><h2>Antrian berikutnya</h2><span>{data?.waitingCount ?? 0} menunggu</span></div>{data?.waiting.length ? data.waiting.slice(0, 6).map(q => <div className="display-next-row" key={q.code}><strong>{q.code}</strong><span>{q.serviceName}</span></div>) : <div className="display-empty">Belum ada antrian menunggu</div>}<p>Urutan pelayanan mengikuti masing-masing jenis layanan.</p></section></div><div className="display-counters">{data?.active.map(q => <div key={q.code}><span>{q.counter?.name}</span><strong>{q.code}</strong><small>{q.status === 'SERVING' ? 'Sedang dilayani' : 'Dipanggil'}</small></div>)}</div><footer className="display-footer"><Link href="/"><ArrowLeft size={17}/> Halaman utama</Link><div><button className="ghost light" onClick={() => { if (!('speechSynthesis' in window)) return setError('Browser ini belum mendukung suara panggilan.'); enabled.current = !enabled.current; setSound(enabled.current); if (!enabled.current) speechSynthesis.cancel(); else { const speech = new SpeechSynthesisUtterance('Suara panggilan diaktifkan.'); speech.lang = 'id-ID'; speechSynthesis.speak(speech); } }}>{sound ? <Volume2 size={20}/> : <VolumeX size={20}/>} {sound ? 'Nonaktifkan suara' : 'Aktifkan suara'}</button><button className="ghost light" onClick={async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setError('Mode layar penuh tidak tersedia pada browser ini.'); } }}><Maximize size={19}/>Layar penuh</button></div></footer></main>;
}
