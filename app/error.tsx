'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="standalone"><h1>Halaman belum dapat dimuat</h1><p>Terjadi gangguan sementara. Silakan coba kembali.</p><button className="primary" onClick={reset}>Coba lagi</button></main>; }
