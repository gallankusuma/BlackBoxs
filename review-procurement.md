# TANGGAPAN TIM DEVELOPMENT — MODUL PROCUREMENT

Berkas ini adalah sisi development dari review procurement, dipisah dari
`Review.txt` (inbox tim reviewer) karena tanggapan yang ditulis di sana
sudah tiga kali hilang saat berkas itu disinkronkan ulang.

Polanya mengikuti `review-asset.md`, yang selama ini aman.

Status: **R01–R22 seluruhnya tertutup** — 21 diperbaiki dengan kode,
1 (R13) keputusan bisnis.

---

## PROC-R16 — DOKUMEN APPROVED MASIH DAPAT DIEDIT

### ✅ DITERAPKAN — tim development

- **GRN**: `approval_status = 2` atau `is_reversed = 1` → 409
  (`GRN_LOCKED_APPROVED` / `GRN_REVERSED`), diarahkan ke reversal + GRN baru.
- **PO**: ada GRN aktif → `vendor_id` dan `items` terkunci
  (`PO_LOCKED_BY_GRN`); AP sudah dibayar → `advance_payment`,
  `discount_percent`, `ppn_percent`, `payment_term`, `payment_term_2`, `items`
  terkunci (`PO_LOCKED_BY_PAYMENT`).
- **PR**: sudah menerbitkan PO → `PR_LOCKED_BY_PO`; sudah disetujui penuh →
  `PR_LOCKED_APPROVED`. Field terkuncinya `notes` (item PR ada di dalamnya),
  `project_id`, `request_date`, `needed_by`.

Satu keputusan desain yang perlu kami jelaskan: **yang dikunci adalah PERUBAHAN
nilai, bukan kehadiran field di payload.**

Implementasi pertama kami menolak begitu `items` ada di request. Waktu diperiksa
ke frontend, `PurchaseOrders.vue` ternyata SELALU mengirim seluruh isi form
termasuk `items` pada setiap simpan. Artinya versi itu akan membuat PO yang
barangnya sudah datang mustahil disimpan sama sekali — termasuk sekadar mengubah
alamat pengiriman. Untuk modul yang sudah live itu bukan penguncian, itu
kerusakan.

Sekarang nilai yang dikirim dibandingkan dengan yang tersimpan (item
dinormalisasi ke bentuk kanonik lalu diurutkan). Mengirim ulang item yang sama
lolos; mengubah qty, harga, atau vendor ditolak. Perubahan administratif tetap
jalan. Keduanya ada tesnya.

---

## PROC-R17 — SOFT-DELETED PR BELUM BENAR-BENAR TERKUNCI

### ✅ DITERAPKAN — tim development

Benar di kedua sisi, dan kami sudah verifikasi langsung di source.

Helper `getActivePurchaseRequest(id, columns, tx?)` dibuat sesuai saran, dipakai
di seluruh endpoint operasional: approve PR, buat bid, pilih pemenang, ringkasan
bid, generate PO, bid progress, unggah lampiran, dan pembacaan PR di dalam
`POST /purchase-orders`. Endpoint restore sengaja TIDAK memakainya — tugasnya
memang membaca PR yang terhapus.

Masalah kedua juga diperbaiki: `SELECT ... FROM purchase_orders WHERE pr_id = ?`
di `generate-pos`, di PO create, dan di pengecekan hapus PR kini menyertakan
`AND is_deleted = 0`. PO yang sudah dibatalkan tidak lagi dihitung sebagai PO
aktif milik PR, sehingga PR-nya bisa di-generate ulang.

Tes bagian 21: PR yang dibatalkan tidak bisa di-approve, tidak bisa generate PO,
tidak bisa ditambah bid — ketiganya 404.

---

## PROC-R18 — UPDATE PO DAPAT MEMBUAT AP / PAYMENT SCHEDULE TIDAK SINKRON

### ✅ DITERAPKAN — tim development

`affectsPaymentSchedule` didefinisikan persis seperti daftar reviewer: `items`,
`payment_term`, `po_date`, `expected_date`, `advance_payment`,
`discount_percent`, `ppn_percent`, `notes`, `vendor_id`, plus
`payment_schedules`.

Sinkronisasinya juga dipindah KE DALAM transaction update — sebelumnya dipanggil
setelah transaction selesai, jadi "PO berubah tapi AP gagal berubah" memang
mungkin terjadi.

Saran "kalau `items` tidak ada pada payload, ambil current items dari database"
diikuti. Ini penting: memakai array kosong akan membuat total kontrak jadi nol
dan menghapus seluruh jadwal.

Tes bagian 22 mengirim `{ advance_payment: 40 }` saja pada PO ber-DP 20% lalu
memastikan jadwal pembayarannya benar-benar berubah.

---

## PROC-R19 — GENERATE-PO MULTI VENDOR BELUM IDEMPOTENT

### ✅ DITERAPKAN — tim development (Option B)

Kami pilih Option B (idempotency), bukan all-or-nothing. Alasannya: kalau vendor
C gagal karena datanya memang bermasalah, Option A akan membuang PO vendor A dan
B yang sudah benar dan memaksa seluruhnya diulang. Option B menyimpan yang sudah
berhasil dan hanya melanjutkan sisanya — itu yang lebih sesuai dengan cara orang
memakai tombol generate.

