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

## AST-014 — Validasi backend belum memadai

**Status: Diterapkan** — [utils/asset-validation.ts](backend/src/utils/asset-validation.ts), [asset.routes.ts](backend/src/routes/asset.routes.ts)

Seluruh butir dari daftar reviewer ditutup:

| Aturan | Balasan |
|---|---|
| Harga negatif, residu negatif, biaya maintenance negatif, capital addition negatif | 400 |
| Residu > harga perolehan | 400 |
| Umur ekonomis nol, negatif, atau pecahan | 400 |
| Status / metode depresiasi tidak dikenal | 400 |
| Tanggal tidak valid | 400 |
| Kategori / P&ID / production line tidak ditemukan | 404 |
| P&ID bukan milik production line yang dipilih | 409 |
| Maintenance & riwayat pembelian untuk aset yang tidak ada | 404 |

**Pesan SQL mentah tidak lagi bocor.** 30 tempat memakai `res.status(500).json({ error: error.message })`, sehingga klien menerima nama database, tabel, dan constraint — misalnya `` Cannot add or update a child row: ... (`erp_genjaya`.`assets`, CONSTRAINT `assets_ibfk_1` ...) ``. Semuanya diganti `serverError()` yang mencatat detail aslinya ke log server dan membalas pesan umum.

### Catatan: `new Date()` tidak cukup untuk validasi tanggal

Implementasi pertama memakai `new Date(value)` lalu memeriksa `NaN` — dan **tesnya gagal**. Parser Date di JavaScript terlalu longgar:

- `new Date('32 Februari')` → **tahun 2032**, bukan Invalid Date
- `new Date('2026-02-30')` → digeser diam-diam menjadi **2 Maret 2026**

Keduanya akan lolos ke database sebagai tanggal yang salah tanpa error apa pun. Diganti dengan pemeriksaan format `YYYY-MM-DD` plus round-trip: hasil parse dicocokkan kembali ke angka aslinya untuk menangkap tanggal yang meluber.

---

## AST-020 — Automated test Asset Management

**Status: Sebagian** — [backend/tests/asset.ts](backend/tests/asset.ts), [backend/tests/rbac.ts](backend/tests/rbac.ts)

`npm run test:asset` kini 66 kasus. Dari 14 minimum test yang reviewer daftarkan, **7 sudah tertutup**:

| # | Test | Status |
|---|---|---|
| 1 | Create asset berhasil | ✅ |
| 2 | Concurrent create tidak duplicate | ✅ 20 request paralel |
| 3 | Edit nama tidak menghapus P&ID dan spec | ✅ |
| 4 | Straight-line depreciation benar | ⛔ butuh AST-003 |
| 5 | Declining-balance | ⛔ butuh AST-003 |
| 6 | Non-depreciable asset | ⛔ butuh AST-010 |
| 7 | Capital addition memperbarui basis | ⛔ butuh AST-004 |
| 8 | Disposed berhenti terdepresiasi | ⛔ butuh AST-006 |
| 9 | Viewer tidak dapat membuat/menghapus | ✅ di `test:rbac` |
| 10 | Upload file berbahaya ditolak | ✅ |
| 11 | Download membutuhkan autentikasi | ✅ |
| 12 | Hard delete aset aktif ditolak | ⛔ butuh AST-005 |
| 13 | Master yang dipakai tidak dapat dihapus | ⛔ butuh AST-013 |
| 14 | Invalid numeric dan date → 400 | ✅ |

Tujuh sisanya menguji perilaku yang **belum ada implementasinya** — semuanya bergantung pada Sprint Asset 2 dan 3. Menuliskan tesnya sekarang hanya akan menghasilkan tes yang gagal karena fiturnya memang belum dibuat, jadi ditunda mengikuti sprint masing-masing.

---

# Sprint Asset 2 — Financial Asset

Urutan diubah sedikit dari daftar reviewer: **AST-010 dikerjakan bersama AST-003**, bukan sesudahnya. Keduanya menyentuh fungsi yang sama — AST-010 menentukan *apakah* aset disusutkan, AST-003 menentukan *bagaimana*. Menggarapnya terpisah berarti menulis ulang mesin yang sama dua kali, dan sempat ada kondisi di mana saldo menurun sudah berjalan untuk tanah yang seharusnya tidak disusutkan sama sekali.

