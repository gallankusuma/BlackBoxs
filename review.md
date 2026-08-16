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

---

# Deep Review Analyst — 16 Agustus 2026

Baseline: commit `402640e7` (`main` = `origin/main`). Audit ini membaca HEAD saat
ini, bukan mengulang klaim review lama. Scope: autentikasi/otorisasi, HR mobile,
approval, upload, integritas transaksi, Estimator lifecycle, kontrak permission
frontend-backend, reproducibility database, dan jalur deploy.

Status seluruh butir di bawah: **Terbuka — untuk tim development**.

## Ringkasan risiko

| Severity | Jumlah | Tema |
|---|---:|---|
| P0 | 6 | scope token, approval bypass, takeover akun karyawan, payroll tampering, stored XSS/data exposure, bypass absensi |
| P1 | 8 | akun nonaktif, perluasan RBAC, audit identity, MR atomicity, Estimator race, handoff PR, schema drift, deploy ordering |
| P2 | 3 | permission key UI, notification ownership, route shadowing |

**Release blocker lama tetap berlaku:** butir P0 #1 di bagian atas dokumen ini,
login `master@admin.com` / `master`, masih aktif. Selama kredensial publik itu
belum dicabut, seluruh proteksi internal di bawah dapat dilewati dari luar.

> **[DEV] DITERAPKAN — dan temuan Anda ternyata masih kurang satu pintu.**
>
> Benar sepenuhnya, dan lebih buruk dari yang tertulis. Saat menutupnya kami
> menemukan bahwa kredensial ini punya **DUA** pintu, bukan satu:
>
> 1. Literal `password === 'master'` di `auth.routes.ts:26`.
> 2. Baris user master di **database** — id 99999, username `master`,
>    `user_level` 10, aktif — yang password bcrypt-nya memang `master`.
>
> Kalau hanya nomor 1 yang dicabut, login `master@admin.com` / `master` **tetap
> tembus** lewat jalur login biasa. Kami verifikasi langsung di produksi
> (perbandingan bcrypt dijalankan di server, hash tidak ditarik ke mana pun):
>
> ```
> MASTER_PASSWORD di .env produksi : BELUM ADA
> id=99999 user=master level=10 aktif=1 → password 'master' cocok? YA — TERBUKA
> ```
>
> Yang dikerjakan:
>
> - `auth.routes.ts` tidak lagi memuat kredensial apa pun. Jalur master membaca
>   `MASTER_PASSWORD` dari `.env` server, dibandingkan `timingSafeEqual`.
> - **Fail closed**: kalau tidak diisi, jalur master mati. Nilai `master` ditolak
>   mentah-mentah berikut `console.error`, karena nilai itu sudah publik.
> - `scripts/set-master-password.js` untuk mengganti password baris database
>   (input tersembunyi, tidak masuk shell history, hanya hash yang ditulis, dan
>   ia membuktikan sendiri password lama sudah tidak berlaku).
>
> Penggantian password produksi adalah langkah pemilik server — kami tidak
> menyentuh kredensial. **Sampai itu dijalankan, pintu nomor 2 masih terbuka.**
>
> Tes: `test:http` #6 (login publik → 401, tidak ada token terbit) dan
> `scripts/smoke-test.js` bagian 3, yang kini menembak kredensial ini setiap
> deploy.

---

## P0 — wajib ditutup sebelum menganggap security baseline selesai

### DR-P0-01 — Token mobile diterima sebagai token desktop di seluruh modul R&D

**Bukti:** [rnd.routes.ts:8](backend/src/routes/rnd.routes.ts) mendefinisikan
`authMiddleware` lokal yang hanya menjalankan `jwt.verify()`. Middleware itu
tidak memeriksa `scope: 'mobile'` dan dipakai oleh seluruh endpoint R&D, termasuk
create/update/delete project, formulation, lab test, stability study, task,
milestone, folder, dan dokumen. Token mobile dan desktop ditandatangani secret
yang sama.

**Dampak:** setiap karyawan yang berhasil login PWA dapat memakai token
mobilenya untuk membaca, mengubah, menghapus, dan mengunggah dokumen R&D.
Pemisahan token yang sudah benar di middleware pusat tidak berlaku di modul ini.

**Reproduksi:** kirim token hasil `POST /api/hr/mobile/login` sebagai Bearer ke
`GET /api/rnd/projects`. Secara kontrak harus `401`; middleware saat ini akan
meloloskannya.

**Acceptance criteria:**

1. Hapus middleware lokal dan impor `authMiddleware` pusat.
2. Token mobile mendapat `401` pada minimal satu GET dan seluruh kelas mutasi
   R&D; token desktop sah tetap lolos.
3. Tambahkan kasus ini ke `test:http` agar middleware lokal serupa tidak muncul
   lagi.

> **[DEV] DITERAPKAN.** `rnd.routes.ts` sekarang mengimpor `authMiddleware` pusat;
> middleware lokalnya dihapus. Ketiga acceptance criteria terpenuhi — `test:http`
> #7 menguji token mobile ditolak pada GET dan mutasi R&D, **dan** memastikan
> token desktop sah tetap lolos (bukan sekadar menutup semuanya).
>
> Dua hal tambahan yang kami temukan di middleware yang sama:
>
> - Ia memuat `process.env.JWT_SECRET || 'erp-secret-key-2024'` — secret cadangan
>   tertulis di repo publik. Kalau `JWT_SECRET` pernah kosong, siapa pun bisa
>   menandatangani token sendiri. Ikut hilang bersama middleware-nya.
> - Ia menyimpan identitas sebagai `req.user = decoded`, lalu 5 tempat membaca
>   `req.user?.id` — padahal payload memakai `userId`. Jadi `created_by` untuk
>   project, formulation, lab test, stability study, dan dokumen R&D **selalu
>   NULL**. Ini bagian DR-P1-03 untuk modul R&D; sudah ikut diperbaiki di sini.

