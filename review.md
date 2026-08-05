# Review & Tanggapan Tim Development

Sumber review: `Review.rtf` dari tim reviewer, terhadap commit `8b5d1850`.
Tanggapan ini ditulis tim development (Claude). Status per butir: **Diterapkan**, **Sebagian**, **Disanggah**, atau **Terbuka**.

**Catatan verifikasi:** seluruh 17 temuan sudah dicek ulang langsung ke kode. **Tidak ada yang keliru** — semua klaim cocok dengan kondisi source, termasuk bug `created_by` di Notes. Tidak ada butir yang disanggah.

---

## P0

### 1. Master account hardcoded (`master@admin.com` / `master`)

**Status: Terbuka — ditahan atas keputusan pemilik project.**

Diverifikasi ada di [auth.routes.ts:26](backend/src/routes/auth.routes.ts). Login ini melewati database sepenuhnya dan memberi seluruh permission.

Pemilik project menyatakan akun ini **masih dipakai untuk login produksi**, jadi menghapusnya sekarang akan mengunci akses. Yang sudah dikerjakan sebagai pengurangan paparan: **seed user database `master` dengan password `master` dihapus** dari `seedDatabase()`, sehingga instalasi baru tidak lagi membuat kredensial publik itu. Jalur login hardcoded-nya sendiri belum disentuh.

Rencana penutupan (butuh eksekusi pemilik lebih dulu):
1. Pastikan ada akun admin normal di database yang bisa dipakai.
2. Hapus blok hardcoded di `auth.routes.ts`.

Sampai langkah 1 dikonfirmasi, butir ini tetap P0 terbuka.

### 2. Password default `admin123`

**Status: Diterapkan** — [config/database.ts](backend/src/config/database.ts)

Password seed tidak lagi konstanta di source. Sekarang dibaca dari `SEED_ADMIN_PASSWORD`; kalau kosong, digenerate acak (`randomBytes(12)`) dan ditampilkan **sekali** di log boot dengan peringatan untuk segera diganti.

Seed hanya jalan saat user `admin` belum ada, jadi database produksi yang sudah berisi tidak terpengaruh. Password `admin123` yang terlanjur terpasang di produksi **tetap harus diganti manual** — kode tidak bisa melakukannya.

### 3. Registrasi publik

**Status: Diterapkan** — [auth.routes.ts](backend/src/routes/auth.routes.ts), [Login.vue](frontend/src/views/Login.vue), [stores/auth.ts](frontend/src/stores/auth.ts)

`POST /api/auth/register` sekarang memerlukan `authMiddleware`. Endpoint juga **tidak lagi menerbitkan token** — yang memanggil adalah admin yang membuatkan akun, bukan user bersangkutan, jadi mengembalikan token milik user baru itu keliru.

Sisi UI: tombol "Create Account", form registrasi, dan aksi `register()` di Pinia store dihapus. User baru dibuat lewat menu Users.

Diverifikasi: `register tanpa token → 401` di `npm run test:http`.

### 4. RBAC backend

**Status: Diterapkan sebagian — endpoint manajemen user/role/permission sudah ditegakkan.**

Reviewer benar sepenuhnya: pemisahan token mobile/admin membedakan **jenis token**, bukan **kewenangan antar-user desktop**.

Yang dibuat: [middleware/permission.ts](backend/src/middleware/permission.ts) dengan `requirePermission('resource.action')`. Nama permission sengaja memakai string yang **sudah ada di database produksi** (`admin.users.create`, `admin.roles.edit`, dst.) — string yang sama juga sudah dipakai frontend lewat `authStore.hasPermission()`, jadi penegakan backend konsisten dengan apa yang memang sudah disembunyikan di UI.

Keputusan desain:

- **`user_level` dan permission dibaca dari database, bukan dari payload token.** Kalau dibaca dari token, pencabutan hak baru berlaku setelah token kedaluwarsa (7 hari).
- **`user_level >= 10` (master) melewati pemeriksaan**, disamakan dengan aturan di `authStore.hasPermission` supaya UI dan backend tidak berbeda pendapat.
- **User non-aktif ditolak** meski tokennya masih valid.

Sudah ditegakkan di `user.routes.ts`, `role.routes.ts`, `permissions.routes.ts` — total 17 endpoint.

**Dua temuan sampingan yang ikut ditutup:**