## AST-003 — Metode saldo menurun belum diimplementasikan

**Status: Diterapkan** — [utils/depreciation.ts](backend/src/utils/depreciation.ts)

Terkonfirmasi: `calcDepreciation()` lama tidak pernah membaca `depreciation_method`. User memilih saldo menurun, laporannya keluar garis lurus.

Dipilih opsi **implementasi lengkap**, bukan menghapus pilihannya. Rate tahunan diambil berjenjang: nilai eksplisit di aset → default kategori → **double-declining** (`2 / umur ekonomis`). Perhitungannya per bulan atas nilai buku berjalan dan tidak pernah menembus nilai residu.

Mesinnya dipindah ke modul terpisah yang **murni tanpa akses database**, sehingga rumusnya bisa diuji langsung tanpa server — `npm run test:depreciation`, 26 kasus.

Parameter `as_of_date` ditambahkan di `GET /assets` dan `GET /assets/:id` sesuai acceptance criteria, jadi nilai buku bisa diperiksa pada tanggal tertentu, bukan selalu hari ini.

## AST-010 — Depreciable vs non-depreciable

**Status: Diterapkan** — [config/database.ts](backend/src/config/database.ts), [utils/depreciation.ts](backend/src/utils/depreciation.ts)

Master kategori kini punya `is_depreciable`, `default_useful_life_years`, `default_depreciation_method`, `default_depreciation_rate`. Kategori **LAND/Tanah disetel non-depreciable**; sebelumnya tanah ikut disusutkan seperti mesin.

Aset mendapat `in_service_date` — depresiasi dimulai saat aset **siap digunakan**, bukan saat dibeli, sesuai catatan reviewer. Kalau kosong, jatuh kembali ke `purchase_date` supaya data lama tetap terhitung.

Aset non-depreciable mengembalikan `depreciation_note` yang ditampilkan di UI, jadi angka nol itu punya penjelasan alih-alih terlihat seperti bug.

Diverifikasi 26 unit test rumus + 9 kasus end-to-end lewat API (tanah nol, garis lurus vs saldo menurun berbeda, `as_of_date` berpengaruh, `in_service_date` menggeser awal depresiasi).

## AST-004 — Penambahan nilai tidak masuk basis depresiasi

**Status: Diterapkan** — [utils/depreciation.ts](backend/src/utils/depreciation.ts), [config/database.ts](backend/src/config/database.ts), [AssetDetail.vue](frontend/src/views/AssetDetail.vue)

Klasifikasi ditambahkan sesuai daftar reviewer: `capital_addition`, `expense`, `replacement`, `improvement`. **Hanya `capital_addition` yang menambah basis depresiasi.**

**Keputusan kompatibilitas yang penting:** kolom `entry_type` diberi default **`'expense'`**, bukan `'capital_addition'`. Baris riwayat pembelian yang sudah ada di produksi selama ini tidak pernah mempengaruhi depresiasi; menandainya `expense` membuat seluruh angka **tetap persis sama setelah deploy**. Kalau default-nya `capital_addition`, setiap aset yang punya riwayat pembelian akan mendadak naik nilainya dan seluruh laporan berubah tanpa ada yang meminta.

Tiap penambahan disusutkan **sendiri** sejak tanggal kapitalisasinya, memakai metode yang sama dan **sisa** umur ekonomis aset induk. Ini yang membuat acceptance criteria "histori sebelum kapitalisasi tidak berubah" terpenuhi — kalau penambahan digabung begitu saja ke harga perolehan, seluruh periode sebelumnya ikut terhitung ulang.

Diverifikasi: entri tanpa `entry_type` tidak mengubah penyusutan maupun nilai buku sama sekali; `capital_addition` menambah total cost dan memakai basis terbaru; nilai per 6 bulan sebelum tanggal kapitalisasi tetap 6 juta.

---

## Catatan keamanan deploy ke sistem yang sedang dipakai

