# Antrian Registrasi IMEI

Aplikasi berbahasa Indonesia untuk pengambilan nomor, pelayanan loket, display ruang tunggu, dan administrasi. Menggunakan Next.js App Router, TypeScript, Tailwind CSS, Prisma 6, dan SQLite. Aplikasi mengelola antrian; tidak terhubung ke sistem resmi registrasi IMEI.

Untuk akses melalui internet, ikuti **[panduan deployment](DEPLOYMENT.md)**. Paket menyediakan Dockerfile, Blueprint Render dengan disk permanen, bootstrap admin produksi, dan health check. Domain sendiri tidak wajib untuk Render; deployment cloud belum dilakukan.

## Menjalankan

Prasyarat: Node.js 20.9 atau lebih baru (disarankan Node.js 24) dan pnpm. Pengujian memakai `node:sqlite` sehingga memerlukan Node.js 22.13 atau lebih baru.

```sh
pnpm install
pnpm setup:local
pnpm exec prisma generate
pnpm db:migrate
pnpm db:seed
pnpm admin:create
pnpm dev
```

Buka http://localhost:3000. Gunakan alamat ini persis karena pemeriksaan asal permintaan mengikuti `APP_URL`. `pnpm setup:local` membuat `.env` dengan rahasia acak dan tidak menimpa konfigurasi yang sudah ada. Seed menambahkan tiga layanan serta tiga loket tanpa menghapus data.

Pada komputer Windows ini dependensi, database, dan build sudah disiapkan. Klik dua kali `Jalankan.cmd` untuk menjalankan ulang aplikasi, lalu buka alamat tersebut. Tutup server yang sedang berjalan terlebih dahulu agar port 3000 tidak dipakai dua proses. Launcher juga dapat menggunakan Node.js bawaan Codex jika Node.js tidak ada di PATH.

`pnpm admin:create` membuat akun `admin@lokal.id` dengan kata sandi acak yang disimpan dalam `AKSES-LOKAL.txt`. File ini diabaikan Git. Pindahkan kata sandi ke pengelola kata sandi lalu hapus file tersebut. Skrip menolak menimpa akun yang sudah ada. Untuk membuat admin lain, atur `ADMIN_EMAIL`, `ADMIN_NAME`, dan opsional `ADMIN_PASSWORD` (minimal 12 karakter) sebagai environment variables sebelum menjalankan skrip. Jangan menaruh kata sandi produksi di source code.

Contoh PowerShell untuk identitas admin:

```powershell
$env:ADMIN_EMAIL = 'admin@instansi.example'
$env:ADMIN_NAME = 'Administrator Instansi'
pnpm admin:create
```

## Halaman dan alur

| Alamat | Penggunaan |
| --- | --- |
| `/` | Pilih layanan, isi nama, ambil nomor |
| `/tiket/<token>` | Tiket pribadi, status otomatis, salin tautan dan cetak |
| `/status` | Buka tiket dengan tautan atau kode akses |
| `/login` | Login petugas/admin |
| `/petugas` | Pilih loket dan layanan, panggil, layani, selesai/lewati |
| `/display` | Nomor/loket publik, suara dan layar penuh |
| `/admin` | Ringkasan, riwayat, CSV, akun, layanan, loket, identitas dan jam |

Jam awal 08.00–16.00 WIB setiap hari, kuota 300 antrian/hari. Admin dapat mengubahnya. Pengambilan nomor ditutup tepat saat jam tutup; pelayanan nomor yang sudah ada tetap dapat dilanjutkan. Antrian menunggu tidak dipindahkan otomatis ke hari berikutnya. Antrian yang sedang ditangani tetap muncul untuk petugas yang bersangkutan agar bisa diselesaikan meskipun tanggal berganti.

Nomor per layanan dan per tanggal Jakarta dimulai dari 001. Jumlah antrian di depan dihitung dari nomor yang masih menunggu dalam layanan yang sama; bukan perkiraan waktu tunggu. Antrian dilewati dapat dipanggil kembali oleh petugas pada hari yang sama. Riwayat tetap tersimpan. Penonaktifan digunakan untuk akun/layanan/loket sehingga relasi historis tidak hilang; tidak ada fitur menghapus riwayat atau reset nomor secara manual.