1. **Eskalasi lewat `user_level`.** Pemegang `admin.users.edit` bisa menyetel `user_level = 10` pada dirinya sendiri, yang berarti melewati seluruh RBAC yang baru dibuat. Sekarang hanya master yang boleh memberikan level ≥ 10, baik saat membuat maupun mengubah user.

2. **Role Admin ternyata tidak memiliki seluruh permission** — 480 dari 484 di produksi. Empat yang hilang (`assets.view`, `assets.manage`, `master_data.bom.approve_1/2`) adalah permission yang ditambahkan belakangan lewat `ensure*Schema` tapi tidak pernah dipetakan. Kalau endpoint asset diproteksi tanpa ini, admin produksi justru ikut terkunci. Ditutup dengan `ensureAdminRoleHasAllPermissions()` yang jalan paling akhir saat boot.

**Verifikasi kondisi produksi sebelum menegakkan:** dari 8 role, hanya 2 yang punya mapping permission (Admin 480, Manager Finance 234). Enam role lain nol permission — tapi **tidak ada user yang memakainya**, jadi penegakan ini tidak mengunci siapa pun. Kelima user produksi ada di dua role yang terisi.

**Penyimpangan yang disengaja:** `GET /users` **tidak** digembok `admin.users.view`, karena dipakai dropdown pilih project manager, tampilan nama approver, dan filter audit log — menggemboknya akan memutus fitur bagi user non-admin. Sebagai gantinya, kolom pribadi (email, telepon, alamat, `user_level`, `last_login`) hanya dikirim ke pemegang `admin.users.view`; yang lain menerima daftar nama saja.

**Temuan ketiga — katalog permission tidak reproducible (terkait butir 16).** Saat menguji RBAC di database lokal, ketahuan instalasi baru hanya punya **35 permission**, sedangkan produksi punya **484**. Artinya RBAC yang baru dibuat akan **menolak semua orang kecuali master** di instalasi baru, karena `admin.users.edit` dan kawan-kawannya tidak pernah ada. Katalognya ternyata dibuat manual di produksi dan tidak pernah masuk repo.

Ditutup dengan `ensurePermissionCatalog()`: 484 permission dari 88 resource, ditulis ringkas sebagai 7 kelompok aksi (bukan 484 baris literal). Diverifikasi database lokal kini identik dengan produksi — 484 permission, role Admin memegang seluruhnya.

**Masih terbuka:** modul lain (finance approve, HR payroll, procurement, inventory) belum memakai `requirePermission`. Fondasi dan katalognya sudah ada, tinggal dipasang per endpoint. Notes juga belum punya ownership (bagian kedua butir 15).

### 5. Login mobile hanya dengan NIK

**Status: Diterapkan** — [hr.routes.ts](backend/src/routes/hr.routes.ts), [config/database.ts](backend/src/config/database.ts), [MobileLogin.vue](frontend/src/views/mobile/MobileLogin.vue), [Employees.vue](frontend/src/views/Employees.vue)

Analisis rantai serangan dari reviewer akurat dan sudah ditutup. `POST /hr/mobile/login` kini mewajibkan **NIK + PIN**; request tanpa PIN dibalas 400, PIN salah dibalas 401.

Desain yang dipilih pemilik project: **PIN awal dari HR**, wajib diganti karyawan saat login pertama. Dipilih karena banyak pekerja lapangan tidak punya email, sehingga OTP butuh infrastruktur yang belum ada.

Detail implementasi:

- Kolom baru di `employees` lewat `ensureMobilePinSchema`: `mobile_pin` (hash bcrypt, tidak pernah disimpan polos), `mobile_pin_set_at`, `mobile_pin_must_change`, `mobile_pin_failed_attempts`, `mobile_pin_locked_until`.
- **Pesan seragam** untuk NIK tidak dikenal maupun PIN salah (`"NIK atau PIN salah"`), supaya endpoint ini tidak bisa dipakai menebak NIK mana yang valid.
- **Lockout**: 5 kali PIN salah mengunci akun 15 menit. Saat terkunci, PIN yang benar pun ditolak.
- Karyawan yang PIN-nya belum diatur dibalas 403 `PIN_NOT_SET` — disengaja, karena tanpa PIN faktor tunggalnya kembali menjadi NIK saja.
- `POST /hr/mobile/change-pin` (butuh token mobile): minimal 6 digit angka, tidak boleh sama dengan PIN lama, wajib menyertakan PIN lama.
- Sisi HR: `POST /hr/employees/:id/reset-pin`, `POST /hr/employees/generate-missing-pins` untuk migrasi awal, dan `GET /hr/employees/pin-status`. PIN hanya ditampilkan **sekali** di respons — yang tersimpan hanya hash-nya.
- UI: tombol "Reset PIN" per karyawan dan "Buat PIN yang Belum Ada" di halaman Employees, dengan dialog yang memperingatkan PIN hanya tampil sekali dan tombol salin.
- Hash PIN tidak pernah bocor: `GET /hr/employees/:id` memakai `e.*`, jadi kolom `mobile_pin` dibuang eksplisit sebelum dikirim.

