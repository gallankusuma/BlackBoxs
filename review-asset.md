# Review Asset Management — Tanggapan Tim Development

Sumber: `Review.txt` dari tim reviewer, terhadap commit `10f33813`.
Urutan pengerjaan mengikuti **Sprint Asset 1** yang disusun reviewer: AST-001 → 002 → 007 → 008 → 009 → 014 → 020.

Status per butir: **Diterapkan**, **Sebagian**, **Disanggah**, atau **Terbuka**.

---

## AST-001 — Backend RBAC belum diterapkan

**Status: Diterapkan** — [asset.routes.ts](backend/src/routes/asset.routes.ts), [config/database.ts](backend/src/config/database.ts)

Diverifikasi: sebelum perbaikan, **0 dari 30 endpoint** asset memakai pemeriksaan permission.

Katalog permission diperluas persis mengikuti daftar reviewer (11 permission), memakai model `resource.action` yang sudah dipakai sistem:

| Resource | Actions |
|---|---|
| `assets` | view, create, edit, delete, dispose, manage |
| `assets.documents` | manage |
| `assets.master` | manage |
| `assets.maintenance` | view, manage |
| `assets.financial` | view, manage |

Pemetaan ke 30 endpoint: GET operasional → `assets.view`; CRUD line/P&ID → `assets.master.manage`; dokumen → `assets.documents.manage`; maintenance dan riwayat pembelian → sub-resource masing-masing. Ini memenuhi acceptance criteria bahwa Maintenance Officer tidak otomatis boleh mengubah nilai finansial.

Dua hal tambahan:

- **`assets.dispose` diperiksa di dalam handler**, bukan lewat middleware, karena disposal saat ini hanya berupa perubahan `status` pada `PUT /assets/:id`. Pemeriksaan hanya jalan saat status benar-benar berpindah *ke* `disposed`.
- **`assets.manage` dipertahankan sebagai superset** dan diterima di semua endpoint. Alasannya kompatibilitas: role di produksi sudah dipetakan ke `assets.manage` sejak modul ini rilis, dan mencabutnya akan mengunci pengguna yang sekarang berjalan normal.

Diverifikasi: 17 kasus di `npm run test:rbac` — token desktop tanpa permission asset menerima 403 di seluruh operasi (lihat, buat, ubah, hapus, master data, maintenance, finansial), master tetap 200.

---

## AST-002 — Menyimpan detail aset menghapus P&ID dan spec

**Status: Diterapkan** — [asset.routes.ts](backend/src/routes/asset.routes.ts)

Terkonfirmasi, dan **cakupannya lebih luas dari yang tertulis di review**. Handler lama melakukan replace penuh dengan pola `field || default`, jadi field yang tidak dikirim klien tidak hanya jadi NULL tetapi jatuh ke nilai default:

| Field tidak dikirim | Akibat sebelum perbaikan |
|---|---|
| `pnid_id` | jadi `NULL` — aset lepas dari P&ID |
| `spec` | jadi `{}` — spesifikasi hilang |
| `purchase_price` | jadi `0` — **harga perolehan hilang** |
| `useful_life_years` | jadi `1` — umur ekonomis berubah |
| `salvage_value` | jadi `0` |
| `status` | jadi `'active'` — aset disposed bisa hidup lagi |
| `depreciation_method` | jadi `straight_line` |

`editForm` di [AssetDetail.vue:247](frontend/src/views/AssetDetail.vue) hanya membawa 15 field dan memang tidak menyertakan `pnid_id` maupun `spec`. Jadi mengubah nama aset saja sudah cukup untuk melepasnya dari P&ID, menghapus spesifikasinya, **dan** — kalau field finansial tidak ikut terkirim — menghapus harga perolehannya.

Perbaikan mengikuti opsi 1 + 3 dari reviewer: handler kini melakukan **partial update**, hanya menyentuh field yang benar-benar ada di body (`hasOwnProperty`, sehingga `null` eksplisit tetap dihormati sebagai "kosongkan"). `PATCH /assets/:id` didaftarkan sebagai bentuk yang benar secara semantik, `PUT` tetap ada ke handler yang sama supaya frontend lama tidak putus.

Diverifikasi: `npm run test:asset` — 27 kasus, termasuk mengirim **payload persis seperti AssetDetail.vue** lalu memastikan `pnid_id` dan `spec` tetap utuh, serta PATCH satu field tidak mereset harga/umur/status.

### Regresi yang ikut ditemukan dan diperbaiki

Saat menulis tesnya, ketahuan **master admin tidak bisa membuat aset sama sekali** — gagal FK `assets.created_by → users(id)`. Penyebabnya perbaikan kami sendiri di commit `10f33813`: seed baris user `master` dihapus untuk menghilangkan kredensial publik, padahal jalur login master hardcoded menerbitkan token ber-`userId 99999` yang kini tidak punya baris pasangan di tabel `users`. Di produksi tidak terlihat karena barisnya memang sudah ada.

Ditutup dengan `ensureMasterUserRow()`: memastikan baris master ada sebagai sasaran foreign key (password acak, tidak dipakai — jalur login master tidak memeriksanya), dan jalur login master kini menerbitkan token dengan **id baris yang nyata**, bukan konstanta 99999.

---

## AST-007 — Link download dokumen selalu 401