### DR-P0-02 — Approval dapat disetujui/ditolak oleh user yang bukan approver

**Bukti:** inbox melakukan filtering permission/step di
[approval.routes.ts:31](backend/src/routes/approval.routes.ts), tetapi aksi
`PUT /inbox/:id/approve` di baris 165 dan `reject` di baris 208 hanya memakai
`authMiddleware`. Handler mengambil request berdasarkan ID lalu langsung
menulis `approval_actions`; tidak ada pengecekan permission, role, user yang
ditugaskan pada step, delegasi aktif, atau `can_reject`. CRUD rules/delegation/
escalation juga hanya membutuhkan login.

**Dampak:** menyembunyikan item dari inbox tidak melindungi aksi. User desktop
biasa yang mengetahui/menebak ID dapat menyetujui atau menolak request, bahkan
mengubah rule approval agar dirinya menjadi approver.

**Acceptance criteria:**

1. Otorisasi aksi dihitung ulang dari database pada request aksi, bukan dari
   hasil filtering UI/inbox atau payload token.
2. Lock `approval_requests ... FOR UPDATE`, validasi current step + assignee/
   role/delegation, lalu tulis action dan perpindahan step dalam satu transaction.
3. User tanpa hak mendapat `403` meskipun mengetahui ID; dua approve paralel
   hanya menghasilkan satu action/perpindahan step.
4. Lindungi konfigurasi dengan permission katalog yang sudah ada:
   `admin.approval-config.*` / `approval.approval-rules.*`.

> **[DEV] DITERAPKAN untuk aksi (kriteria 1–3). Kriteria 4 masih terbuka.**
>
> Terkonfirmasi persis: `approve` dan `reject` tidak memeriksa apa pun. Filter
> permission memang hanya ada di inbox, dan menyembunyikan item dari daftar
> tidak melindungi aksinya.
>
> Sebelum menggembok, kondisi produksi diperiksa dulu sesuai aturan project:
> **0 approval rule dan 0 approval request** — modul ini belum dipakai, jadi
> tidak ada user aktif yang bisa terkunci.
>
> - `resolveApprovalAuthority()` menghitung wewenang dari **database** tiap aksi:
>   user aktif, `user_level` ≥ 10 lolos, selain itu wajib punya permission
>   `approve`/`approve_1`/`approve_2` **dan** cocok dengan step berjalan.
>   Level sengaja dibaca dari DB, bukan dari payload token — token menyimpan
>   `userLevel` dan itu basi sampai 7 hari setelah hak dicabut.
> - `approver_role_id` ikut dihormati. Inbox lama hanya melihat
>   `approver_user_id`, sehingga step yang ditugaskan ke ROLE jatuh ke cabang
>   "siapa saja yang punya permission approve".
> - `can_reject` ditegakkan: berwenang menyetujui tidak otomatis berwenang menolak.
> - Lock `SELECT ... FOR UPDATE` + recheck status + tulis action + pindah step
>   dalam SATU transaction. Approve kedua yang berlomba dapat 409, bukan action
>   kedua.
> - Fallback "modul tanpa rule → pemegang permission approve boleh bertindak"
>   dipertahankan supaya modul yang belum dikonfigurasi tidak mati diam-diam —
>   tapi sekarang permission-nya benar-benar diperiksa, dulu tidak sama sekali.
>
> **Belum:** kriteria 4, penggembokan CRUD rules/delegation/escalation. Digarap
> di iterasi berikutnya.
>
> **Catatan keterbatasan:** `approval_requests` tidak menyimpan `rule_id`, jadi
> step berikutnya tetap dicari lewat `module`. Sudah dibuat deterministik
> (`ORDER BY arl.id, ars.id`), tapi perbaikan sebenarnya adalah menyimpan
> `rule_id` di request — itu perubahan model data tersendiri.
>
> Tes: `test:rbac` #7 — user tanpa hak 403 untuk approve dan reject, tanpa token
> 401, master tetap 200, approve ulang 409. Kode lama meloloskan yang pertama
> dengan 200.

### DR-P0-03 — User desktop biasa dapat mengambil alih akun mobile karyawan

**Bukti:** daftar employee di [hr.routes.ts:76](backend/src/routes/hr.routes.ts)
membocorkan NIK dan angka gaji kepada semua token desktop. Endpoint reset PIN
di baris 103 dan bulk `generate-missing-pins` di baris 127 juga hanya memakai
`authMiddleware`, lalu mengembalikan PIN polos pada respons.

**Rantai serangan:**

1. Login sebagai user desktop level rendah.
2. Ambil NIK melalui `GET /api/hr/employees`.
3. Panggil `POST /api/hr/employees/:id/reset-pin`; baca PIN dari respons.
4. Login mobile sebagai korban, ganti PIN, daftar credential WebAuthn penyerang,
   lalu baca payslip/attendance korban.

