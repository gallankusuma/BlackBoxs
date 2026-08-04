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

**Status: Terbuka — dijadwalkan berikutnya.**

Diverifikasi: tidak ada satu pun `requirePermission` / `hasPermission` di seluruh `backend/src/routes/`. [user.routes.ts:115](backend/src/routes/user.routes.ts) memang menerima `role_id` dan `user_level` langsung dari body.

Reviewer benar bahwa pemisahan token mobile/admin bukan pengganti RBAC. Rencana yang disepakati dengan pemilik project: buat middleware `requirePermission(...)` lalu pasang bertahap, dimulai dari endpoint paling sensitif (`users`, `permissions`, `roles`, approve finance, HR salary), baru meluas. Belum dikerjakan di ronde ini.

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
| Sebagian | 7 |
| Terbuka | 1, 4, 8, 9, 10, 16, CI |

Dari 5 temuan P0 yang disebut reviewer, **3 sudah tertutup** (registrasi publik, password default, login mobile NIK-saja). Sisa P0: butir 4 (RBAC) dan butir 1 (master hardcoded, ditahan atas keputusan pemilik).

Prioritas berikutnya: **butir 4 (RBAC)** → butir 9 & 10 (transaction + nomor dokumen) → butir 16 (drift skema).

Verifikasi: `npm run test:all` 81/81, `tsc --noEmit` dan `vue-tsc --noEmit` bersih.