Seluruh perubahan skema di Sprint Asset 1 & 2 bersifat **aditif** — hanya `ADD COLUMN` dan `CREATE TABLE`, tidak ada kolom yang dihapus, diubah tipe, atau diganti nama. Aplikasi versi lama tetap bisa berjalan di atas skema baru.

Yang **mengubah angka** setelah deploy hanya satu: menandai kategori `LAND` sebagai non-depreciable (AST-010). Aset tanah yang selama ini muncul dengan nilai penyusutan akan menjadi nol — benar secara akuntansi, tetapi berubah dari yang biasa dilihat. Saat boot, backend kini **melaporkan berapa aset yang terdampak** beserta perintah SQL untuk mengembalikannya sementara bila diperlukan.

Yang **tidak berubah** setelah deploy: seluruh angka depresiasi aset non-tanah, seluruh riwayat pembelian (default `expense`), dan akun master admin (dijamin ada oleh `ensureMasterUserRow`, diuji eksplisit di `test:asset`).

---

## AST-011 — Nilai historis berubah ketika master diedit

**Status: Diterapkan** — [config/database.ts](backend/src/config/database.ts), [utils/depreciation.ts](backend/src/utils/depreciation.ts), [asset.routes.ts](backend/src/routes/asset.routes.ts)

Dua tabel baru: `asset_depreciation_periods` (status periode) dan `asset_depreciation_ledger` (hasil perhitungan per aset per bulan, beserta akumulasi dan nilai buku setelahnya).

**Cara kerjanya dirancang agar nol dampak bagi sistem yang sedang berjalan.** Selama belum ada periode yang ditutup, kedua tabel kosong dan perhitungan berjalan dinamis persis seperti sebelumnya — tidak ada satu angka pun yang berubah setelah deploy. Finance baru mengunci periode ketika mereka siap.

Setelah sebuah periode ditutup: akumulasi sampai periode itu diambil dari **ledger**, dan yang dihitung dinamis hanya **selisih setelah tanggal kunci**. Jadi mengubah harga perolehan atau umur ekonomis hari ini tidak lagi mengubah laporan bulan yang sudah ditutup — perubahan estimasi berlaku prospektif, sesuai acceptance criteria.

Aturan yang ditegakkan:

- Periode harus ditutup **berurutan** — melompati bulan ditolak `409`, karena akumulasi yang diposting akan salah.
- Periode yang **belum berakhir** tidak bisa ditutup (`400`).
- Menutup periode yang sama dua kali ditolak `409`.
- Hanya **periode terakhir** yang bisa dibuka kembali; membuka periode di tengah ditolak `409` karena akumulasi periode sesudahnya jadi tidak konsisten.
- Penutupan periode berjalan dalam **satu transaction** (helper `withTransaction` baru di `config/database.ts`) — kalau satu insert gagal, seluruh periode tidak jadi ditutup.
- Butuh permission baru `assets.period.manage`.

### Catatan konvensi yang dipertahankan

Saat menulis tesnya, ketahuan aplikasi ini memakai konvensi **bulan penuh yang sudah lewat**: aset yang dibeli 1 Januari baru mencatat penyusutan pertama saat memasuki Februari. Ekspektasi tes saya semula mengasumsikan sebaliknya.

Konvensi lamanya **sengaja dipertahankan**, bukan diperbaiki — mengubahnya akan menggeser angka setiap aset di produksi sekaligus, dan itu justru jenis gangguan yang sedang kami hindari. Kalau tim reviewer menghendaki konvensi yang berbeda, itu perubahan tersendiri yang perlu direncanakan dengan penutupan periode lebih dulu.

### UI Periode Depresiasi

Halaman [AssetDepreciationPeriods.vue](frontend/src/views/AssetDepreciationPeriods.vue) ditambahkan supaya finance tidak perlu memanggil API langsung: daftar periode beserta status dan jumlah aset yang diposting, form tutup periode, dan tombol buka kembali yang **hanya muncul pada periode terakhir** — mengikuti aturan backend, bukan mengandalkan backend menolak.

Kedua aksi memakai dialog konfirmasi yang menjelaskan akibatnya, karena menutup periode mengubah cara nilai dihitung seterusnya. Saat belum ada periode tertutup, halaman menampilkan penjelasan bahwa perhitungan masih berjalan dinamis seperti biasa.