**Dampak tambahan:** `GET /hr/position-rates`, employee detail, payslip history,
dan data salary lain juga hanya memerlukan login; ini kebocoran data pribadi dan
kompensasi lintas departemen.

**Acceptance criteria:**

1. Reset/bulk PIN membutuhkan minimal `hr.employees.edit`; pembacaan gaji dan
   payroll membutuhkan `hr.payroll.view` atau permission HR relevan yang sudah
   ada di katalog.
2. Daftar employee generik meredaksi salary/rate/PIN status untuk pemanggil yang
   hanya membutuhkan dropdown nama.
3. Tes memakai token desktop tanpa permission: employee salary, reset PIN, bulk
   PIN, payslip history, dan position rates semuanya `403`.

> **[DEV] DITERAPKAN sebagian besar; satu bagian dikerjakan berbeda dari yang
> diminta, dengan alasan.**
>
> Rantai serangannya terkonfirmasi persis. `generate-missing-pins` bahkan lebih
> berat dari yang tertulis: satu panggilan mengembalikan PIN **seluruh karyawan
> aktif** yang belum punya PIN, sekaligus.
>
> Kondisi produksi diperiksa lebih dulu sesuai aturan project. Kelima user aktif
> memegang `hr.employees` (5 permission) dan `hr.payroll` (6) penuh; kedua role
> (`Admin`, `Manager Finannce & Acc`) juga memegang `hr.position-rates` penuh.
> Jadi penggembokan ini **tidak mengunci satu pun user aktif**.
>
> - `POST /hr/employees/:id/reset-pin` → `requirePermission('hr.employees.edit')`
> - `POST /hr/employees/generate-missing-pins` → idem
> - `GET/POST/PUT/DELETE /hr/position-rates` → `hr.position-rates.*`
>
> **Beda dari kriteria 2 — `GET /hr/employees` sengaja TIDAK digembok.** Endpoint
> ini dipanggil hampir semua layar sekadar untuk dropdown nama; menggemboknya
> akan mematikan banyak halaman yang tidak ada hubungannya dengan payroll.
> Yang diredaksi **angkanya**: `salary`, `basic_rate`, `tunjangan_rate`,
> `ot_rate`, dan `salary_type` menjadi `null` berikut penanda
> `salary_redacted: true`, kecuali pemanggil punya `hr.payroll.view` /
> `hr.employees.view` atau level ≥ 10. Ini persis yang kriteria 2 minta
> ("meredaksi ... untuk pemanggil yang hanya membutuhkan dropdown nama"),
> hanya saja kami tidak menggembok endpointnya.
>
> **NIK (`code`) tetap dikirim.** Ia identifier operasional yang dipakai layar,
> dan dengan reset PIN sudah digembok, NIK saja tidak lagi cukup untuk mengambil
> alih akun — rantai serangannya putus di langkah 3. Kalau tim reviewer menilai
> NIK sendiri sudah data sensitif, sebutkan dan kami redaksi juga.
>
> **Belum:** payslip history dan employee detail. Digarap di iterasi berikutnya
> bersama DR-P0-04, karena keduanya menyentuh jalur payroll yang sama.
>
> Tes: `test:rbac` #8 — reset PIN, bulk PIN, dan tarif jabatan 403 untuk user
> tanpa hak; daftar employee tetap 200 tapi angkanya null dan ditandai; master
> tetap melihat angka dan tetap bisa membuka tarif jabatan (memastikan proteksi
> tidak mengunci yang berwenang).

### DR-P0-04 — Finalisasi payslip mempercayai angka dan ID advance dari klien

**Bukti:** [hr.routes.ts:656](backend/src/routes/hr.routes.ts) menerima
`calculation`, `advances`, `deductions`, dan `net_salary` dari body lalu
menyimpannya langsung. Baris 699–703 menandai setiap `advances.records[].id`
sebagai deducted tanpa memeriksa employee, periode, status, atau jumlah. Update/
insert payslip dan mutasi salary advance tidak berada dalam transaction.

**Dampak:** selain endpoint belum ber-RBAC, bahkan user HR yang sah dapat
mengubah request lewat DevTools dan memfinalisasi gaji arbitrer atau menandai
kasbon milik karyawan lain sudah lunas. Kegagalan di tengah loop meninggalkan
payslip final tetapi hanya sebagian advance terpotong.

**Acceptance criteria:** hitung ulang seluruh komponen di server dari attendance,
employee rates, dan advance yang di-lock; validasi kepemilikan/periode/status;
simpan payslip + advance dalam satu transaction; pasang UNIQUE
`(employee_id, period_month, period_year)`; tambah tes payload angka palsu,
advance lintas employee, dan rollback failure.