`purchase_orders.source_bid_id` ditambah, dengan UNIQUE `(pr_id, source_bid_id)`.
Percobaan kedua untuk bid yang sama ditolak database, ditangkap sebagai
`ER_DUP_ENTRY`, dan vendor itu masuk daftar `skipped` di respons — bukan error.

UNIQUE-nya sengaja mengizinkan banyak baris ber-`source_bid_id` NULL: seluruh PO
lama dan PO yang dibuat manual tidak punya nilai ini, dan MySQL tidak menganggap
NULL sebagai duplikat. Jadi tidak ada data berjalan yang terganggu.

---

## PROC-R20 — REVERSAL DAPAT MEMBUAT NEGATIVE STOCK

### ✅ DITERAPKAN — tim development

Persis seperti SQL yang reviewer sarankan: `UPDATE ... WHERE ... AND quantity >= ?`,
dan `affectedRows === 0` → 409 `INSUFFICIENT_STOCK_FOR_REVERSAL`.

Responsnya menyertakan `needed` dan `available` supaya user tahu berapa yang
kurang tanpa harus menebak. Karena seluruh reversal ada dalam satu transaction
(lihat R14), penolakan ini me-rollback juga pengurangan stok item lain yang
sudah sempat diproses — tidak ada reversal separuh jalan.

---

## PROC-R21 — DOCUMENT NUMBER MASIH MENGGUNAKAN UTC DATE

### ✅ DITERAPKAN — tim development

`businessDatePart()` memakai `Intl.DateTimeFormat` dengan `timeZone`, default
`Asia/Jakarta`, bisa ditimpa lewat env `BUSINESS_TIMEZONE`.

Dampaknya nyata: setiap dokumen yang dibuat antara 00:00 dan 07:00 WIB selama ini
bernomor tanggal kemarin.

---

## PROC-R22 — UPLOAD SECURITY SUDAH BAGUS, TAPI TRANSACTION CLEANUP BELUM SEMPURNA

### ✅ DITERAPKAN — tim development

Seluruh INSERT `pr_bid_documents` untuk satu permintaan kini dalam satu
`withTransaction`, termasuk update `pr_bids.quotation_file` yang sebelumnya
dijalankan terpisah setelahnya. Kalau ada yang gagal, baris database di-rollback
dan berkas fisik yang sudah ditulis dihapus di `catch`.

`handleUploadErrors` ditambahkan pada kedua endpoint upload mengikuti pola modul
Asset: `LIMIT_FILE_SIZE` → **413**, MulterError lain → 400, bukan 500 generik.

---

## PROC-R12 — received_by MASIH DAPAT DISPOOF

### ✅ DITERAPKAN — tim development

Diperbaiki persis seperti rekomendasi: `created_by` dan `received_by` dipisah.

Ternyata `goods_receipts` **tidak punya kolom `created_by` sama sekali** — itu
sebabnya penginput dokumen tidak pernah tercatat. Kolomnya ditambahkan lewat
`ensureGrnCreatedBy()`.

Sekarang `created_by` SELALU diambil dari token dan tidak bisa dikirim klien.
`received_by` tetap boleh diisi orang lain, karena penerima barang di gudang
memang sering bukan penginput dokumen — yang penting jejak penginputnya ada.
Kalau nanti bisnis ingin membatasi itu pun, sekarang datanya sudah tersedia untuk
diaudit.

---

## PROC-R13 — PARTIAL DELIVERY

### ✅ DIPUTUSKAN — pemilik bisnis

**Keputusan: tetap satu PO = satu GRN.** Partial delivery tidak diadopsi.

Diputuskan langsung oleh pemilik bisnis pada Agustus 2026, setelah reviewer
mengangkatnya dua kali. Jadi ini bukan item yang tertunda — ini tertutup.

Tidak ada perubahan kode. Sistem memang sudah berperilaku persis seperti
keputusan ini, dan sejak PROC-R15 penegakannya sudah tahan konkurensi:
pemeriksaan `activeGRN` berada di dalam transaction dengan
`SELECT purchase_orders ... FOR UPDATE`, sehingga 20 permintaan bersamaan pada
PO yang sama pun hanya meloloskan satu.

Yang kami kerjakan hanyalah mendokumentasikannya sebagai aturan bisnis di
`CLAUDE.md`, lengkap dengan tiga hal yang harus dijaga:

1. Penegakannya tetap di satu tempat (`POST /goods-receipts`), tidak ditambah
   jalur lain.
2. GRN yang di-reject atau direversal dihitung tidak aktif — itu jalur koreksi
   yang sah, bukan celah aturan.
3. Jangan menambahkan `received_qty` / `outstanding_qty` per item PO. Kolom itu
   hanya masuk akal untuk model partial delivery; menambahkannya setengah jalan
   justru menciptakan dua sumber kebenaran untuk jumlah yang diterima.

Verifikasi data: tidak ada satu pun PO dengan lebih dari satu GRN aktif.

Dengan ini seluruh temuan review procurement (R01–R22) sudah tertutup.

---
