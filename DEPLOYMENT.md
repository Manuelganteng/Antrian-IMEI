# Membuat aplikasi dapat diakses orang lain

Paket ini mendukung **Render dengan disk permanen**, atau server yang dapat menjalankan Docker. Aplikasi tetap memakai Next.js dan SQLite. Domain sendiri belum diperlukan: Render menyediakan URL HTTPS `https://<nama-layanan>.onrender.com` setelah deployment berhasil. Nama aktual mengikuti layanan yang dibuat Render.

**Status saat ini:** konfigurasi deployment tersedia; belum ada layanan cloud yang dibuat, biaya yang disetujui, atau URL publik yang diterbitkan.

Arsip source siap unggah tersedia di `release/antrian-imei-deploy.zip`. Ekstrak isinya ke repositori baru, termasuk file yang namanya diawali titik. Arsip tidak menyertakan password, `.env` lokal, database pengunjung, dependensi, atau dokumen pribadi.

## Pilihan utama: Render

SQLite harus disimpan pada disk permanen. Render menyediakan disk tersebut untuk layanan berbayar; paket Free tanpa disk tidak cocok untuk database aplikasi ini. `render.yaml` meminta paket **Starter**, satu instance, wilayah Singapura, dan disk **1 GB**. Periksa harga yang ditampilkan Render sebelum menyetujui pembuatan layanan.

1. Buat akun GitHub dan Render jika belum ada.
2. Buat repositori GitHub **private**, lalu unggah source aplikasi. Jangan unggah `.env`, `.env.production`, `AKSES-LOKAL.txt`, database `*.db`, `node_modules`, `.next`, `test-results`, maupun dokumen pribadi. `.gitignore` melindungi berkas aplikasi yang sensitif, tetapi tinjau daftar berkas sebelum commit.
3. Di Render, pilih **New → Blueprint**, hubungkan repositori tersebut, lalu gunakan `render.yaml` di root proyek.
4. Isi `ADMIN_EMAIL` dengan email login pilihan Anda dan `ADMIN_PASSWORD` dengan kata sandi baru minimal **16 karakter**. Simpan sendiri kata sandinya; jangan kirim ke chat. `APP_SECRET` dibuat acak oleh Render. Akun admin lokal tidak disalin ke hosting.
5. Tinjau layanan Starter dan disk yang akan dibuat beserta biayanya, lalu terapkan Blueprint bila sesuai.
6. Tunggu build dan health check selesai hingga layanan berstatus **Live**. Buka URL HTTPS yang ditampilkan Render.
7. Buka `/login`, masuk sebagai admin, lalu atur instansi, jam pelayanan, akun petugas, dan loket. Bagikan halaman `/` ke pengunjung; buka `/display` di monitor ruang tunggu.

Migrasi database dan pembuatan admin awal berjalan otomatis sebelum server menerima permintaan. Deployment ulang tidak mereset nomor, akun, password, pengaturan, atau riwayat. Password environment hanya digunakan jika belum ada admin aktif. Mengubah `ADMIN_PASSWORD` di Render tidak mengganti password akun yang sudah ada; gunakan dashboard admin aplikasi.

URL Render dibaca otomatis dari `RENDER_EXTERNAL_URL`. Jangan mengatur `APP_URL=http://localhost:3000` di Render. Jika kelak memakai domain sendiri, hubungkan domain melalui Render dan atur `APP_URL` ke origin HTTPS tersebut, misalnya `https://antrian.instansi.example`, tanpa path. Semua pengguna kemudian harus membuka origin yang sama.

Konfigurasi yang sudah disediakan:

| Kebutuhan | Nilai |
| --- | --- |
| Runtime | Docker, Node.js 24 |
| Database | `file:/data/antrian.db` |
| Disk permanen | `/data` |
| Health check | `/api/health` |
| Origin | `APP_URL`, atau URL bawaan Render |
| Cookie sesi | HTTPS, HttpOnly, SameSite Strict |
| Port | Mengikuti `PORT` dari hosting |
| Inisialisasi | Migrasi dan admin otomatis, tidak menimpa data lama |