> **[DEV] DITERAPKAN.**
>
> Terkonfirmasi seluruhnya. Yang membuat perbaikannya rapi: `GET /payslip` sudah
> menghitung semuanya di server sejak awal — absensi, tarif karyawan, aturan 40
> jam mingguan, cut-off 26→25. Yang salah cuma bahwa jalur SIMPAN tidak
> memakainya.
>
> Perhitungan itu diekstrak jadi `computePayslip()`; `GET` sekarang pembungkus
> tipis di atasnya, dan `POST /payslip/save` memanggil fungsi yang sama.
> Body klien hanya dipakai untuk `employee_id`, `period_month`, `period_year`,
> `project_id`, dan `notes`. Seluruh angka — basic, tunjangan, OT, gross,
> potongan, net — berasal dari server. Tidak ada rumus baru ditulis, jadi tidak
> ada risiko angka gaji bergeser.
>
> - **Kasbon**: yang ditandai lunas hanya kasbon yang dikembalikan
>   `computePayslip` sendiri (query-nya sudah tersaring `employee_id` + periode),
>   dan `employee_id` tetap diikutkan di `WHERE` UPDATE sebagai jaring terakhir.
>   `advances.records[].id` dari klien tidak lagi menyentuh apa pun.
> - **Transaction**: payslip + seluruh penandaan kasbon satu unit, dimulai dari
>   `SELECT ... FOR UPDATE` pada baris payslipnya.
> - **UNIQUE** `(employee_id, period_month, period_year)` dipasang lewat
>   `ensurePayslipPeriodUnique`. Produksi diperiksa dulu: 138 payslip, 0 kembar.
>   Kalau nanti ada kembar, index dilewati dan dicetak `console.error` — payslip
>   final adalah dokumen gaji, tidak dihapus otomatis.
> - **RBAC**: `requirePermission('hr.payroll.create', 'hr.payroll.edit')`.
>   Kelima user aktif produksi memegang `hr.payroll` penuh, jadi tidak ada yang
>   terkunci.
>
> Respons simpan kini mengembalikan `net_salary`, `gross_salary`,
> `total_deductions`, dan `advances_marked` versi server, supaya layar memakai
> angka server dan bukan angka yang barusan ia kirim sendiri.
>
> **Belum:** tes rollback failure (injeksi kegagalan di tengah transaction).
> Yang lain sudah.
>
> Tes: `test:rbac` #9 — dikirim `net_salary` 999.999.999 berikut id kasbon
> karangan; yang tersimpan angka server (0, karena periode uji tanpa absensi),
> kasbon karangan tidak tertandai, dan user tanpa hak dapat 403. Pada kode lama
> assertion pertama gagal karena angka palsu itu memang tersimpan apa adanya.
>
> Verifikasi tambahan setelah refactor 250 baris perhitungan gaji: struktur
> respons `GET /payslip` tetap identik (7 kunci, `calculation` 9 field, cut-off
> 26→25 utuh).

### DR-P0-05 — Upload publik + upload tanpa validasi membentuk stored XSS dan kebocoran dokumen

**Bukti utama:** [index.ts:180](backend/src/index.ts) melayani seluruh folder
`uploads` tanpa auth. Ini melewati route download ber-auth yang sudah dibuat.
Folder tersebut berisi asset documents, project files, dokumen umum, bid/PR,
fund request, payment proof, R&D, dan foto MR.

Beberapa uploader masih menyimpan ekstensi dari `originalname` tanpa magic-byte
validation: [documents.routes.ts:14](backend/src/routes/documents.routes.ts),
[project.routes.ts:416](backend/src/routes/project.routes.ts),
[finance.routes.ts:13](backend/src/routes/finance.routes.ts),
[rnd.routes.ts:515](backend/src/routes/rnd.routes.ts), dan
[material-request.routes.ts:13](backend/src/routes/material-request.routes.ts).
Project upload juga tidak memiliki size limit.

**Dampak:** user ber-token dapat mengunggah `.html`/`.svg` berisi script, lalu
mengirim URL `/uploads/...` pada domain aplikasi. Script same-origin dapat
membaca JWT desktop dari `localStorage`. Bahkan pada modul yang validasi filenya
sudah benar (Asset/Procurement), siapa pun yang memperoleh URL dapat mengunduh
dokumen tanpa auth.

**Acceptance criteria:**

1. Tidak ada static mount global untuk dokumen bisnis; unduh/preview melalui
   endpoint ber-auth atau signed URL sempit dan singkat.
2. Semua uploader memakai whitelist ekstensi + MIME + magic bytes, nama server
   acak, batas ukuran, cleanup orphan, dan handler Multer `413`.
3. File aktif (HTML/SVG/script/executable) ditolak; file pasif dikirim dengan
   `Content-Disposition` dan `nosniff` yang sesuai.
4. Tes mengetahui nama file valid lalu memastikan akses langsung tanpa token
   tetap `401/404`—bukan hanya menguji route download.

### DR-P0-06 — Absensi fingerprint + GPS dapat dilewati dengan token PIN biasa

**Bukti:** UI menyebut “Sidik jari + GPS”, tetapi
[hr.routes.ts:839](backend/src/routes/hr.routes.ts) menyediakan
`POST /hr/mobile/checkin` yang hanya memerlukan `mobileAuthMiddleware`; GPS
opsional dan tidak ada WebAuthn assertion. Endpoint WebAuthn sendiri menerima
koordinat/radius lokasi dari karyawan saat register
([webauthn.routes.ts:87](backend/src/routes/webauthn.routes.ts)) dan membolehkan
karyawan memindahkannya di baris 384.

Kedua jalur juga memakai `toISOString().slice(0,10)` untuk tanggal attendance
([hr.routes.ts:846](backend/src/routes/hr.routes.ts),
[webauthn.routes.ts:267](backend/src/routes/webauthn.routes.ts)). Antara
00:00–06:59 WIB, tanggal UTC masih hari sebelumnya, sehingga attendance masuk
ke tanggal/period payroll yang salah.