### Bug yang tertangkap karena membuka browser

Saat memverifikasi halaman baru ini di browser, ketahuan **`Login.vue` rusak** — ada satu `</div>` tidak berpasangan, sisa operasi penghapusan form registrasi di AST-003. Halaman login gagal render sama sekali.

Yang penting: **`vue-tsc --noEmit` meloloskannya**. Error parse template tidak terdeteksi oleh type checker, hanya oleh build sungguhan (`npm run build`) atau saat halaman dibuka. Seluruh 13 file `.vue` yang disentuh sesi ini kemudian diperiksa ulang lewat compiler Vite — hanya `Login.vue` yang rusak, dan sudah diperbaiki.

`CLAUDE.md` diperbarui: untuk perubahan `.vue`, `vue-tsc` saja tidak cukup, harus `npm run build`.

---

## AST-006 — Disposal belum menjadi proses bisnis

**Status: Diterapkan** — [config/database.ts](backend/src/config/database.ts), [asset.routes.ts](backend/src/routes/asset.routes.ts)

Alur yang diminta reviewer diterapkan penuh: `active → disposal_requested → approved (disposed) / rejected`, ditambah **pembatalan resmi** untuk memenuhi kriteria "aset disposed tidak dapat dikembalikan menjadi active tanpa reversal resmi".

Tabel `asset_disposals` mencatat alasan, metode, pembeli, tanggal rencana & realisasi, nilai jual, **nilai buku pada tanggal disposal**, **gain/loss**, dokumen pendukung, serta siapa yang mengajukan, menyetujui, menolak, atau membatalkan.

Gain/loss dihitung sebagai `proceeds − nilai buku pada tanggal disposal`, dan nilai bukunya diambil dari mesin depresiasi yang sama — termasuk menghormati periode yang sudah terkunci (AST-011).

**Perubahan perilaku yang perlu diketahui:** mengubah status menjadi `disposed` lewat edit biasa kini ditolak `409` dan diarahkan ke alur disposal. Begitu pula mengaktifkan kembali aset disposed. Ini satu-satunya bagian Sprint Asset 2 yang mengubah cara kerja pengguna — disengaja, karena tanpa itu seluruh alur persetujuan bisa dilewati. Pesan errornya menyertakan endpoint yang harus dipakai.

Permission baru `assets.dispose.approve` dipisah dari `assets.dispose`, sehingga pemisahan tugas pengaju dan penyetuju bisa diberlakukan lewat konfigurasi role. Saat ini pengaju masih boleh menyetujui permintaannya sendiri — keputusan proses, bukan teknis, mengingat tim produksi hanya 5 user.

Diverifikasi 27 kasus, termasuk kedua arah perhitungan: dijual di bawah nilai buku → **rugi 28 juta**, dijual di atas nilai buku → **untung 12 juta**.

---

## Bug yang tertangkap saat menulis tes disposal

**Tanggal bergeser satu hari, dan merambat setiap kali disimpan.**

Kolom `DATE` dikembalikan mysql2 sebagai objek `Date`, sehingga `2026-01-31` di database menjadi `'2026-01-30T17:00:00.000Z'` di respons — pergeseran zona waktu WIB (+07). [AssetDetail.vue](frontend/src/views/AssetDetail.vue) mengisi form dengan `String(nilai).substring(0, 10)`, jadi form menampilkan **30 Januari**. Begitu disimpan, tanggalnya benar-benar menjadi 30.

Artinya **setiap kali aset dibuka lalu disimpan, tanggal perolehannya mundur satu hari** — tanpa error, tanpa peringatan. Aset yang sering diedit akan melenceng jauh, dan karena tanggal perolehan adalah dasar perhitungan depresiasi, nilai bukunya ikut salah.

Ditutup di level driver dengan `dateStrings: ['DATE']`. Sengaja dibatasi ke `DATE` saja — kolom itu memang tidak punya komponen jam, jadi string tanggal murni selalu lebih benar; `TIMESTAMP` dan `DATETIME` dibiarkan apa adanya supaya modul lain tidak ikut berubah perilakunya.

