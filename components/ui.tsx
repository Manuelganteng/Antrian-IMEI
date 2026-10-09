'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Smartphone, Ticket, Monitor, LayoutDashboard, ShieldCheck, LogOut, LoaderCircle, AlertCircle, Clock3 } from 'lucide-react';
import { statusLabels } from '@/lib/domain';
import type { PublicData } from '@/lib/types';

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, { method: data === undefined ? 'GET' : 'POST', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, ...(data === undefined ? {} : { body: JSON.stringify(data) }), cache: 'no-store' });
  const result = await response.json();
  if (!response.ok) throw new ApiError(result.error || 'Permintaan gagal.', response.status);
  return result;
}
export function usePoll<T>(path: string, interval = 5000) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try { const result = await api<T>(path); if (id === requestId.current) { setData(result); setError(''); } }
    catch (e) { if (id === requestId.current) { setError((e as Error).message); if (e instanceof ApiError && e.status === 401 && (path.startsWith('staff') || path.startsWith('admin') || path === 'me')) window.location.assign('/login'); } }
    finally { if (id === requestId.current) setLoading(false); }
  }, [path]);
  useEffect(() => { let stopped = false; let timer: ReturnType<typeof setTimeout>; setLoading(true); const run = async () => { await refresh(); if (!stopped) timer = setTimeout(run, interval); }; void run(); return () => { stopped = true; clearTimeout(timer); requestId.current++; }; }, [refresh, interval]);
  return { data, error, loading, refresh };
}
export function Clock({ date = false }: { date?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const timer = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(timer); }, []);
  return <span className="clock"><Clock3 size={16}/>{now ? new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', ...(date ? { weekday: 'long', day: 'numeric', month: 'long' } as const : {}), hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(now) : '—'} WIB</span>;
}
export function Shell({ children, title, subtitle, privatePage = false }: { children: React.ReactNode; title: string; subtitle?: string; privatePage?: boolean }) {
  const path = usePathname();
  const { data } = usePoll<PublicData>('public', 30000);
  return <><header className="topbar"><Link href="/" className="brand">{data?.settings.logoUrl ? <img src={data.settings.logoUrl} alt="Logo instansi" className="brand-logo"/> : <span className="brand-mark"><Smartphone size={25}/></span>}<span>{data?.settings.institution || 'Pusat Layanan IMEI'}<small>SISTEM ANTRIAN LAYANAN</small></span></Link><div className="top-right"><Clock/>{privatePage && <button className="ghost light" onClick={async () => { await api('logout', {}); window.location.assign('/login'); }}><LogOut size={17}/>Keluar</button>}</div></header>
  <div className="workspace"><aside className="sidebar"><div className="nav-caption">MENU UTAMA</div><nav>{[{ href: '/', text: 'Ambil antrian', icon: Ticket }, { href: '/status', text: 'Cek status', icon: Clock3 }, { href: '/display', text: 'Layar antrian', icon: Monitor }, { href: '/petugas', text: 'Dashboard petugas', icon: LayoutDashboard }, { href: '/admin', text: 'Administrasi', icon: ShieldCheck }].map(item => <Link key={item.href} href={item.href} className={path === item.href || (item.href === '/status' && path.startsWith('/tiket')) ? 'nav-item selected' : 'nav-item'}><item.icon size={20}/>{item.text}</Link>)}</nav><div className="sidebar-note"><ShieldCheck size={23}/><strong>Layanan lebih tertib</strong><p>Ambil nomor, simpan tiket, dan tunggu panggilan loket.</p></div><div className="sidebar-bottom">Registrasi IMEI<span>Pengelolaan antrian pelayanan</span></div></aside><main className="main"><div className="page-title"><div><span className="eyebrow">LAYANAN REGISTRASI IMEI</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div><span className="timezone">Waktu Indonesia Barat</span></div>{children}<footer>Pelayanan yang tertib dimulai dari antrian yang teratur.<span>© {new Date().getFullYear()} {data?.settings.institution || 'Pusat Layanan IMEI'}</span></footer></main></div></>;
}
export function Notice({ children, success = false }: { children: React.ReactNode; success?: boolean }) { return children ? <div role={success ? 'status' : 'alert'} className={`notice ${success ? 'success' : ''}`}><AlertCircle size={20}/><span>{children}</span></div> : null; }
export function Loading() { return <div className="empty" role="status"><LoaderCircle className="spin"/>Memuat data…</div>; }
export function Empty({ children = 'Belum ada antrian.' }: { children?: React.ReactNode }) { return <div className="empty"><Ticket size={30}/><span>{children}</span></div>; }
export function Badge({ status }: { status: string }) { return <span className={`badge status-${status.toLowerCase()}`}>{statusLabels[status] || status}</span>; }
export function Submit({ busy, children, className = 'primary' }: { busy: boolean; children: React.ReactNode; className?: string }) { return <button className={className} disabled={busy} type="submit">{busy && <LoaderCircle size={18} className="spin"/>}{busy ? 'Memproses…' : children}</button>; }