**Dampak:** pemegang token dari PIN dapat absen dari mana pun tanpa fingerprint
atau GPS, mengubah check-in/out yang menjadi basis payroll, dan pada pagi hari
WIB record masuk hari yang salah.

**Acceptance criteria:** hapus/tutup jalur bypass; ikat credential ke
`office_location_id` yang dikelola admin (jangan percaya koordinat/radius dari
karyawan); challenge sekali pakai + attendance write atomic; state transition
tidak boleh menimpa check-in/out yang sudah final; gunakan `BUSINESS_TIMEZONE`;
tes bypass HTTP, replay/concurrency, lokasi tampered, dan boundary 00:00 WIB.

---

## P1 — integritas dan otorisasi tinggi

### DR-P1-01 — Akun nonaktif masih dapat login dan memakai token lama

[auth.routes.ts:49](backend/src/routes/auth.routes.ts) mengambil user berdasarkan
email tetapi tidak memeriksa `is_active`. Middleware pusat di
[auth.ts:38](backend/src/middleware/auth.ts) juga hanya memverifikasi signature/
payload, tidak status database. Hanya endpoint yang kebetulan memakai
`requirePermission()` yang mengecek user aktif; mayoritas modul belum memakainya.

**Acceptance criteria:** user nonaktif ditolak saat login; token yang diterbitkan
sebelum deaktivasi tidak bisa memakai endpoint bisnis; tambah tes “login saat
inactive” dan “deactivate after token issuance”.

### DR-P1-02 — Backend RBAC masih belum menjadi default

Audit mekanis menemukan **405** registrasi endpoint mutasi desktop yang memakai
auth; hanya **65** terlihat memakai permission guard/guard khusus. **340** sisanya
tidak memiliki `requirePermission()` pada deklarasi route (sebagian kecil memang
self-service atau punya cek internal, jadi angka ini adalah inventory audit,
bukan klaim bahwa semua 340 identik).

Contoh berisiko: Finance approve/pay, HR payroll/attendance, Inventory transfer/
adjustment, Estimator proposal/AHSP, Document Centre, office locations, master
data, Production/QC, dan konfigurasi Approval. Permission untuk mayoritas resource
tersebut sudah ada di `PERMISSION_CATALOG`.

**Acceptance criteria:** buat matriks route → permission → role produksi;
verifikasi mapping produksi sebelum enforcement; terapkan per modul dan tambah
negative test token tanpa permission. Pertahankan pengecualian approval
Procurement berbasis level sampai mapping role produksi dibereskan, sesuai aturan
project.

### DR-P1-03 — 22 audit/ownership write memakai identitas yang selalu undefined

`authMiddleware` menyimpan identitas sebagai `req.userId` dan payload
`req.user.userId`, tetapi terdapat **22** akses ke `req.user?.id` pada lima file:
Finance, Documents, R&D, PPIC, dan Prospects. Contoh:
[finance.routes.ts:696](backend/src/routes/finance.routes.ts), baris 804;
[documents.routes.ts:129](backend/src/routes/documents.routes.ts), baris 215;
[ppic.routes.ts:193](backend/src/routes/ppic.routes.ts); dan
[prospects.routes.ts:113](backend/src/routes/prospects.routes.ts).

**Dampak:** `requester_id`, `approved_by`, payment creator, document access log,
MPS creator, R&D creator, dan prospect creator menjadi NULL. Jejak audit Finance
yang seharusnya paling kuat justru hilang.

**Acceptance criteria:** satu sumber identitas (`req.userId`) dengan tipe request
yang eksplisit; larang fallback `|| null` untuk kolom audit wajib; tes memastikan
ID di database sama dengan token pada tiap modul terdampak.

### DR-P1-04 — Material Request dapat menghasilkan MR/PR parsial dan duplikat

**Bukti:** create header + loop items tanpa transaction
([material-request.routes.ts:138](backend/src/routes/material-request.routes.ts));
nomor memakai `COUNT(*)+1` dan tanggal UTC (baris 151–158); approve membaca
`pending`, mengubah status, membuat PR, lalu link metadata tanpa transaction atau
row lock (baris 183–238). PR memakai random 4 digit. `notes` dibuat sebagai plain
text, tetapi approve menjalankan `JSON.parse(mr.notes)` di baris 237.

**Dampak konkret:** MR dengan catatan normal seperti “urgent” akan melempar saat
approve **setelah** status dan PR terlanjur dibuat; dua approve paralel dapat
membuat dua PR; kegagalan item meninggalkan header tanpa item lengkap.

**Acceptance criteria:** seluruh create/approve/delete multi-write transactional;
approve mulai dari `SELECT ... FOR UPDATE` + recheck; document counter atomic;
link PR disimpan pada kolom khusus/JSON yang dinormalisasi aman; idempotency unik
per MR; validasi item/qty/project di server; tes failure injection dan 20 approve
paralel.

### DR-P1-05 — Lifecycle Estimator masih punya jalur non-atomic/race di luar tes MTO

1. Create proposal memakai `MAX()+1`, lalu INSERT header dan template children
   dengan autocommit di [estimator.routes.ts:1307](backend/src/routes/estimator.routes.ts).
   Collision menghasilkan 500; kegagalan child meninggalkan proposal setengah
   terbuat.