**Status: Diterapkan** — [AssetDetail.vue](frontend/src/views/AssetDetail.vue), [ProjectFiles.vue](frontend/src/components/projects/ProjectFiles.vue), [middleware/auth.ts](backend/src/middleware/auth.ts)

Terkonfirmasi. Satu koreksi terhadap uraian review: ini **bukan** akibat pergantian ke `downloadAuthMiddleware`. Sebelum pergantian itu route-nya memakai `authMiddleware`, yang juga menuntut token — jadi link tersebut memang sudah selalu 401 sejak awal. Pergantiannya netral, tidak merusak dan tidak memperbaiki.

Diperbaiki mengikuti pendekatan yang direkomendasikan reviewer, bukan signed URL: unduhan lewat `api.get(url, { responseType: 'blob' })` sehingga token dikirim di header, lalu object URL sementara dibuat di browser. Nama berkas diambil dari `Content-Disposition` bila ada.

Sekalian dibereskan: `ProjectFiles.vue` ternyata **sudah** memakai pola blob yang benar, tapi masih menyimpan `getPreviewUrl`/`getDownloadUrl` ber-`?token=` sebagai **kode mati** — tidak pernah dipanggil. Keduanya dihapus.

Karena setelah itu tidak ada satu pun pemanggil yang butuh token di URL, **`downloadAuthMiddleware` dihapus sepenuhnya** dan 8 route preview/download kembali memakai `authMiddleware` biasa. Ini memenuhi acceptance criteria "JWT utama tidak tampil pada URL dan browser history" secara menyeluruh, bukan hanya di modul asset.

Diverifikasi di `npm run test:http`: `?token=` ditolak 401 di API biasa, di route unduhan project, dan di unduhan dokumen aset; unduhan dengan header Authorization tetap lolos auth.

---

## AST-008 — Upload dokumen belum aman

**Status: Diterapkan** — [utils/file-validation.ts](backend/src/utils/file-validation.ts), [asset.routes.ts](backend/src/routes/asset.routes.ts)

Terkonfirmasi: tidak ada batas ukuran, tidak ada filter MIME/ekstensi, dan nama berkas di server memakai ekstensi dari `originalname`.

Perbaikan mengikuti seluruh daftar reviewer:

- **Whitelist PDF, JPG/JPEG, PNG, DOCX, XLSX.**
- **Pemeriksaan magic bytes**, bukan sekadar ekstensi dan MIME — keduanya sepenuhnya di bawah kendali pengunggah. Nama, MIME, dan isi berkas ketiganya harus konsisten.
- **Batas 20 MB**, dibalas `413` lewat handler multer sendiri (tanpa itu error-nya jatuh ke error handler global dan jadi `500`).
- **Nama berkas di server = UUID acak**, nama asli hanya jadi metadata. Ini sekaligus menutup path traversal dan ekstensi ganda seperti `laporan.pdf.html`.
- **Berkas ditahan di memori dulu**, jadi berkas berbahaya tidak pernah menyentuh disk. Kalau insert database gagal, berkas yang terlanjur ditulis dihapus — tidak ada orphan.
- Aset diverifikasi ada sebelum berkas ditulis, supaya tidak ada dokumen yatim untuk `asset_id` ngawur.

Diverifikasi 13 kasus, termasuk yang paling penting: **`menyamar.pdf` dengan MIME `application/pdf` tapi isinya `<html><script>` ditolak 400**. HTML, SVG beriskrip, executable, dan skrip shell semuanya ditolak.

---

## AST-009 — Generator asset code rentan race condition

**Status: Diterapkan** — [asset.routes.ts](backend/src/routes/asset.routes.ts)

Terkonfirmasi. Dipilih opsi **retry saat unique constraint gagal** dari daftar reviewer, karena kolom `assets.asset_code` sudah punya UNIQUE INDEX — jadi database sendiri yang menjadi penjaga sebenarnya, bukan pembacaan `MAX(...)` yang memang tidak bisa dibuat atomic tanpa lock.

Kegagalan `ER_DUP_ENTRY` pada `asset_code` ditangkap, nomor dihitung ulang, maksimal 8 percobaan dengan jeda acak singkat supaya request yang bertabrakan tidak mencoba ulang bersamaan. Error selain duplikat tetap dilempar apa adanya.

Diverifikasi persis dengan acceptance criteria reviewer: **20 request create bersamaan → 20 berhasil, 20 kode unik, nol respons 500.**

---

## AST-014 & AST-020 dan seterusnya

**Status: Terbuka** — berikutnya dalam Sprint Asset 1.

`npm run test:asset` sudah tumbuh jadi 43 kasus dan menutup sebagian daftar AST-020 (create berhasil, concurrent create, edit tidak menghapus P&ID/spec, upload berbahaya ditolak, unduhan butuh autentikasi, viewer tidak bisa membuat/menghapus). Yang belum: pengujian depresiasi (butuh AST-003/010 lebih dulu), hard delete aset aktif (AST-005), dan master yang sedang dipakai (AST-013).

---

## Verifikasi ronde ini

```bash
cd backend && npm run test:all
```

171 kasus dalam 5 suite, semua lulus:

| Suite | Kasus |
|---|---|
| `npm test` | 19 |
| `npm run test:http` | 36 |
| `npm run test:pin` | 28 |
| `npm run test:rbac` | 45 |
| `npm run test:asset` | 43 |

`tsc --noEmit` dan `vue-tsc --noEmit` bersih.
