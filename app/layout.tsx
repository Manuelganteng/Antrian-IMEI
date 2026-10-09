import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Antrian Registrasi IMEI', description: 'Ambil nomor dan pantau antrian layanan registrasi IMEI.', robots: { index: false, follow: false }, icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="id"><body>{children}</body></html>; }