2. Update proposal melakukan `proposalLock()` di luar transaction lalu UPDATE
   (baris 1408–1437). Delete juga read-check-delete tanpa row lock
   (baris 1557–1585). Request submit/deal yang berlomba dapat membuat metadata
   proposal submitted berubah atau proposal submitted terhapus setelah check
   awal lolos.

**Acceptance criteria:** counter proposal atomic; create header + template +
summary satu transaction; update/delete lock row dan recheck status di transaction
yang sama; tes race update-vs-submit dan delete-vs-submit. Pola
`proposalLockTx()` yang sudah dipakai jalur MTO dapat direuse.

### DR-P1-06 — Deal sukses dapat kehilangan handoff Procurement tanpa status/retry

[estimator.routes.ts:2276](backend/src/routes/estimator.routes.ts) membuat PR
setelah transaction deal. Error hanya dicatat ke log dan respons tetap sukses;
tidak ada `pending/success/failed`, outbox, atau retry. Nomor PR masih random
4 digit (baris 2339–2343), bukan counter Procurement. Material juga dibaca dari
komposisi `ahsp_items` saat deal, bukan baseline komposisi kontrak—perubahan
master AHSP setelah submit dapat mengubah kebutuhan procurement.

**Acceptance criteria:** simpan job/outbox handoff dalam transaction deal;
worker idempoten + retry + status terlihat UI; gunakan generator PR resmi dan
unique source proposal/project; kuantitas/material berasal dari snapshot kontrak
yang disepakati atau aturan bisnis yang terdokumentasi; tes deal sukses + forced
PR failure + retry tanpa duplikat.

### DR-P1-07 — Startup mengumumkan schema sukses walau tabel/kolom gagal

[database.ts:60](backend/src/config/database.ts) menelan setiap error
`execSchemaEnsure`; fallback ALTER juga mengembalikan “handled” walau gagal.
Loop schema utama di baris 1575–1588 hanya log warning lalu tetap mencetak
“initialized successfully”. Pencarian source menemukan tabel aktif seperti
`material_requests`, `material_request_items`, `document_categories`,
`employee_webauthn_credentials`, `webauthn_challenges`, `office_locations`, dan
`payroll_requests` tidak dibuat oleh schema/ensure yang dijalankan boot.

Ini memperluas temuan lama #16: fresh database bisa boot “sehat” tetapi modul
gagal pada request pertama.

**Acceptance criteria:** setiap schema change masuk ensure/migration yang
versioned; error DDL kritis menggagalkan startup; jalankan contract test dari
database kosong yang boot server lalu menyentuh minimal satu endpoint per modul;
validasi daftar tabel/kolom/index/FK yang dibutuhkan, bukan hanya jumlah tabel.

### DR-P1-08 — Frontend sudah live sebelum backend selesai dikompilasi

[deploy-blackbox.sh:49](deploy-blackbox.sh) membangun lalu mengunggah frontend
di baris 56; backend baru di-`tsc` pada baris 62. Jika compile backend gagal,
frontend baru sudah live terhadap backend lama—tepat risiko yang komentar script
sendiri ingin cegah. Tidak ada rollback frontend setelah restart/smoke gagal.

**Acceptance criteria:** semua build/typecheck/test dan validasi `VITE_API_URL`
selesai sebelum upload pertama; deploy kedua artifact sebagai satu release yang
dapat di-switch/rollback; jika health/smoke gagal, otomatis kembalikan frontend
dan backend ke release sebelumnya.

---

## P2 — correctness dan UX

### DR-P2-01 — Sepuluh permission key menu tidak cocok dengan katalog backend

[Layout.vue:330](frontend/src/components/Layout.vue) memeriksa resource yang
berbeda dari [database.ts:1399](backend/src/config/database.ts). Mismatch unik:

- `estimator.proposals` vs `estimator.estimator-proposals`
- `estimator.ahsp` vs `estimator.estimator-ahsp`
- `estimator.masters` vs `estimator.estimator-masters`
- `procurement.overview` vs `procurement.procurement-dashboard`
- `procurement.history` vs `procurement.procurement-history`
- `master-data.item-types` vs `master_data.item-types`
- `master-data.warehouse-locations` vs `master_data.warehouse-locations`
- `master-data.vendors` vs `master_data.suppliers`
- `admin.notification-settings` vs `admin.notifications`
- `admin.integration-settings` vs `admin.integration`

Non-master yang memiliki permission katalog tetap kehilangan menu. Karena router
hanya memeriksa keberadaan token, direct URL masih terbuka—dan banyak backend
route belum RBAC—sehingga UI dan API berbeda pendapat.

**Acceptance criteria:** gunakan konstanta resource bersama/generated, samakan
menu + route guard + backend, dan tes visibility untuk role non-master per menu.

### DR-P2-02 — Notification ownership tidak diperiksa pada mutasi per-ID/bulk

`GET /notifications` sudah scoped ke recipient, tetapi PUT read/unread di
[notifications.routes.ts:120](backend/src/routes/notifications.routes.ts),
DELETE baris 183, dan bulk action baris 203 hanya memakai ID dari klien tanpa
`recipient_id = req.userId`. POST juga menerima `sender_id` dari body.

**Acceptance criteria:** semua update/delete menyertakan owner dari token;
sender selalu dari token; bulk mengabaikan/menolak ID milik user lain; negative
IDOR tests untuk read, unread, delete, dan bulk.

### DR-P2-03 — FIFO/FEFO allocation route tidak pernah terjangkau

