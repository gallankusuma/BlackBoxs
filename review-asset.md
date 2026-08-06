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

## AST-007 s/d AST-020

**Status: Terbuka** — dikerjakan berurutan sesuai Sprint Asset 1.

Verifikasi awal yang sudah dilakukan:

- **AST-007** terkonfirmasi. [AssetDetail.vue:242](frontend/src/views/AssetDetail.vue) membangun URL download tanpa token sama sekali. Perlu dicatat: ini **bukan** akibat pergantian ke `downloadAuthMiddleware`; sebelumnya route ini memakai `authMiddleware` yang juga menuntut token, jadi link tersebut memang sudah selalu 401.
- **AST-009** terkonfirmasi, `nextAssetCode()` memakai `MAX(...) + 1` tanpa lock.

---

## Verifikasi ronde ini

```bash
cd backend && npm run test:all
```

153 kasus dalam 5 suite, semua lulus:

| Suite | Kasus |
|---|---|
| `npm test` | 19 |
| `npm run test:http` | 34 |
| `npm run test:pin` | 28 |
| `npm run test:rbac` | 45 |
| `npm run test:asset` | 27 |

`tsc --noEmit` dan `vue-tsc --noEmit` bersih.