Ada tes regresinya, termasuk simulasi siklus buka → simpan yang dulu menggeser tanggal.

---

# Sprint Asset 3

Urutan dalam sprint ini disusun sendiri berdasarkan tingkat kerusakan yang sedang berjalan, bukan urutan nomor: **AST-005 + AST-013 lebih dulu** karena keduanya soal penghapusan data yang tidak bisa dipulihkan.

## AST-005 — Penghapusan permanen merusak audit trail

**Status: Diterapkan** — [config/database.ts](backend/src/config/database.ts), [asset.routes.ts](backend/src/routes/asset.routes.ts), [AssetList.vue](frontend/src/views/AssetList.vue)

Diverifikasi ke database: `DELETE FROM assets` memicu `ON DELETE CASCADE` pada **lima tabel** — `asset_documents`, `asset_maintenance_logs`, `asset_purchase_history`, `asset_disposals`, dan `asset_depreciation_ledger`. Seluruh jejak finansial aset hilang permanen dalam satu klik. Ledger depresiasi ikut terhapus membuat laporan periode tertutup tidak lagi bisa direproduksi.

Penghapusan sekarang **logical**: `is_deleted`, `deleted_at`, `deleted_by`, `deletion_reason`. Aset hilang dari daftar dan detailnya membalas 404, tapi seluruh data anaknya utuh dan asetnya bisa dipulihkan lewat `POST /assets/:id/restore`.

Satu penolakan keras dipertahankan: aset yang **sudah masuk ledger periode tertutup tidak boleh dihapus sama sekali** (`409`), karena menghapusnya membuat laporan periode itu tidak konsisten. Diarahkan ke alur disposal.

Aman untuk sistem berjalan: kolom baru default `0`, jadi seluruh aset yang ada tetap tampil seperti biasa.

Teks konfirmasi di UI juga diperbaiki — sebelumnya menjanjikan "dokumen, riwayat perbaikan & pembelian ikut terhapus", yang kini tidak benar lagi. Sekarang meminta alasan penghapusan.

## AST-013 — Penghapusan Production Line dan P&ID belum aman

**Status: Diterapkan** — [asset.routes.ts](backend/src/routes/asset.routes.ts)

Dua masalah terpisah, keduanya ditutup:

**Production line** dihapus tanpa memeriksa apakah masih dipakai. Sekarang dicek jumlah aset dan P&ID di bawahnya; kalau masih ada, dibalas `409` **beserta jumlahnya** dan saran tindakan. Kalau sudah kosong, master-nya **dinonaktifkan** (`is_active = 0`), bukan dihapus — supaya histori lama tetap bisa dibaca.

**P&ID** dihapus lewat dua query tanpa transaction: melepas aset dari P&ID, lalu menghapus P&ID-nya. Kalau query kedua gagal, aset sudah terlanjur terlepas dari P&ID yang ternyata masih ada. Sekarang dibungkus `withTransaction`, dan melepas aset harus **disengaja** lewat `?detach_assets=1` — tanpa itu dibalas `409` beserta jumlah aset terdampak.

Diverifikasi 20 kasus, termasuk: dokumen/maintenance/riwayat pembelian tetap utuh setelah aset dihapus lalu dipulihkan, dan master yang masih dipakai menolak dinonaktifkan sambil menyebut berapa yang terdampak.

---

## Sisa: Sprint Asset 3 (lanjutan) dan 4

**Status: Terbuka.** AST-012, 015, 016, 017, 018, 019.

Urutan berikutnya: **AST-012** (state machine status) → **AST-015** (unique constraint) → **AST-018** (custodian & transfer) → **AST-017** (integrasi procurement) → **AST-016** (maintenance workflow) → **AST-019** (UI master).

---

## Verifikasi ronde ini

```bash
cd backend && npm run test:all
```

308 kasus dalam 6 suite, semua lulus:

| Suite | Kasus |
|---|---|
| `npm test` | 19 |
| `npm run test:http` | 36 |
| `npm run test:pin` | 28 |
| `npm run test:rbac` | 45 |
| `npm run test:asset` | 154 |
| `npm run test:depreciation` | 26 |

`tsc --noEmit` dan `vue-tsc --noEmit` bersih.