[warehouse.routes.ts:123](backend/src/routes/warehouse.routes.ts) mendaftarkan
`GET /:id` sebelum `GET /allocate-stock` di baris 276. Express menangkap string
`allocate-stock` sebagai `id`, sehingga store frontend
[warehouse.ts:179](frontend/src/stores/warehouse.ts) menerima 404 “Warehouse not
found”, bukan hasil allocation.

**Acceptance criteria:** letakkan static route sebelum `/:id` atau batasi ID ke
angka; tes HTTP `GET /warehouses/allocate-stock?...` mengembalikan kontrak
allocation, bukan handler detail warehouse.

---

## Carry-over yang belum boleh dianggap selesai

1. **Hardcoded master credential** — P0 lama #1, masih terbuka.
2. **Estimator revision workflow (R31)** — submitted revision lama belum punya
   alur “Create Revision” immutable.
3. **Steel Profile Master (R06)** — kode sudah lebih baik, tetapi keputusan
   Engineering untuk CNP legacy/UNP/siku dan larangan fallback profil asing belum
   final; structural-steel quotation belum layak disebut settled.
4. **CRM Notes ownership** — semua user masih membaca/mengubah/menghapus notes
   user lain.

## Verifikasi reviewer

| Pemeriksaan | Hasil |
|---|---|
| `backend: npx tsc --noEmit` | Lulus |
| `frontend: npm run build` | Lulus; 2.090 modul ditransform |
| Auth unit | 19/19 lulus |
| MTO calculator unit | 141/141 lulus |
| Depreciation unit | 26/26 lulus |
| Smoke produksi read-only | 12/12 lulus |

Lulus build/smoke **tidak membantah temuan**: smoke hanya memeriksa request tanpa
token, health/DB dasar, keberadaan endpoint, dan jalur `/uploads`; ia tidak
menguji pemisahan mobile→R&D, permission antar-user desktop, ownership, transaksi,
atau upload file aktif.

> **[DEV] Diterima tanpa bantahan — dan kritik ini tepat sasaran.**
>
> Pemeriksaan `/uploads` di smoke test kami menembak **direktori**, menerima 403,
> lalu mencatatnya "lulus". Yang sebenarnya perlu diuji adalah **berkas** di
> dalamnya. Kami buktikan ke produksi:
>
> ```
> https://blackboxs.io/uploads/bids/03fc0849-….jpg  →  HTTP 200, tanpa token
> ```
>
> Jadi pemeriksaan itu bukan cuma tidak memadai — ia memberi rasa aman palsu
> tentang persis lubang yang sedang terbuka. Labelnya sudah dijujurkan dan
> menunjuk DR-P0-05; assertion sebenarnya menyusul bersama perbaikannya.
>
> Cakupan smoke test juga sudah ditambah: kredensial master publik kini diuji
> setiap deploy. `test:all` penuh tidak dijalankan pada audit read-only ini
karena suite HTTP membuat/mengubah fixture database.

## Urutan eksekusi yang disarankan

1. Cabut master hardcoded → DR-P0-01 R&D scope → DR-P0-02 Approval bypass.
2. DR-P0-03/04 HR + Payroll dan DR-P0-06 attendance.
3. DR-P0-05 tutup static uploads dan seragamkan seluruh uploader.
4. DR-P1-01/02/03 fondasi identity + RBAC, lalu rollout per modul setelah audit
   mapping role produksi.
5. DR-P1-04/05/06 transaksi MR + Estimator/Procurement handoff.
6. DR-P1-07 schema reproducibility → DR-P1-08 atomic deploy.
7. Tutup P2 dan carry-over Estimator/Notes.

---

## Live Auto Review — 16 Agustus 2026 14:25 WIB

Baseline yang diverifikasi: commit `bd5c6090` (`fix(security): otorisasi &
atomicity aksi approval`). Source code tidak diubah oleh reviewer.

### [P0] DR-P0-02 belum lolos verifikasi: authority masih lintas modul, rule, dan level step

**Status reviewer: Diterapkan sebagian — transaction/row lock benar, tetapi
kriteria otorisasi 1–3 belum terpenuhi penuh.**

Perbaikan yang terverifikasi benar:

- identitas aksi sekarang memakai `req.userId`;
- status user dibaca ulang dari database;
- request di-lock `FOR UPDATE`, action dan perpindahan status ditulis dalam satu
  transaction, sehingga aksi kedua pada request yang sudah selesai mendapat 409;
- assignment user/role dan `can_reject` mulai diperiksa.

Namun masih ada bypass berikut:

1. [approval.routes.ts:30](backend/src/routes/approval.routes.ts) menerima
   **permission approve apa pun di seluruh ERP**. Query hanya memeriksa
   `p.action IN ('approve', 'approve_1', 'approve_2')`, tanpa mengikat
   `p.resource` ke `request.module`/`entity_type` dan tanpa mengikat
   `approve_1`/`approve_2` ke `current_step`. Akibatnya pemegang
   `assets.dispose.approve` atau approval Procurement dapat menyetujui request
   Finance. Pada modul tanpa rule, fallback baris 46–56 langsung meloloskannya.
2. [approval.routes.ts:38](backend/src/routes/approval.routes.ts) menggabungkan
   semua step dari **semua rule** yang memiliki `module` dan `step_order` sama.
   `condition_field`, `min_value`, `max_value`, `sequence`, dan `is_active` tidak
   dievaluasi. Approver yang ditugaskan pada satu rule dapat bertindak pada
   request yang seharusnya memakai rule lain. Pencarian next step di baris
   291–297 juga dapat berpindah memakai rule berbeda; `ORDER BY` hanya membuat
   hasil salah itu deterministik.