**⚠️ Konsekuensi operasional yang harus disiapkan sebelum deploy:** karyawan yang belum punya PIN **tidak bisa login mobile sama sekali**. HR wajib menjalankan "Buat PIN yang Belum Ada" lalu membagikan PIN-nya sebelum perubahan ini naik ke produksi.

Diverifikasi: `npm run test:pin` — 28 kasus, termasuk lockout, kebocoran hash, dan pesan yang tidak membocorkan NIK valid.

---

## High

### 6. Enrollment WebAuthn bergantung autentikasi NIK

**Status: Diterapkan lewat butir 5.**

Reviewer benar bahwa akar masalahnya ada di butir 5, bukan di WebAuthn-nya. Karena token mobile kini hanya bisa diperoleh dengan NIK **+ PIN**, penyerang yang sekadar tahu NIK tidak lagi bisa mendapat token, mendaftarkan sidik jarinya, atau menetapkan koordinat GPS atas nama korban.

Yang **masih terbuka**: pengguna bertoken tetap bisa menentukan sendiri `latitude`/`longitude`/`radius` credential miliknya. Artinya karyawan sah masih bisa mendaftarkan lokasi absensi di titik pilihannya sendiri. Menutup ini butuh keputusan proses (mis. lokasi wajib dipilih dari master `office_locations` yang dikelola admin, bukan dari koordinat bebas) — belum diputuskan.

### 7. Folder upload terbuka publik

**Status: Sebagian** — [index.ts](backend/src/index.ts)

Mount ganda `express.static('/uploads')` sudah dihapus, tinggal satu. Namun **file masih dilayani publik tanpa auth** — ini belum selesai.

Catatan teknis untuk penyelesaiannya: URL seperti `/uploads/mr-photos/...` tersimpan sebagai nilai kolom di database dan dipakai langsung sebagai `<img src>`. Jadi menutup static mount saja akan mematikan tampilan foto Material Request dan gambar produk. Perlu endpoint media ber-auth plus migrasi cara frontend merujuk berkas.

### 8. Validasi upload

**Status: Terbuka.** Belum ada whitelist MIME/magic-byte. Diverifikasi masih memakai ekstensi dari `originalname`.

### 9. Material Request tanpa transaction

**Status: Terbuka.** Diverifikasi: insert header + loop insert item, dan approve → create PR → link PR, semuanya tanpa transaction.

### 10. Nomor dokumen rawan collision

**Status: Terbuka.** Nomor MR masih `COUNT(*)+1`, nomor PR masih random 4 digit.

Catatan: pola serupa di nomor **proposal** sudah diperbaiki lebih dulu menjadi berbasis `MAX(...)` di `estimator.routes.ts`. MR dan PR belum.

---

## Medium

### 11. JWT diterima dari query parameter

**Status: Diterapkan dengan penyesuaian** — [middleware/auth.ts](backend/src/middleware/auth.ts)

`authMiddleware`, `mobileAuthMiddleware`, dan `anyAuthMiddleware` kini **hanya** membaca header `Authorization`.

Penyesuaian terhadap rekomendasi: query token tidak dihapus total, karena ada satu pemakaian yang sah. [ProjectFiles.vue:844](frontend/src/components/projects/ProjectFiles.vue) membuka preview/unduh berkas lewat URL langsung, dan tag `<a>`/`<img>` tidak bisa mengirim header. Untuk itu dibuat `downloadAuthMiddleware` terpisah yang menerima `?token=`, dipasang **hanya** di 5 route preview/download (asset, documents, project files). Menghapusnya total akan mematikan fitur berkas proyek.

Diverifikasi: `?token= ditolak di API biasa → 401`, `?token= diterima di unduhan → 404` (404 = lolos auth, berkas uji memang tidak ada).

### 12. Fallback JWT secret

**Status: Diterapkan** — [middleware/auth.ts](backend/src/middleware/auth.ts)