`TRUST_PROXY=false` dipertahankan agar aplikasi tidak mempercayai header IP dari pengunjung. Batas jaringan dibagi semua pengunjung sampai reverse proxy terpercaya dikonfigurasi dan ditinjau. Layanan dengan disk berjalan pada satu instance dan bisa mengalami jeda singkat saat redeploy. Jangan menghapus layanan/disk tanpa backup.

## Alternatif: Docker pada server sendiri

Pasang Docker Engine dan Docker Compose pada server, lalu salin source proyek. Buat `.env.production` dari `.env.production.example`; isi domain HTTPS, rahasia acak minimal 32 karakter, email dan password admin minimal 16 karakter.

```sh
docker compose up -d --build
docker compose logs -f app
```

Compose hanya menerbitkan port 3000 pada loopback server. Pasang reverse proxy HTTPS, misalnya Nginx/Caddy, yang mengarah ke `127.0.0.1:3000`, dan hubungkan DNS domain ke server. Untuk pengujian Docker lokal, gunakan `APP_URL=http://localhost:3000` dan `COOKIE_SECURE=false`. Database tersimpan di named volume `antrian-data`. Jangan menjalankan `docker compose down -v` karena opsi tersebut menghapus volume database.

Container menyiapkan kepemilikan folder `/data` lalu menjalankan aplikasi sebagai pengguna non-root. Rahasia, database lokal, dan dokumen pribadi dikecualikan dari konteks build Docker. Dockerfile menghasilkan entrypoint langsung saat build sehingga tidak bergantung pada unggahan shell script terpisah.

## Jika build gagal dengan `/deploy/entrypoint.sh: not found`

ZIP versi awal terlewat menyertakan folder `deploy`. Ganti `Dockerfile` di root repositori GitHub dengan versi terbaru, commit perubahan, lalu deploy ulang di Render. Dockerfile terbaru menghasilkan entrypoint sendiri. Tidak perlu mengubah environment, menghapus layanan, atau mereset disk.

Untuk membuat ulang paket lengkap, jalankan `pnpm package:deploy` atau `node scripts/package-deploy.mjs`. Skrip menggunakan daftar source eksplisit, menyertakan folder `deploy`, serta memeriksa berkas wajib dan pengecualian kredensial/database setelah pembuatan ZIP.

## Pemeriksaan setelah online

- `/api/health` mengembalikan `{"status":"ok"}`.
- Pengunjung dapat mengambil tiket ketika jam pengambilan terbuka.
- Petugas dapat memanggil dan menyelesaikan tiket yang sama di perangkat lain.
- Display memperbarui nomor; aktifkan suara secara manual pada browser monitor.
- Akses API admin tanpa login ditolak.
- Setelah restart layanan, pengaturan, akun, dan riwayat tetap tersedia.

Backup dan pemulihan database tetap perlu dijadwalkan oleh pengelola hosting. Untuk memindahkan data lokal, gunakan backup SQLite konsisten dan proses pemeliharaan terencana; deployment awal di panduan ini membuat database produksi baru.

## Batas verifikasi paket ini

Sebanyak 22 pengujian aplikasi/deployment lulus, TypeScript dan build produksi berhasil. Startup produksi juga diuji melalui HTTP pada port percobaan: database kosong dibuat, migrasi diterapkan, admin diinisialisasi, health check sehat, dan login berhasil. Docker tidak tersedia pada komputer pengerjaan, sehingga image Linux dan deployment Render belum dieksekusi. Build cloud serta pemeriksaan publik harus diselesaikan setelah akun/repository tersambung.

Referensi resmi: [Render Blueprint](https://render.com/docs/blueprint-spec), [Persistent Disks](https://render.com/docs/disks), [Docker on Render](https://render.com/docs/docker).