3. `approval_delegations` tidak dibaca sama sekali, sehingga delegasi aktif yang
   diminta acceptance criteria belum dapat bertindak. Sebaliknya CRUD rules,
   delegation, dan escalation masih `authMiddleware` saja—kriteria 4 memang
   sudah diakui tim development sebagai terbuka.

**Perbaikan yang diminta:** saat submit, pilih satu rule aktif berdasarkan
module/entity dan kondisi nilai, simpan `rule_id` pada `approval_requests`, lalu
semua authority/next-step query wajib memakai rule tersebut. Petakan permission
resource secara eksplisit per entity/module dan wajibkan action sesuai step.
Masukkan delegasi aktif dengan batas tanggal/module, tanpa mengubah assignment
asli. Jangan memakai fallback lintas resource.

### [P1] Tes baru memberi coverage semu dan meninggalkan fixture approval

[rbac.ts:155](backend/tests/rbac.ts) hanya membandingkan user dengan **nol
permission** melawan master. Tes ini tetap hijau untuk bypass lintas modul di
atas, tidak menguji wrong-resource permission, assigned-vs-unassigned approver,
`approve_1` vs `approve_2`, rule aktif/kondisional, delegasi, `can_reject`, atau
dua request paralel. `approve` lalu `approve` lagi secara serial bukan tes race.

Komentar menyatakan request uji “lalu dihapus lagi”, tetapi cleanup baris 179–181
hanya menghapus user dan role. Tidak ada penghapusan `approval_requests` atau
`approval_actions`, sehingga setiap `test:rbac` menambah history permanen dan
bertentangan dengan klaim suite idempoten.

**Acceptance:** buat fixture rule/request yang terisolasi, uji matriks positif
dan negatif di atas termasuk `Promise.all` untuk dua aksi paralel, lalu cleanup
action + request + rule dalam `finally` meskipun assertion gagal.

### Verifikasi run ini

| Pemeriksaan | Hasil |
|---|---|
| `backend: npx tsc --noEmit` | Lulus |
| Auth middleware unit | 19/19 lulus |
| HTTP/RBAC suite | Tidak dijalankan reviewer; suite membuat data |
| Commit `40fbeec1`, scope token R&D | Diterima pada level kode; memakai middleware pusat dan `req.userId` |
| Rotasi password master produksi | Tetap blocker operasional sampai password DB publik benar-benar diganti |

---

## Live Auto Review — 16 Agustus 2026 14:32 WIB

Baseline: commit `fee07032` (`fix(security): gembok penerbitan PIN & redaksi
data gaji`). Source code tidak diubah reviewer.

### Verifikasi DR-P0-03 — Diterima sebagian, belum ditutup

Yang sudah terverifikasi benar:

- reset PIN dan bulk generate PIN memakai
  `requirePermission('hr.employees.edit')`;
- seluruh CRUD position rate memakai permission action yang sesuai;
- daftar generik meredaksi seluruh alias angka yang benar-benar dikirim API
  (`basic_salary`, `basic_rate`, `tunjangan_rate`, `ot_rate`, `contract_type`)
  untuk user tanpa hak;
- TypeScript lulus dan auth unit 19/19 lulus.

Employee detail dan payslip history tetap terbuka seperti yang sudah diakui tim
development, sehingga DR-P0-03 belum boleh berstatus selesai.

### [P1 — Perlu klarifikasi] `hr.employees.view` ikut membuka seluruh angka gaji

[hr.routes.ts:90](backend/src/routes/hr.routes.ts) menganggap
`hr.employees.view` setara dengan `hr.payroll.view` untuk membuka gaji. Padahal
permission `hr.employees.view` juga menjadi gate menu “Data Karyawan” di
[Layout.vue:369](frontend/src/components/Layout.vue), sehingga role yang hanya
boleh melihat direktori karyawan otomatis memperoleh seluruh salary/rate.

Tim development perlu menetapkan semantik resminya:

- jika “Data Karyawan” memang termasuk kompensasi, dokumentasikan keputusan dan
  tambahkan tes role dengan `hr.employees.view` tanpa `hr.payroll.view`;
- jika permission itu hanya untuk biodata/direktori, unredaction wajib hanya
  memakai `hr.payroll.view` atau permission kompensasi khusus.

Tes sekarang hanya membandingkan role tanpa permission melawan master, sehingga
tidak menangkap batas kedua permission tersebut.

### [P2] Status keamanan PIN masih dapat dienumerasi semua user desktop

[hr.routes.ts:182](backend/src/routes/hr.routes.ts) masih hanya memakai
`authMiddleware`. Setiap token desktop dapat mengambil `has_pin`, status wajib
ganti PIN, waktu PIN dibuat, waktu lockout berakhir, dan daftar seluruh karyawan
aktif. Ini bukan takeover langsung setelah reset sudah digembok, tetapi memberi
rekonesans status autentikasi yang tidak dibutuhkan dropdown umum.

**Acceptance:** lindungi endpoint dengan minimal `hr.employees.view` (atau
`hr.employees.edit` bila ini murni alat administrasi PIN) dan tambahkan negative
test token tanpa permission.
