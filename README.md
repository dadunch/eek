# WA Bot Tracker — Minum & Eek 💧🚽

Bot WhatsApp sederhana berbasis [Baileys](https://github.com/WhiskeySockets/Baileys) (tanpa Puppeteer/Chrome, jadi ringan) untuk mencatat berapa kali tiap member grup minum air dan buang air.

## Cara Kerja

Bot login pakai nomor WhatsApp kamu sendiri (via scan QR, sama seperti fitur "Perangkat Tertaut"), lalu diundang ke grup seperti anggota biasa. Setelah itu bot akan otomatis membaca perintah yang diketik member grup.

## Instalasi

1. Pastikan Node.js versi 18 ke atas sudah terpasang.
2. Ekstrak project ini, lalu masuk ke foldernya dan install dependency:
   ```bash
   npm install
   ```
3. Jalankan bot:
   ```bash
   npm start
   ```
4. Akan muncul QR code di terminal. Scan pakai WhatsApp di HP:
   **Setelan > Perangkat Tertaut > Tautkan Perangkat**
5. Setelah tersambung (muncul "✅ Bot tersambung ke WhatsApp!"), **undang nomor WhatsApp yang dipakai bot ini ke dalam grup** seperti mengundang anggota biasa.
6. Sesi login tersimpan di folder `auth_info/`, jadi kalau bot di-restart tidak perlu scan ulang (kecuali logout).

## Perintah di Grup

| Perintah          | Fungsi                                            |
|--------------------|----------------------------------------------------|
| `!minum`           | Catat 1x minum air untuk pengirim                  |
| `!eek`             | Catat 1x buang air untuk pengirim                  |
| `!rekap`           | Lihat rekap hari ini semua member di grup itu      |
| `!rekap total`     | Lihat rekap total sepanjang waktu di grup itu      |
| `!help`            | Tampilkan daftar perintah                          |

Setiap grup punya catatan terpisah — data disimpan per grup, per member.

## Penyimpanan Data

Data disimpan sederhana dalam file `data/db.json` (otomatis dibuat saat pertama kali ada yang mencatat). Cocok untuk penggunaan personal/grup kecil. Tidak perlu database eksternal.

Struktur data kira-kira:
```json
{
  "groups": {
    "<id_grup>@g.us": {
      "users": {
        "<id_user>@s.whatsapp.net": {
          "name": "Nama Member",
          "total": { "minum": 12, "eek": 3 },
          "daily": {
            "2026-09-05": { "minum": 4, "eek": 1 }
          }
        }
      }
    }
  }
}
```

## Menjalankan 24 Jam (Opsional)

Agar bot tetap online terus, jalankan pakai [pm2](https://pm2.keymetrics.io/):
```bash
npm install -g pm2
pm2 start index.js --name wa-bot-tracker
pm2 save
```

## Catatan Penting

- Bot ini memakai library **tidak resmi (unofficial)** yang berjalan lewat WhatsApp Web protocol. Gunakan dengan bijak — hindari spam/otomatisasi berlebihan yang bisa memicu nomor terkena banned oleh WhatsApp. Untuk pemakaian personal/grup kecil biasanya aman.
- Sebaiknya pakai nomor WhatsApp khusus untuk bot (bukan nomor utama kamu), untuk jaga-jaga.
- Kalau butuh reset data, cukup hapus/isi ulang file `data/db.json`.

## Menambah Perintah Baru

Semua logic perintah ada di `index.js` pada bagian `messages.upsert`. Tinggal tambahkan blok `else if (lower === '!perintahbaru')` baru, dan kalau perlu simpan data tambahan, tinggal tambah fungsi baru di `lib/db.js`.