Pada display, klik **Aktifkan suara** setelah halaman dibuka. Setiap event panggilan baru dikonsumsi sekali per tab selama halaman terbuka. Panggilan ulang membuat event baru. Reload halaman memulai dari panggilan terbaru tanpa membacakan ulang backlog. Suara Indonesia bergantung pada dukungan browser dan suara yang terpasang di perangkat. Gunakan satu tab display bersuara per ruangan.

Logo dapat diatur sebagai URL HTTPS atau path lokal seperti `/logo.png` (simpan berkas di folder `public`).

## Konfigurasi dan penggunaan pada server

Salin `.env.example` atau jalankan setup. Variabel:

- `DATABASE_URL`: default `file:./dev.db`, relatif terhadap `prisma/schema.prisma`.
- `APP_URL`: origin aplikasi yang dibuka pengguna, misalnya `https://antrian.instansi.example`.
- `APP_SECRET`: minimal 32 karakter acak, untuk hashing identitas pembatasan permintaan.
- `COOKIE_SECURE`: `true` jika aplikasi dilayani melalui HTTPS; `false` untuk localhost HTTP.
- `TRUST_PROXY`: tetap `false` untuk server langsung. Set `true` hanya bila reverse proxy terpercaya mengganti `X-Forwarded-For` dan server tidak dapat diakses melewati proxy tersebut.

```sh
pnpm build
pnpm start
```

Server default terikat ke `127.0.0.1`. Untuk akses jaringan lokal, jalankan `pnpm exec next start --hostname 0.0.0.0` dan sesuaikan `APP_URL` dengan alamat yang digunakan seluruh klien. Untuk produksi, gunakan reverse proxy HTTPS, `COOKIE_SECURE=true`, dan volume disk persisten untuk SQLite. Jangan gunakan hosting serverless dengan disk sementara. Jalankan `pnpm db:migrate` ketika memperbarui aplikasi.

Script dev/build memakai Webpack karena Turbopack mengalami kegagalan worker CSS pada lingkungan Windows ini. Seluruh fungsi aplikasi tetap menggunakan Next.js.

SQLite mendukung satu penulis dalam satu waktu. Cocok untuk satu instalasi layanan dengan beban moderat. Seluruh penomoran, kuota, dan pemanggilan memakai transaksi, retry contention, serta constraint unik nomor/tanggal, loket aktif dan petugas aktif. Untuk skala banyak instance diperlukan peninjauan ulang database dan deployment.

Sesi login berlaku 8 jam, token acak hanya disimpan dalam bentuk hash di database, cookie HttpOnly/SameSite Strict. Password memakai scrypt dengan salt acak. API memeriksa peran, status akun, kepemilikan antrian, validasi input dan origin. Halaman publik tidak mengirim nama/telepon pengunjung; tiket pribadi dapat dibaca siapa pun yang memiliki tautannya, sehingga simpan tautan secara pribadi.

Pembatasan penerbitan: 60 permintaan/menit per jaringan dan 3/menit per cookie perangkat; login 30/15 menit per jaringan serta 8/15 menit per akun. Tanpa proxy terpercaya, bucket jaringan dibagi seluruh pengunjung. Cookie perangkat bukan perlindungan bot mutlak. Tambahkan pembatasan di reverse proxy jika dibuka luas ke internet.

Backup SQLite ketika aplikasi dihentikan atau gunakan SQLite backup API; jangan sekadar menyalin file saat ada transaksi aktif. Tetapkan kebijakan retensi data pengunjung sesuai kebutuhan instansi. Tidak ada integrasi SMS, WhatsApp, atau registrasi IMEI resmi.

## Pemeriksaan

```sh
pnpm typecheck
pnpm test
pnpm build
```

Pengujian membuat database terpisah di `test-results/`, menjalankan SQL migrasi asli, dan tidak mengubah database aplikasi. Cakupan: pengambilan bersamaan, kuota, pergantian tanggal Jakarta, kompetisi dua petugas/loket, transisi status, pencatatan aktivitas, role dan origin, password/login, privasi display, cursor event panggilan, token tiket, jam operasional, rate limit, serta sanitasi CSV.

Data contoh pengembangan berupa tiga layanan dan tiga loket. Antrian contoh dapat dibuat dari formulir saat jam pengambilan dibuka; seed tidak menyisipkan pengunjung fiktif ke antrian operasional.