`process.env.JWT_SECRET || 'secret'` (5 tempat) diganti konstanta modul yang **melempar error saat boot** kalau `JWT_SECRET` kosong. Modul ini juga memuat dotenv sendiri, karena `JWT_SECRET` dibaca saat modul load sedangkan `dotenv.config()` di `index.ts` baru jalan setelah semua import.

### 13. CORS terbuka

**Status: Diterapkan** — [index.ts](backend/src/index.ts)

`cors()` polos diganti whitelist dari `CORS_ORIGINS` (dipisah koma). Kalau kosong, default mengikuti `NODE_ENV`: produksi `https://blackboxs.io`, dev `localhost:5173` + `localhost:3005`. Request tanpa header `Origin` (curl, health check) tetap diizinkan.

### 14. Rate limiting

**Status: Diterapkan** — [index.ts](backend/src/index.ts)

`express-rate-limit` ditambahkan. Jalur autentikasi (`/auth/login`, `/auth/register`, `/hr/mobile/login`, `/webauthn/auth`) dibatasi 20 percobaan per 15 menit; seluruh `/api` dibatasi 300 per menit.

### 15. Bug `created_by` CRM Notes

**Status: Diterapkan** — [notes.routes.ts:42](backend/src/routes/notes.routes.ts)

Klaim reviewer benar: middleware menyimpan `req.userId`, tapi handler membaca `req.user?.id`, sehingga `created_by` selalu NULL. Diperbaiki menjadi `req.userId`.

Bagian kedua temuan ini — Notes belum punya ownership/permission — **masih terbuka**, akan ikut diselesaikan bersama butir 4 (RBAC).

---

## Reliability

### 16. Clean database belum menghasilkan skema lengkap

**Status: Terbuka — sudah terdokumentasi, belum diperbaiki.**

Reviewer benar dan ini memang temuan tim development sendiri saat menjalankan aplikasi di MySQL lokal: database baru menghasilkan ±78 tabel, produksi punya 141. File `.sql` di `backend/database/` belum tercermin di `ensure*Schema`.

Catatan tambahan reviewer bahwa `execSchemaEnsure` menangkap error lalu tetap lanjut juga benar — aplikasi bisa terlihat sehat padahal sebagian skema gagal.

### 17. Automated test belum jadi bagian repo

**Status: Diterapkan** — [backend/tests/](backend/tests/)

Tes yang sebelumnya hanya disebut di commit message kini masuk repo dan bisa dijalankan ulang:

```bash
cd backend && npm run test:all
```

Tiga suite, **81 kasus**, semuanya lulus dan bisa dijalankan berulang tanpa reset database:

| Perintah | Isi | Perlu server? |
|---|---|---|
| `npm test` | 19 kasus middleware murni | tidak |
| `npm run test:http` | 34 kasus auth/otorisasi end-to-end | ya |
| `npm run test:pin` | 28 kasus alur PIN mobile | ya |

Ditulis dengan `tsx` + `fetch`, bukan bash — versi bash sempat memberi hasil palsu karena `{...}` di argumen `curl -d` kena brace expansion sehingga body JSON terpecah dan server membalas 500, tetapi tesnya tetap lolos. Fixture dibuat sendiri oleh tiap suite (reset PIN lewat endpoint HR, karyawan sementara untuk kasus "belum punya PIN"), jadi tidak bergantung urutan jalan.

CI workflow **belum** ada — masih terbuka.

---

## Ringkasan

| Status | Butir |
|---|---|
| Diterapkan | 2, 3, 5, 6, 11, 12, 13, 14, 15, 17 |
| Sebagian | 4, 7 |
| Terbuka | 1, 8, 9, 10, 16, CI |

Dari 5 temuan P0 yang disebut reviewer, **4 sudah tertutup** (registrasi publik, password default, login mobile NIK-saja, dan RBAC untuk manajemen user/role/permission). Sisa P0: butir 1 (master hardcoded, ditahan atas keputusan pemilik) dan perluasan RBAC ke modul lain.

Prioritas berikutnya: perluas `requirePermission` ke finance/HR/procurement/inventory → butir 9 & 10 (transaction + nomor dokumen) → butir 16 (drift skema tabel, katalog permission-nya sudah beres).

Verifikasi: `npm run test:all` **109/109** (19 middleware + 34 HTTP + 28 PIN + 28 RBAC), `tsc --noEmit` dan `vue-tsc --noEmit` bersih.
