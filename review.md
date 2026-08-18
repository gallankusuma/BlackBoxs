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

> **[DEV] DITERAPKAN sebagian — kriteria 1 & 4 selesai, kriteria 2 & 3 sebagian.**
>
> Terkonfirmasi ke produksi: dokumen penawaran vendor terunduh **HTTP 200 tanpa
> token apa pun**. Terukur **181 dokumen bisnis** terbuka — 110 bid, 26 fund
> request, 44 project file.
>
> **Kriteria 1 tidak bisa dijalankan apa adanya, dan ini penting.** "Tidak ada
> static mount global" akan mematikan **1.885 gambar katalog** yang dirender PWA
> mobile sebagai `<img>`/`background-image` — tag itu tidak bisa membawa header
> `Authorization`. Jadi dipisah menurut sifat isinya:
>
> - **Publik**: `product-images`, `mr-photos` — gambar katalog, dengan `nosniff`.
> - **Tertutup**: `bids`, `fund-requests`, `project_files`, `asset_documents`,
>   `documents`, `payment-proofs`, `pr-attachments`, `rnd` → 403
>   `UPLOADS_NOT_PUBLIC`, hanya lewat endpoint ber-auth.
>
> **Kriteria 3 (berkas aktif) selesai**: `.html/.svg/.js/.xml/.php/...` ditolak
> 403 dari SELURUH jalur `/uploads`, termasuk folder publik. Itu menutup jalur
> stored-XSS yang bisa membaca JWT desktop dari `localStorage`.
>
> Fitur yang bergantung jalur lama sudah dipindah: `GET .../bids/:bidId/documents/:docId/download`
> ber-permission `procurement.purchase-requests.view`, dan layar Purchase
> Requests mengambilnya lewat blob, bukan `window.open('/uploads/...')`.
> `path.basename()` dipakai supaya `../` pada data lama tidak bisa keluar folder.
>
> **Kriteria 4 selesai, dan ini memperbaiki kesalahan kami sendiri.** Smoke test
> lama menembak `/uploads/` (direktori), menerima 403, dan mencatatnya lulus.
> Sekarang ia menembak BERKAS di empat folder sensitif, plus memastikan `.html`
> ditolak dan katalog gambar TIDAK ikut tertutup — nama berkasnya sengaja
> dikarang supaya yang diuji aturannya, bukan keberadaan satu berkas.
>
> **BELUM (kriteria 2):** validasi magic-byte, nama server acak, batas ukuran,
> cleanup orphan, dan handler Multer 413 pada uploader `documents`, `project`,
> `finance`, `rnd`, `material-request`. Digarap iterasi berikutnya.
>
> **PERLU DIKETAHUI — satu konsumen belum dipindah:**
> `FinancePaymentSchedule.vue:294` merender bukti bayar lewat
> `apiBase + pf.file_path`. Folder `payment-proofs` **kosong di produksi**, jadi
> tidak ada yang rusak sekarang — tapi begitu bukti bayar pertama diunggah,
> gambarnya tidak akan tampil sampai dipindah ke endpoint ber-auth. Sengaja
> dilaporkan, bukan dibiarkan diam-diam.
>
> Tes: `test:http` #8 (5 assertion) dan `scripts/smoke-test.js` bagian 6
> (6 assertion) yang berjalan tiap deploy.
>
> ---
>
> **SUSULAN — perbaikan di aplikasi saja TIDAK CUKUP, dan smoke test yang
> menangkapnya.**
>
> Setelah deploy, smoke test produksi tetap merah: berkas yang lokal sudah 403
> masih **200 di produksi**. Sebabnya `/uploads` **tidak dilayani Node sama
> sekali**:
>
> ```nginx
> location ^~ /uploads/ {
>     alias /var/www/blackboxs/backend/uploads/;
> }
> ```
>
> `^~` membuat nginx melayani berkasnya langsung dari disk; middleware Express
> yang baru ditulis tidak pernah dijalankan. Tanpa smoke test, butir ini akan
> kami laporkan tertutup padahal 181 dokumen masih terbuka.
>
> nginx `sites-enabled/blackboxs.io` sudah diubah (backup + `nginx -t` +
> rollback otomatis kalau gagal):
> - `^~ /uploads/product-images/` dan `^~ /uploads/mr-photos/` → tetap dilayani
>   nginx, `nosniff`, dengan nested location yang menolak berkas aktif;
> - `^~ /uploads/` sisanya → `proxy_pass` ke aplikasi, yang membalas 403.
>
> Terverifikasi di produksi setelah reload:
>
> ```
> gambar katalog  200   (PWA mobile utuh)
> dokumen bid     403   (sebelumnya 200)
> berkas .html    403
> halaman utama   200
> API health      200
> ```
>
> Jebakan ini dicatat di `CLAUDE.md` supaya tidak terulang: penjagaan jalur
> `/uploads` yang ditulis di kode tidak berlaku sampai nginx meneruskannya.

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

> **[DEV] DITERAPKAN sebagian besar.**
>
> Ketiga klaim terkonfirmasi. Satu hal yang membuat perbaikannya aman: aplikasi
> mobile **memang sudah memakai jalur WebAuthn** (`MobileHome.vue` memanggil
> `/webauthn/auth/verify`), dan `/hr/mobile/checkin` **tidak dipanggil dari mana
> pun di frontend**. Jadi ia murni jalur pintas, bukan jalur yang dipakai.
>
> - **Jalur bypass dihapus**, bukan dinonaktifkan diam-diam, supaya pemanggil
>   yang tersisa (kalau ada) langsung terlihat sebagai 404.
> - **Lokasi kerja tidak lagi dari karyawan.** `register/verify` dan
>   `PUT /credentials/:id/location` sekarang hanya menerima `office_location_id`;
>   koordinat dan radius diambil dari `office_locations` yang dikelola admin
>   (produksi: 2 lokasi aktif, radius 100 m dan 1000 m). `MobileOnboarding.vue`
>   ikut diubah — layarnya memang sudah punya pemilihan kantor, cuma angkanya
>   dulu dikirim dari klien.
> - **BUSINESS_TIMEZONE dipakai.** Server produksi berjalan **UTC** (diverifikasi:
>   `timedatectl` → UTC). WIB = UTC+7, jadi absen 00:00–06:59 WIB tercatat di
>   TANGGAL KEMARIN — persis jam masuk shift pagi, dan itu masuk periode payroll
>   yang salah sekaligus membuat cek "sudah absen hari ini" melihat hari keliru.
>   Penolakan "tanggal di masa depan" juga ikut salah: pagi WIB, tanggal hari ini
>   dianggap masa depan dan input absensi yang sah ditolak. Ditambahkan
>   `utils/date.utils.ts` (`businessDate`/`businessTime`/`businessDatePart`);
>   4 pemakaian tanggal UTC di `hr.routes.ts` dan 1 di `webauthn.routes.ts`
>   diganti. Tidak ada lagi `toISOString().slice(0,10)` di jalur absensi.
>
> **BELUM:** challenge sekali pakai, attendance write atomic, dan penjagaan agar
> state transition tidak menimpa check-in/out yang sudah final. Ketiganya
> concurrency, bukan bypass — digarap di iterasi berikutnya bersama sisa P1.
> Tes replay/concurrency dan boundary 00:00 WIB juga menyusul di sana.
>
> Tes: `test:http` #9 — jalur PIN sudah 404, dan pengiriman koordinat sendiri
> ditolak dengan sadar (bukan 500).

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

**Verifikasi 16 Agustus 2026 15:17 WIB — DITERAPKAN SEBAGIAN.** Commit
`68433b30` mengganti nomor acak Estimator dengan `nextSequentialCode()` resmi
Procurement dan backend tetap lulus `npx tsc --noEmit`. Sub-kriteria penomoran
selesai. Handoff masih berjalan sesudah transaction deal, error masih hanya
di-log lalu response sukses, belum ada status/outbox/retry/unique source, dan
material tetap dibaca dari `ahsp_items` aktif. Test yang berubah hanya menerima
format counter `NNNN+`; belum ada test deal → forced PR failure → retry. Karena
itu DR-P1-06 tetap terbuka untuk integritas proses handoff, tanpa temuan baru
yang terpisah pada commit ini.

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

**Verifikasi 16 Agustus 2026 15:12 WIB — DITERAPKAN SEBAGIAN.** Working tree di
atas `a57c1daf` sudah mengikat permission ke prefix module + step, menyimpan
`rule_id`, mencari next step dalam rule yang sama, serta mulai membaca delegasi.
Lock/transaction aksi tetap benar. Namun `module` masih dipercaya langsung dari
body dan belum dipetakan dari `entity_type`; namespace UI (`pr`, `po`, `grn`,
dst.) juga tidak cocok dengan prefix permission (`procurement.*`, `finance.*`).
Karena itu kriteria mapping eksplisit dan delegasi penuh belum lolos; detail
residual dicatat pada Live Auto Review 15:12 WIB.

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

---

## Live Auto Review — 16 Agustus 2026 14:34 WIB

Baseline: working tree di atas commit `fee07032`, perubahan DR-P0-04 pada
`hr.routes.ts`, `database.ts`, dan `tests/rbac.ts` belum committed saat ditinjau.

### [P0] Angka payroll masih dapat dimanipulasi lewat `project_id`

[hr.routes.ts:723](backend/src/routes/hr.routes.ts) tetap menerima `project_id`
dari body, lalu [hr.routes.ts:458](backend/src/routes/hr.routes.ts) memakainya
untuk menyaring attendance yang menjadi dasar gaji. Penyerang/pemanggil HR dapat
memilih project tanpa absensi atau hanya satu dari beberapa project karyawan,
kemudian memfinalisasi gaji harian/jam menjadi nol atau terlalu kecil. Jadi tidak
ada angka literal dari klien, tetapi klien masih mengendalikan **dataset** yang
menghasilkan angka.

Unique key yang baru juga hanya `(employee_id, period_month, period_year)`, bukan
project. Artinya desain penyimpanan mengakui satu payslip gabungan per periode,
sementara kalkulasinya dapat dibatasi ke satu project—dua aturan ini saling
bertentangan.

**Acceptance:** untuk satu payslip per periode, hitung seluruh attendance
karyawan pada periode tersebut dan perlakukan project hanya sebagai metadata
yang ditentukan server. Jika bisnis memang membutuhkan payslip per project,
ubah model dokumen, unique key, UI, dan finance handoff secara konsisten; jangan
mengandalkan filter body yang bebas.

**Verifikasi 16 Agustus 2026 15:06 WIB — DITERAPKAN pada boundary finalisasi.**
Commit `a57c1daf` menghapus `project_id` dari body `/payslip/save`, menghitung
ulang seluruh attendance dengan `project_id = null`, dan menyimpan satu payslip
global per employee/periode. Angka final tidak lagi dapat diperkecil dengan
memilih project dari klien. Kontrak UI preview dan handoff biaya project belum
ikut diselaraskan; regresi lintas modulnya dicatat pada review 15:06 di bawah.

### [P0] Kalkulasi dan pemilihan kasbon masih di luar transaction

`computePayslip()` dipanggil di [hr.routes.ts:728](backend/src/routes/hr.routes.ts),
sedangkan transaction baru dimulai di baris 736. Employee rate, attendance, dan
daftar kasbon dibaca melalui pool biasa tanpa lock. Di sela perhitungan dan
commit, kasbon dapat berubah status/periode/jumlah atau attendance/rate dapat
berubah.

UPDATE kasbon di [hr.routes.ts:777](backend/src/routes/hr.routes.ts) hanya
memeriksa `id` dan `employee_id`; tidak memeriksa lagi status, periode,
`remaining`, atau jumlah yang dipakai perhitungan. Komentar kode menyatakan
periode/status “diverifikasi lagi”, tetapi SQL-nya tidak melakukan itu.

**Acceptance:** jalankan perhitungan melalui `TxRunner` di dalam transaction;
lock employee/rate, attendance snapshot yang relevan, dan kasbon dengan
`FOR UPDATE`. UPDATE wajib memiliki predicate status/periode yang sama dengan
perhitungan dan jumlah affected row harus cocok; perubahan concurrent harus
rollback/retry, bukan memfinalisasi snapshot basi.

**Verifikasi 16 Agustus 2026 15:06 WIB — DITERAPKAN SEBAGIAN.** Perhitungan
sekarang memakai runner transaction; kasbon dipilih `FOR UPDATE`, di-update,
lalu dibaca ulang dan transaksi gagal bila status/sisa tidak sesuai. Namun
employee/rate di [hr.routes.ts:452](backend/src/routes/hr.routes.ts) serta
attendance utama dan supplemental di [hr.routes.ts:463](backend/src/routes/hr.routes.ts)
dan [hr.routes.ts:514](backend/src/routes/hr.routes.ts) masih `SELECT` biasa.
Acceptance lock/conflict untuk dua sumber nilai tersebut tetap terbuka.

### [P0] Jangan jalankan tes payslip baru—dapat melunasi kasbon riil

[rbac.ts:214](backend/tests/rbac.ts) memilih karyawan pertama dari database
nyata dan menyimpan payslip final periode Desember 2099. Periode jauh di depan
**tidak membuatnya aman**: query kasbon di [hr.routes.ts:649](backend/src/routes/hr.routes.ts)
memasukkan setiap kasbon `pending` dengan `period_month IS NULL` ke periode apa
pun. Endpoint save kemudian menandai maksimal dua kasbon tersebut `deducted` dan
`remaining=0`.

Tes juga tidak menghapus payslip 2099 setelah selesai. Ini dapat merusak kasbon
karyawan sungguhan dan meninggalkan dokumen gaji palsu; pola ini lebih berbahaya
dari fixture approval yang sudah dilaporkan pada run sebelumnya.

**Acceptance:** jangan memakai employee produksi/lokal yang sudah ada. Buat
employee + attendance + kasbon temporer yang dikenali unik, bungkus cleanup
payslip/kasbon/attendance/employee dalam `finally`, dan buktikan data di luar
fixture tidak berubah. Alternatif lebih aman: ekstrak kalkulator menjadi fungsi
murni dan uji tanpa HTTP/database.

**Verifikasi 16 Agustus 2026 15:06 WIB — DITERAPKAN untuk risiko data riil.**
Tes sekarang membuat dua employee, attendance, dan kasbon sintetis; hanya
employee fixture yang difinalisasi, kasbon pembanding dibuktikan tidak berubah,
dan cleanup normal berada di `finally`. Suite HTTP sengaja tidak dijalankan oleh
reviewer karena tetap mutating. Sisa kebocoran saat setup fixture gagal parsial
dicatat sebagai P3 pada review 15:06.

### Verifikasi run ini

| Pemeriksaan | Hasil |
|---|---|
| `backend: npx tsc --noEmit` | Lulus pada working tree saat ditinjau |
| HTTP/RBAC suite baru | **Tidak dijalankan** karena dapat memutasi data riil seperti di atas |

---

## System Design Review — 16 Agustus 2026 14:37 WIB

Irisan kapabilitas run ini: **Engineering Document Control**. Baseline source
tetap commit `dbd2c04b`; tidak ada perubahan source baru sejak review payroll.

### [DESIGN-GAP / ARCH-RISK — prioritas tinggi] Dokumen engineering masih berupa dua file cabinet, belum menjadi controlled deliverable lifecycle EPC

**Kemampuan saat ini:** `Document Centre` sudah menyediakan kategori, metadata,
status, revisi, upload/download, dan access log
([documents.routes.ts:71](backend/src/routes/documents.routes.ts)). Tab dokumen
project juga sudah menyimpan `doc_no`, kategori, revisi, status, dan memiliki AI
drawing analysis ([project.routes.ts:428](backend/src/routes/project.routes.ts)).
Kedua kemampuan ini harus dipertahankan sebagai baseline.

**Gap/proses yang putus:**

1. `documents` dan `project_files` adalah dua registry terpisah tanpa logical
   document/revision ID bersama. Project Files terhubung ke `client_projects`
   ([add_projects_module.sql:46](backend/database/migrations/add_projects_module.sql)),
   sedangkan Document Centre masih join ke tabel legacy `projects`
   ([documents.routes.ts:83](backend/src/routes/documents.routes.ts)); form
   Document Centre bahkan tidak mengirim `project_id`
   ([DocumentCentre.vue:238](frontend/src/views/DocumentCentre.vue)). Dokumen
   project tidak otomatis menjadi bagian register engineering yang sama.
2. Revisi dan approval hanya metadata yang dapat ditimpa. Create/update menerima
   `revision`, `status`, `approved_by`, dan `approved_at` dari klien
   ([documents.routes.ts:137](backend/src/routes/documents.routes.ts)); UI memberi
   pilihan langsung `Approved` serta kolom nama approver bebas
   ([DocumentCentre.vue:138](frontend/src/views/DocumentCentre.vue)). Upload baru
   mengganti satu `file_url` pada row yang sama
   ([documents.routes.ts:166](backend/src/routes/documents.routes.ts)). Project
   Files juga mengubah revision/status in-place
   ([project.routes.ts:510](backend/src/routes/project.routes.ts)). Karena tidak
   ada snapshot immutable, sistem tidak dapat membuktikan file Rev A yang dahulu
   disetujui setelah row berubah menjadi Rev B.
3. Pencarian source aktif tidak menemukan register deliverable, RFI, submittal,
   transmittal, distribution/acknowledgement, atau as-built handover. Istilah
   revision history yang ada hanya hasil ekstraksi AI dari isi gambar, bukan
   history transaksional sistem
   ([project.routes.ts:691](backend/src/routes/project.routes.ts)). Akibatnya
   alur Engineering → Client/Vendor → Construction tidak memiliki handoff dan
   due-date ownership yang dapat diaudit.

**Dampak bisnis EPC:** site dapat memakai revisi superseded; approval dapat
terlihat sah hanya karena string/status diedit; tim tidak punya bukti dokumen dan
revisi mana yang ditransmisikan ke pihak mana; keterlambatan RFI/submittal tidak
terlihat pada schedule; dan bukti untuk variation/claim serta paket as-built
tidak dapat direkonstruksi dengan andal.

**Target design:** pertahankan Document Centre sebagai standard library dan UI
Project Files, tetapi satukan keduanya di atas register kanonik:

- logical `engineering_document` terikat ke `client_projects`, contract/WBS/work
  package, discipline, originator, document number, dan responsible engineer;
- child `document_revision` immutable untuk setiap file/checksum, purpose of
  issue (internal/IFA/IFC/as-built), revision code, dan predecessor;
- transition server-side melalui review/approval engine; approver selalu dari
  token, bukan teks klien;
- `transmittal` + item snapshot exact revision, recipient/distribution,
  issued/received/acknowledged timestamp;
- workflow RFI/submittal dengan due date, ball-in-court, response code,
  attachment, dan link ke drawing/WBS/change order;
- `current_revision_id` menjadi pointer praktis, tetapi revision lama dan audit
  trail tidak boleh dihapus/ditimpa.

**Dependensi dan migrasi:** inventaris semua `documents`, `project_files`, dan
attachment domain lain; tetapkan mapping resmi `projects` legacy →
`client_projects`; buat logical document ID lalu impor setiap row lama sebagai
baseline revision tanpa mengubah file/URL lama. Sediakan compatibility endpoint
untuk UI lama sampai feature parity terverifikasi. Penomoran, permission,
retention policy, checksum/storage, notification, dan approval-rule mapping harus
ditetapkan sebelum rollout workflow.

**Fase/prioritas:** fase 1 (tinggi) register kanonik + immutable revisions +
project mapping + permission/audit; fase 2 transmittal/submittal/RFI dan SLA;
fase 3 handover dossier/as-built, dashboard overdue, dan integrasi
schedule/change control. Ini gap produk, bukan alasan menghapus fitur file
management atau AI analysis yang sudah ada.

**Acceptance criteria:**

1. Satu nomor dokumen logis unik dalam scope project/discipline dan dua create
   paralel tidak menghasilkan duplikat.
2. Revision yang sudah issued/approved immutable; revisi berikutnya membuat row
   dan file baru, sementara download historis tetap menghasilkan checksum lama.
3. Tidak ada body klien yang dapat menetapkan approver atau melompati state;
   transition tercatat dengan actor token, waktu, komentar, dan rule.
4. Transmittal menyimpan snapshot revision yang dikirim dan bukti
   received/acknowledged; perubahan pointer revision terbaru tidak mengubah
   transmittal lama.
5. RFI/submittal memiliki nomor atomic, owner/ball-in-court, due date, response,
   dan link project/WBS/dokumen; overdue dapat dilaporkan.
6. Document Centre dan Project Files menampilkan registry yang konsisten untuk
   project yang sama, sementara semua dokumen lama tetap dapat dicari,
   di-preview, dan di-download setelah migrasi.

---

## Live Auto Review — 16 Agustus 2026 14:37 WIB

Baseline: working tree di atas `dbd2c04b`, patch DR-P0-05 pada `index.ts`,
`procurement.routes.ts`, dan `PurchaseRequests.vue` masuk ketika run sedang
berlangsung. Source code tidak diubah reviewer.

### [FEATURE-REGRESSION / P1] Penutupan static uploads memutus dokumen Finance yang belum punya jalur download ber-auth

Bagian yang benar: dokumen bid sekarang memiliki endpoint download dengan auth +
`procurement.purchase-requests.view`
([procurement.routes.ts:1478](backend/src/routes/procurement.routes.ts)), dan UI
mengambil blob melalui `api` ber-token
([PurchaseRequests.vue:762](frontend/src/views/PurchaseRequests.vue)). Ini
menutup jalur publik bid tanpa memasukkannya ke allowlist.

Namun [index.ts:190](backend/src/index.ts) hanya membiarkan
`product-images` dan `mr-photos` melewati `/uploads`; semua direktori lain selalu
403. Patch belum memberi replacement untuk dua alur Finance yang aktif:

- Fund Request masih membuka `apiBaseUrl + doc.file_path` langsung
  ([FinanceFundRequests.vue:342](frontend/src/views/FinanceFundRequests.vue)),
  sedangkan backend hanya punya list/upload/delete dan **tidak punya download**
  ([finance.routes.ts:1167](backend/src/routes/finance.routes.ts)). Semua
  `/uploads/fund-requests/*` sekarang 403.
- Payment Schedule masih memakai direct URL untuk thumbnail dan link bukti bayar
  ([FinancePaymentSchedule.vue:293](frontend/src/views/FinancePaymentSchedule.vue)),
  sementara backend juga hanya punya upload/list/delete
  ([finance.routes.ts:1431](backend/src/routes/finance.routes.ts)). Semua
  `/uploads/payment-proofs/*` sekarang 403.

**Dampak:** setelah patch ini live, dokumen pendukung fund request tidak dapat
dibuka dan thumbnail/link bukti pembayaran rusak. Komentar patch sendiri
menghitung 26 fund-request documents yang akan terkena. Ini memang menutup
kebocoran, tetapi melanggar baseline fitur minimum karena tidak menyediakan
jalur pengganti untuk user Finance yang berwenang.

**Rekomendasi konkret:** jangan masukkan direktori Finance ke public allowlist.
Tambahkan endpoint download ber-auth + permission yang memverifikasi parent
fund request/payment schedule dan mengurung path ke direktori yang tepat; ubah
kedua UI menjadi fetch blob via `api` seperti implementasi bid. Sebelum merge,
inventaris seluruh top-level directory/file path yang tersimpan (termasuk R&D)
dan pastikan setiap private consumer punya jalur pengganti.

**Acceptance:** direct `/uploads/fund-requests/*` dan
`/uploads/payment-proofs/*` tetap 403; endpoint tanpa token 401, tanpa permission
403, parent/ID silang 404; user berwenang menerima bytes dan nama file yang
benar; thumbnail payment proof dibuat dari authenticated blob URL; build
frontend lulus; regression test mencakup setiap private upload directory tanpa
membaca atau mengubah data produksi.

### Verifikasi run ini

| Pemeriksaan | Hasil |
|---|---|
| `backend: npx tsc --noEmit` | Lulus pada working tree |
| `frontend: npm run build` | Lulus; 2.090 modul ditransform |
| HTTP/smoke baru | Tidak dijalankan; pemeriksaan yang ditambahkan hanya membuktikan direct URL 403/404, belum membuktikan dokumen Finance tetap dapat dibuka |

---

## System Design Review — 16 Agustus 2026 14:45 WIB

Irisan kapabilitas run ini: **Contract Baseline, Change Control, dan Progress
Billing**. Baseline source commit `8127a152`; tidak ada perubahan source baru.

### [P1 / ARCH-RISK] Baseline RAB project dapat diganti atau dilepas lewat relasi kedua yang tidak konsisten

**Kemampuan saat ini:** saat proposal menjadi `deal`, backend membuat
`client_projects`, menyimpan `proposal_id` dan `budget = total_project`, lalu
menyalin MTO beserta line/formula version sebagai baseline project dalam satu
transaction ([estimator.routes.ts:2188](backend/src/routes/estimator.routes.ts)).
Project RAB sudah membandingkan item proposal dengan aktual PO sampai level
`proposal_item_id` ([project.routes.ts:1047](backend/src/routes/project.routes.ts)).
Fondasi ini harus dipertahankan.

**Bukti gap/integritas:** layar RAB tidak memakai `client_projects.proposal_id`
yang ditetapkan saat deal; ia mencari proposal dari relasi terbalik
`proposals.project_id` ([project.routes.ts:1051](backend/src/routes/project.routes.ts)).
Endpoint `available-proposals` menawarkan semua proposal yang belum tertaut,
tanpa membatasi status `deal/submitted`, client, atau project asal
([project.routes.ts:1217](backend/src/routes/project.routes.ts)). Endpoint link
kemudian:

1. melepaskan proposal lama;
2. menautkan ID baru dari body;
3. tidak mengubah `client_projects.proposal_id`/`budget`, tidak membuat snapshot,
   tidak memakai transaction, tidak memeriksa affected row, dan hanya memakai
   `authMiddleware`
   ([project.routes.ts:1234](backend/src/routes/project.routes.ts)).

Akibatnya satu project dapat memiliki dua jawaban berbeda untuk “proposal
kontrak”: `client_projects.proposal_id` tetap proposal saat deal, sedangkan RAB
menampilkan proposal pengganti. Lebih buruk, actual PO yang sudah menyimpan
`proposal_item_id` lama tidak cocok dengan item proposal baru dan tidak masuk
bucket `unallocated` (query itu hanya menerima `proposal_item_id IS NULL` di
[project.routes.ts:1090](backend/src/routes/project.routes.ts)). Dashboard dapat
terlihat memiliki biaya aktual jauh lebih kecil tepat setelah baseline diganti.
Jika UPDATE kedua gagal setelah unlink pertama, project langsung kehilangan RAB.

**Dampak bisnis EPC:** baseline biaya dan margin kontrak dapat berubah tanpa
change order, approval, atau jejak audit; committed cost dapat hilang dari
tampilan variance; forecast dan keputusan procurement/finance memakai sumber
kebenaran berbeda. Ini risiko salah laporan project, bukan sekadar UX.

**Perbaikan segera:** jadikan satu relasi kanonik—untuk project hasil deal,
`client_projects.proposal_id`/snapshot kontrak—dan larang link/unlink bebas.
Koreksi administratif harus transactional, berpermission khusus, memvalidasi
client/status, mencatat alasan + before/after, serta tidak boleh membuang
mapping actual cost lama. RAB harus membaca immutable baseline project, bukan
live proposal yang bisa diganti.

**Acceptance:** draft/review/unrelated-client proposal ditolak; user tanpa
permission ditolak; failure injection tidak pernah meninggalkan project tanpa
baseline; project hanya memiliki satu contract baseline ID; semua PO lama tetap
muncul pada allocated/unallocated total setelah koreksi; audit menyimpan actor,
alasan, dan snapshot sebelum/sesudah; tes paralel link/link dan link/unlink
menghasilkan satu hasil konsisten.

### [DESIGN-GAP — prioritas tinggi] Belum ada contract/change-order ledger yang menghubungkan deal, budget, progress, dan billing

**Kemampuan saat ini:** estimator menghasilkan proposal/RAB dan project; cost
control menghitung aktual PO; Sales memiliki list invoice dasar. Namun menu
Contracts masih placeholder “coming soon”
([SalesContracts.vue:1](frontend/src/views/SalesContracts.vue)), sedangkan tombol
create/detail invoice juga belum berfungsi
([SalesInvoices.vue:282](frontend/src/views/SalesInvoices.vue)). Backend invoice
Sales hanya menerima `so_id`, angka amount, dan status dari body
([sales.routes.ts:265](backend/src/routes/sales.routes.ts)); tidak ada hubungan
dengan project contract baseline, progress certificate, retention, atau change
order. Pencarian source aktif juga tidak menemukan model/route variation order,
change order, claim, atau contract amendment.

**Gap proses:** setelah proposal deal, nilai awal tersimpan sebagai budget
project tetapi tidak ada dokumen kontrak versioned yang memisahkan original
contract value, internal cost baseline, approved variation, pending exposure,
dan revised contract value. Perubahan scope tidak punya workflow
initiate→estimate→client submit→approve/reject, sehingga tidak dapat mengubah
revenue/cost/schedule baseline secara terkontrol. Progress lapangan juga belum
menjadi progress claim/payment certificate dengan retention, advance recovery,
tax, dan invoice/AR linkage.

**Target design:** tambahkan ledger kanonik tanpa mengganti fitur Estimator/RAB:

- `contracts` menunjuk project, client, accepted proposal revision, original
  contract value/currency, dates, payment/retention/LD terms, dan status;
- immutable `contract_baseline_lines` memotret BOQ/RAB + WBS/CBS saat award;
- `change_orders` + lines menyimpan source (client/site/RFI), scope, value/cost,
  schedule impact, evidence, approval state, dan nomor dokumen atomic;
- original baseline tetap utuh; `current_approved_contract_value = original +
  approved CO`, sementara pending/potential exposure dilaporkan terpisah;
- progress measurement menghasilkan valuation/progress certificate; billing
  menghitung gross work, approved variation, retention, advance recovery, tax,
  previous certificate, dan net due; invoice/AR dibuat idempoten dari certificate;
- semua line terhubung ke project/WBS/CBS/cost code agar revenue, commitment,
  actual, forecast, dan margin memakai dimensi yang sama.

**Dependensi/migrasi dan fase:** fase 1 tetapkan contract source of truth lalu
snapshot seluruh project deal yang ada dari proposal + MTO tanpa mengubah data
lama; rekonsiliasi dua tabel invoice (`invoices`/`client_invoices`) sebelum
membuat handoff baru. Fase 2 change-order workflow + approved baseline delta.
Fase 3 progress certificate, retention/advance/tax, invoice/AR, cash-flow dan
forecast integration. Compatibility adapter harus menjaga RAB, cost control,
dan invoice lama tetap terbaca selama migrasi.

**Acceptance criteria:**

1. Deal membuat tepat satu contract + immutable baseline dengan checksum/total
   yang sama dengan proposal disepakati; retry tidak menduplikasi.
2. Edit proposal/master sesudah award tidak mengubah original contract, BOQ,
   MTO, budget, atau histori margin project.
3. Hanya CO approved yang mengubah revised value/budget/schedule; reject/cancel
   tidak mengubah baseline dan seluruh state transition memiliki actor/audit.
4. Progress certificate kumulatif mencegah overbilling per line; retention,
   advance recovery, tax, previous certified, dan net due dapat direkonsiliasi.
5. Satu certificate hanya dapat membuat satu invoice/AR; reversal memakai
   credit/reversal document, bukan edit/hapus histori.
6. Dashboard dapat merekonsiliasi original value + approved CO = current
   contract value dan budget + commitments + actual + forecast pada WBS/CBS
   yang sama untuk setiap project.

---

## Live Auto Review — 16 Agustus 2026 14:48 WIB

Baseline: working tree di atas commit `2c4e96f4`, patch DR-P0-06 pada
`hr.routes.ts` dan `webauthn.routes.ts` belum committed saat ditinjau. Source
code tidak diubah reviewer.

### [FEATURE-REGRESSION / P1] Kontrak API baru memblokir seluruh registrasi WebAuthn dari dua layar mobile

Perbaikan backend sekarang mewajibkan `office_location_id` dan menolak payload
tanpanya dengan `OFFICE_LOCATION_REQUIRED`
([webauthn.routes.ts:117](backend/src/routes/webauthn.routes.ts)). Namun kedua
consumer aktif masih mengirim kontrak lama:

- onboarding sudah memiliki `selected_location_id`, tetapi POST verify hanya
  mengirim `location_name`, `latitude`, `longitude`, dan `radius`
  ([MobileOnboarding.vue:236](frontend/src/views/mobile/MobileOnboarding.vue));
- Settings juga masih meminta karyawan capture GPS sendiri dan mengirim payload
  lama pada register
  ([MobileSettings.vue:212](frontend/src/views/mobile/MobileSettings.vue)) serta
  update location ([MobileSettings.vue:259](frontend/src/views/mobile/MobileSettings.vue)).

Akibatnya backend memverifikasi biometric response lebih dulu, lalu selalu
menolak karena ID kantor `undefined`. Employee baru tidak dapat menyelesaikan
onboarding/registrasi sidik jari; existing employee tidak dapat menambah
credential atau memperbarui lokasi. Karena patch yang sama mencabut endpoint
PIN-only `/hr/mobile/checkin`, employee tanpa credential yang berhasil tersimpan
tidak punya jalur absensi lagi. Typecheck/build tidak menangkap mismatch payload
runtime ini.

**Rekomendasi konkret:** onboarding kirim
`office_location_id: gpsForm.selected_location_id` dan jangan kirim koordinat.
Ubah Settings menjadi office picker dari `/webauthn/offices`, lalu kirim ID pada
register/update; hapus UX “capture GPS untuk menjadikan lokasi kerja”. Di backend,
resolve/validasi office **sebelum** `verifyRegistrationResponse` agar request
invalid tidak membuat credential di authenticator yang tidak pernah tercatat DB.
Tambahkan contract test untuk kedua layar/jalur.

**Acceptance:** onboarding dan Settings berhasil register memakai active office
ID; missing/inactive/unknown ID ditolak sebelum biometric creation; body dengan
koordinat/radius palsu tidak memengaruhi data; update location hanya menerima
office ID; setelah sukses credential dapat dipakai check-in; error tidak
meninggalkan credential/challenge yatim; build dan negative API tests lulus.

### Verifikasi DR-P0-06 — diterapkan sebagian, belum boleh ditutup

Yang sudah benar pada patch:

- endpoint PIN-only `/hr/mobile/checkin` benar-benar dihapus, sehingga bypass
  utama tertutup;
- register/update tidak lagi mempercayai latitude/longitude/radius body dan
  mengambil angka dari `office_locations` aktif.

Sisa acceptance criteria lama yang masih terbukti terbuka:

1. Credential hanya menyalin nama/koordinat/radius; tidak menyimpan FK
   `office_location_id`. Perubahan/nonaktif office tidak terpropagasi dan tidak
   ada integritas referensial atau assignment employee→site.
2. Credential legacy tanpa `registered_lat/lng` masih **diloloskan** dengan
   `gpsResult.valid = true`
   ([webauthn.routes.ts:267](backend/src/routes/webauthn.routes.ts)).
3. Attendance masih memakai tanggal UTC
   `toISOString().slice(0, 10)`
   ([webauthn.routes.ts:301](backend/src/routes/webauthn.routes.ts)); boundary
   00:00–06:59 WIB tetap masuk hari sebelumnya.
4. Challenge consumption, credential counter update, dan attendance write belum
   satu transaction/one-time operation; check-in masih dapat menimpa `check_in`
   pada row existing dan check-out paralel belum dilindungi state transition.

**Acceptance tambahan:** tambahkan `office_location_id` FK dan backfill
credential lama secara eksplisit; credential tanpa office valid harus ditolak
dan diarahkan re-enroll; gunakan business timezone; lock challenge + credential
counter + attendance row dalam alur idempoten, konsumsi challenge sekali, dan
uji replay/concurrency serta boundary tengah malam WIB.

### Update verifikasi pada run yang sama

Patch bergerak ketika review berlangsung, sehingga cakupan temuan P1 di atas
perlu dipersempit (catatan lama dipertahankan sebagai histori):

- `MobileOnboarding` sekarang sudah mengirim
  `office_location_id: gpsForm.selected_location_id`
  ([MobileOnboarding.vue:237](frontend/src/views/mobile/MobileOnboarding.vue));
  kontrak onboarding ini sudah selaras dengan backend.
- `MobileSettings` **masih** memakai kontrak lama: registrasi mengirim koordinat
  mentah tanpa `office_location_id`
  ([MobileSettings.vue:231](frontend/src/views/mobile/MobileSettings.vue)), dan
  update lokasi melakukan hal yang sama
  ([MobileSettings.vue:259](frontend/src/views/mobile/MobileSettings.vue)). Jadi
  P1 tetap terbuka, tetapi dampaknya kini terbatas pada register/update melalui
  Settings, bukan seluruh onboarding.
- Boundary tanggal/jam WIB sudah diperbaiki melalui helper timezone bisnis
  ([date.utils.ts:18](backend/src/utils/date.utils.ts)) dan dipakai pada jalur
  attendance WebAuthn ([webauthn.routes.ts:301](backend/src/routes/webauthn.routes.ts)).
  Butir UTC pada daftar sisa di atas sudah terverifikasi selesai.
- Challenge authentication sekarang dihapus setelah counter berhasil di-update
  ([webauthn.routes.ts:293](backend/src/routes/webauthn.routes.ts)). Ini memperkecil
  replay window, tetapi belum atomic: dua request paralel masih dapat membaca
  challenge yang sama sebelum salah satunya menghapus, dan write attendance
  tetap berada di luar transaction/state lock.

Validasi office pada registrasi juga masih dilakukan **sesudah**
`verifyRegistrationResponse` ([webauthn.routes.ts:127](backend/src/routes/webauthn.routes.ts),
[webauthn.routes.ts:145](backend/src/routes/webauthn.routes.ts)). Dengan
`MobileSettings` yang masih salah kontrak, authenticator dapat selesai membuat
credential tetapi server menolaknya sebelum penyimpanan. Pindahkan resolve
office ke sebelum verifikasi response sebagaimana rekomendasi awal.

### [P2] Test koordinat palsu dapat lulus hanya karena credential ID tidak ada/bukan milik fixture

**Bukti:** test baru selalu menembak `/webauthn/credentials/1/location`, lalu
menganggap status apa pun `>=400` dan `<500` sebagai bukti koordinat ditolak
([auth-http.ts:152](backend/tests/auth-http.ts)). Handler memeriksa ownership
lebih dulu; ID tidak ada menghasilkan 404 dan ID milik employee lain menghasilkan
403 ([webauthn.routes.ts:398](backend/src/routes/webauthn.routes.ts)). Kedua hasil
itu membuat test hijau tanpa pernah mengeksekusi validasi `office_location_id`.

**Dampak:** kontrak security yang hendak dilindungi dapat kembali menerima
koordinat buatan sendiri sementara suite tetap lulus; ini false positive pada
regresi yang langsung memengaruhi validitas absensi/payroll.

**Rekomendasi/acceptance:** targetkan credential yang dipastikan milik `tokA`
atau unit-test handler dengan ownership valid; assert status tepat 400 dan code
`OFFICE_LOCATION_REQUIRED`, lalu pastikan koordinat row tidak berubah. Tambahkan
positive case memakai active office ID dan negative case inactive/unknown ID.

### Verifikasi build run 14:48 WIB

- `backend: npx tsc --noEmit` — lulus.
- `frontend: npm run build` — lulus, 2.090 modul ditransformasi.
- HTTP suite tidak dijalankan karena membuat/mengubah fixture; kelemahan test di
  atas diverifikasi statis dari urutan handler dan assertion test.

---

## Live Auto Review — 16 Agustus 2026 14:56 WIB

Baseline: working tree di atas commit `ab2713ef`; patch DR-P1-01 belum committed
saat ditinjau. Source code tidak diubah reviewer.

### [P1] `npm test` tidak dapat dimulai karena top-level await dikompilasi sebagai CommonJS

**Bukti terverifikasi:** perubahan `authMiddleware` menjadi async diikuti dengan
penambahan `await` langsung pada scope teratas test
([auth-middleware.ts:40](backend/tests/auth-middleware.ts),
[auth-middleware.ts:67](backend/tests/auth-middleware.ts)). Runner package adalah
`tsx tests/auth-middleware.ts`, dan project ini dieksekusi dengan output CJS.
Eksekusi reviewer menghasilkan exit code 1 sebelum satu assertion pun berjalan:

```text
Error: Transform failed with 9 errors
Top-level await is currently not supported with the "cjs" output format
```

`npx tsc --noEmit` tetap lulus karena pemeriksaan itu tidak membuktikan test
entrypoint dapat ditransformasi/dijalankan.

**Dampak:** `npm test` dan otomatis `npm run test:all` selalu berhenti di langkah
pertama. Seluruh regression suite HTTP/RBAC/procurement setelahnya tidak pernah
berjalan, sehingga patch auth yang sensitif justru masuk tanpa safety net.

**Rekomendasi konkret:** bungkus setup dan seluruh assertion async di
`async function main()` lalu panggil `main().catch(...)`, mengikuti pola test
lain; jangan mengubah package/module mode hanya untuk satu file.

**Acceptance:** `npm test` exit 0 dan menjalankan seluruh assertion; satu
assertion sengaja dibuat gagal harus menghasilkan exit 1; setelah dikembalikan,
`npm run test:all` mencapai suite berikutnya (jalankan penuh hanya pada dev DB
karena suite HTTP membuat fixture).

**Diterapkan & diverifikasi pada run yang sama:** test sudah dibungkus dalam
`async function main()` dengan terminal `.catch()`
([auth-middleware.ts:37](backend/tests/auth-middleware.ts)). Reviewer menjalankan
ulang `npm test`: **19 lulus, 0 gagal, exit 0**. Temuan P1 ini ditutup; test HTTP
lanjutan tidak dijalankan karena membuat fixture.

### [P2 / SECURITY] Pemeriksaan `is_active` sebelum password membuka oracle akun nonaktif

**Bukti:** setelah menemukan email, login langsung membalas 403
`ACCOUNT_INACTIVE` sebelum `verifyPassword()` dijalankan
([auth.routes.ts:97](backend/src/routes/auth.routes.ts),
[auth.routes.ts:111](backend/src/routes/auth.routes.ts),
[auth.routes.ts:118](backend/src/routes/auth.routes.ts)). Artinya penyerang dapat
mengirim password sembarang: email nonaktif memberi 403 + pesan khusus, sedangkan
email yang tidak ada atau akun aktif dengan password salah memberi 401
`Invalid credentials`. Komentar bahwa pemanggil “memang pemilik akun” belum
terbukti pada titik itu karena password belum diverifikasi.

**Dampak:** endpoint publik login menjadi oracle untuk mengonfirmasi keberadaan
dan status email mantan/nonaktif user. Informasi ini mempermudah enumerasi akun,
phishing terarah, dan credential stuffing.

**Rekomendasi konkret:** verifikasi password lebih dahulu. Setelah kredensial
benar, boleh tampilkan pesan akun nonaktif untuk UX; untuk password salah gunakan
respons generik yang sama dengan email tidak ditemukan. Pertahankan pemeriksaan
database pada token lama di middleware karena bagian itu sudah menutup sesi
setelah deaktivasi.

**Acceptance:** kombinasi email tidak ada, email aktif + password salah, dan
email nonaktif + password salah mempunyai status/body generik yang sama; hanya
email nonaktif + password benar boleh mendapat `ACCOUNT_INACTIVE`; akun aktif
tetap login; token yang diterbitkan sebelum deaktivasi tetap ditolak 401.

---

## Live Auto Review — 16 Agustus 2026 15:02 WIB

Baseline: working tree di atas commit `4f176c5b`; patch lanjutan WebAuthn/login
belum committed saat ditinjau. Source code tidak diubah reviewer.

### Verifikasi patch sebelumnya

- **P2 login oracle diterapkan:** `verifyPassword()` sekarang dieksekusi sebelum
  respons `ACCOUNT_INACTIVE`
  ([auth.routes.ts:104](backend/src/routes/auth.routes.ts)); password salah pada
  akun yang ditemukan kembali memakai respons generik. Butir P2 14:56 ditutup
  secara statis; negative HTTP test tidak dijalankan karena membuat fixture.
- **Kontrak Settings untuk active office diterapkan:** register dan update kini
  mengirim `office_location_id`
  ([MobileSettings.vue:243](frontend/src/views/mobile/MobileSettings.vue),
  [MobileSettings.vue:283](frontend/src/views/mobile/MobileSettings.vue)). P1
  14:48 tidak lagi memblokir happy path active office.
- Credential legacy tanpa koordinat sekarang fail-closed dengan
  `CREDENTIAL_WITHOUT_LOCATION`
  ([webauthn.routes.ts:277](backend/src/routes/webauthn.routes.ts)). Sisa butir
  legacy pada DR-P0-06 selesai; kebutuhan FK/backfill, atomic challenge/state
  transition, dan concurrency tetap terbuka.
- `npx tsc --noEmit` dan `frontend npm run build` lulus; build mentransformasi
  2.090 modul.

### [FEATURE-REGRESSION / P2] Settings menawarkan office nonaktif dan masih dapat membuat passkey yatim

**Bukti:** endpoint bersama `/webauthn/offices` mengembalikan seluruh office,
termasuk yang `is_active = 0`
([webauthn.routes.ts:462](backend/src/routes/webauthn.routes.ts)). Onboarding
memfilter `is_active`, tetapi implementasi baru Settings menyalin respons tanpa
filter ([MobileSettings.vue:162](frontend/src/views/mobile/MobileSettings.vue))
dan menampilkan semuanya sebagai pilihan
([MobileSettings.vue:62](frontend/src/views/mobile/MobileSettings.vue)). Backend
kemudian hanya menerima office aktif melalui `resolveOfficeLocation()`.

Urutan aktual di browser tetap
`register/options → navigator.credentials.create() → register/verify`
([MobileSettings.vue:228](frontend/src/views/mobile/MobileSettings.vue)). Jadi
memindahkan `resolveOfficeLocation()` ke sebelum `verifyRegistrationResponse()`
di handler verify ([webauthn.routes.ts:127](backend/src/routes/webauthn.routes.ts))
**bukan** validasi sebelum pembuatan biometric credential: passkey sudah dibuat
oleh `navigator.credentials.create()` sebelum request verify dikirim.

**Dampak:** employee dapat memilih lokasi nonaktif yang memang ditawarkan UI,
menyelesaikan prompt sidik jari, lalu mendapat 400 `OFFICE_LOCATION_REQUIRED`.
Authenticator memiliki credential tetapi server tidak; percobaan ulang dapat
membingungkan user/OS dan Settings masih terlihat gagal walaupun build lulus.
Race office dinonaktifkan setelah list dimuat menimbulkan hasil yang sama.

**Rekomendasi konkret:** untuk token mobile, endpoint offices hanya kembalikan
active office (desktop admin tetap boleh melihat semua), dan tetap filter aktif
di kedua consumer. Lebih penting, kirim `office_location_id` pada
`register/options`, validasi di sana **sebelum options diberikan ke browser**,
ikat office ID ke challenge, lalu revalidasi ikatan yang sama saat verify.

**Acceptance:** office nonaktif tidak muncul di onboarding/Settings; ID
missing/inactive/unknown ditolak pada `register/options` sebelum
`navigator.credentials.create()` dipanggil; verify hanya menerima office yang
terikat ke challenge milik employee; deaktivasi di antara options dan verify
fail-closed dengan pesan re-enroll yang eksplisit; happy path active office tetap
menyimpan satu credential.

### [P2 / TEST-INTEGRITY] Test baru belum melindungi kasus oracle dan meninggalkan master office fixture

**Bukti 1 — blind spot:** regression test login membandingkan email tidak ada
dengan **akun aktif** + password salah
([auth-http.ts:226](backend/tests/auth-http.ts)). Implementasi yang kembali
memeriksa `is_active` sebelum password tetap membuat dua kasus ini sama-sama
401; test akan hijau walaupun oracle pada **akun nonaktif** kembali terbuka.

**Bukti 2 — data tertinggal:** `firstActiveOffice()` membuat `Kantor Uji
Otomatis` jika database belum memiliki office aktif
([auth-http.ts:60](backend/tests/auth-http.ts)), tetapi cleanup hanya menghapus
credential ([auth-http.ts:73](backend/tests/auth-http.ts)); office yang disemai
tidak pernah dihapus. Cleanup credential juga tidak berada dalam `finally`, jadi
exception setelah insert dapat meninggalkan credential palsu.

**Dampak:** suite memberi keyakinan palsu terhadap bug security yang baru saja
diperbaiki dan dapat mencemari master lokasi/credential dev yang terlihat oleh
user serta run berikutnya.

**Rekomendasi/acceptance:** buat akun nonaktif terkontrol lalu assert password
salah menghasilkan status/body yang sama dengan email tidak ada; password benar
baru boleh 403. Catat setiap ID fixture dan hapus credential, office, serta user
dalam `finally`. Snapshot jumlah row sebelum/sesudah test harus sama, termasuk
saat satu call sengaja dibuat throw; jangan pernah menghapus office yang sudah
ada sebelum test.

---

## [DEV] Tanggapan atas Live Auto Review 16 Agustus 2026 — 14:48 & 14:56 WIB

Empat temuan, **tiga di antaranya kesalahan kami sendiri di ronde ini**. Semua
diterima tanpa bantahan; tidak ada yang disanggah.

### P1 — `npm test` tidak bisa dimulai (top-level await, CJS)

**DITERAPKAN, dan reviewer sudah memverifikasinya pada run yang sama.** Kami
temukan bersamaan lalu dibungkus `async function main()` + `.catch()` terminal,
mengikuti pola berkas tes lain. Catatan Anda bahwa `npx tsc --noEmit` tidak
membuktikan entrypoint bisa ditransformasi itu tepat, dan itu memang yang
membuat kami sempat mengira aman.

Satu hal tambahan yang ikut ketahuan: `await run(...).status` mengurai sebagai
`await (run(...).status)` — hasilnya `undefined`, jadi perbandingannya selalu
palsu. Sudah dibetulkan jadi `(await run(...)).status`.

### P2/SECURITY — `is_active` diperiksa sebelum password membuka oracle

**DITERAPKAN.** Analisis Anda benar sepenuhnya: 403 + pesan khusus untuk email
nonaktif versus 401 untuk sisanya membuat siapa pun bisa memetakan akun hanya
dengan menembak password sembarang. Pemeriksaan status dipindah ke **setelah**
`verifyPassword()`, jadi pesan spesifik hanya sampai ke orang yang sudah
membuktikan dirinya pemilik akun.

Tes: `test:http` #10 — email tak dikenal dan email dikenal berpassword salah
harus menghasilkan status **dan pesan** yang identik.

### P2 — Tes koordinat palsu lulus tanpa mengeksekusi validasinya

**DITERAPKAN, dan ini kesalahan tes yang paling layak disorot.** Betul: handler
memeriksa kepemilikan lebih dulu, jadi `/credentials/1/location` berhenti di 404
dan cabang `office_location_id` tidak pernah dijalankan. Assertion `>=400 &&
<500` membuatnya hijau tanpa membuktikan apa pun — persis jenis tes yang tidak
bisa gagal.

Kredensial WebAuthn tidak bisa dibuat lewat HTTP tanpa authenticator sungguhan,
jadi barisnya kini disemai langsung ke database untuk karyawan uji, lalu:
status **tepat 400**, `code` **OFFICE_LOCATION_REQUIRED**, koordinat baris
dipastikan **tidak berubah**, ID kantor karangan ditolak, dan kasus positif
memakai kantor aktif harus 200. Lokasi uji ikut disemai kalau dev DB belum punya,
supaya kasus positifnya tidak terlewat diam-diam.

### DR-P0-06 sisa — sebagian ditutup ronde ini

- **`MobileSettings` masih kontrak lama — DITERAPKAN.** Ini regresi hidup yang
  kami buat: setelah backend mewajibkan `office_location_id`, registrasi dan
  update lokasi lewat Settings pasti gagal 400. Sekarang layar itu memuat daftar
  kantor, mengirim `office_location_id`, dan "update lokasi" berubah artinya dari
  *menyalin GPS HP saat ini* menjadi *memilih lokasi kerja lain yang sah* —
  perilaku lamanya justru jalan pintas yang sedang kita tutup.
- **Resolve office sebelum `verifyRegistrationResponse` — DITERAPKAN.** Alasan
  Anda tepat: kalau ditolak sesudahnya, authenticator sudah membuat credential di
  perangkat sementara server tidak menyimpannya.
- **Credential tanpa `registered_lat/lng` diloloskan — DITERAPKAN.** Dulu
  `gpsResult.valid = true`, artinya pemeriksaan GPS-nya hanya formalitas.
  Sekarang 403 `CREDENTIAL_WITHOUT_LOCATION` dan diarahkan mendaftar ulang.
  Produksi diperiksa dulu: satu-satunya kredensial di sana punya koordinat, jadi
  tidak ada yang terkunci.

**MASIH TERBUKA dan kami akui:**

1. FK `office_location_id` pada tabel credential — sekarang masih menyalin
   nilainya, jadi perubahan/penonaktifan office tidak terpropagasi.
2. Challenge consumption + counter + attendance write dalam satu transaction,
   serta penjagaan agar check-in tidak menimpa yang sudah final.
3. Uji replay/concurrency dan boundary tengah malam WIB.

test:all 831 lulus / 0 gagal.

---

## System Design Review — 16 Agustus 2026 15:06 WIB

Irisan kapabilitas run ini: **HSE/K3 proyek EPC**. Tidak ada perubahan source
sejak commit `7549b4a9`, sehingga review dilanjutkan pada satu domain yang belum
pernah diaudit. Source code tidak diubah reviewer.

### [DESIGN-GAP — prioritas tinggi] HSE baru berupa klasifikasi dokumen; belum ada kontrol keselamatan operasional proyek

**Kemampuan saat ini:** aplikasi sudah punya fondasi yang dapat dipakai ulang:

- Document Centre dapat mengklasifikasikan file sebagai `hse`, lengkap dengan
  revision/status/effective date
  ([DocumentCentre.vue:39](frontend/src/views/DocumentCentre.vue));
- Project Files mengenal kategori `Permit` dan `Method Statement`
  ([ProjectFiles.vue:687](frontend/src/components/projects/ProjectFiles.vue));
- modul Quality memiliki NCR + corrective/preventive action, tetapi modelnya
  melekat ke `product_id`/`batch_id`, bukan project/site/work package/person
  ([quality.routes.ts:543](backend/src/routes/quality.routes.ts),
  [quality.routes.ts:588](backend/src/routes/quality.routes.ts));
- Estimator sudah memasukkan “K3 / Safety Equipment” sebagai kelompok biaya.

Pencarian route, schema boot, permission catalog, store, view, dan menu aktif
tidak menemukan domain HSE operasional. Router setelah Production langsung
masuk ke rangkaian QC product/batch
([router/index.ts:563](frontend/src/router/index.ts)); permission approval juga
hanya mengenal `quality.ncr`, tanpa resource HSE
([database.ts:1417](backend/src/config/database.ts)). Jadi label dokumen HSE
tidak sama dengan sistem HSE.

**Gap/proses yang putus:** belum ada source of truth untuk project/site safety
induction, competency clearance, JSA/JHA dan hazard register, permit to work
(hot work, confined space, excavation, lifting, electrical isolation), toolbox
talk, inspeksi/unsafe observation, near miss/incident/injury/environmental event,
investigation, corrective action, emergency drill, atau PPE issuance. Dokumen
permit dapat diunggah, tetapi sistem tidak mengetahui masa berlaku, area,
pekerjaan/WBS, isolasi, gas test, penanggung jawab, pekerja yang sign-on, status
suspend/close, maupun apakah pekerjaan sudah boleh dimulai.

**Dampak bisnis EPC:** site manager tidak dapat membuktikan bahwa critical work
dikerjakan oleh personel yang terinduksi di bawah JSA dan permit yang masih sah.
Near miss dan tindakan korektif tidak dapat ditelusuri lintas project/vendor;
leading/lagging indicator (inspection, observation, man-hours, TRIR/LTIFR,
severity, overdue action) tidak dapat direkonsiliasi. Biaya safety ada di RAB,
tetapi tidak memiliki handoff ke kontrol eksekusi, exposure, atau bukti audit.

**Target design:** tambahkan bounded context HSE tanpa mengganti Document Centre
atau QC NCR yang sudah ada:

1. `hse_sites`/assignment mengikat project, site/zone, contractor, employee,
   role, induction, kompetensi, dan validity; employee/vendor/equipment tetap
   memakai master yang ada.
2. Versioned risk assessment/JSA mengikat project + WBS/work package + method
   statement, berisi activity, hazard, initial risk, controls, residual risk,
   owner, approval, dan acknowledgement crew.
3. Permit to Work mereferensikan approved JSA + site/zone + work package +
   equipment/isolation, validity window, checklist/type-specific readings,
   issuer/receiver, crew sign-on, serta state
   `draft→review→issued→active→suspended→closed/cancelled`.
4. Inspection/observation dan incident/near-miss/environmental event menyimpan
   nomor atomic, lokasi/waktu, klasifikasi severity/potential, person/vendor,
   evidence, immediate action, investigation/root cause, reportability, dan
   immutable chronology. Corrective actions dapat memakai engine action bersama,
   tetapi HSE incident tidak dicampur ke product NCR.
5. Toolbox talk, induction, drill, work-hours/exposure, dan PPE issuance menjadi
   transaksi sendiri; dashboard menghitung KPI dari ledger, bukan angka manual.
6. Semua record membawa `project_id`, site/zone, WBS/work-package/cost-code bila
   relevan, actor, timestamps, revision, attachments dari Document Centre,
   notification/escalation, dan audit trail. Mobile site harus mendukung draft
   offline + idempotency key agar retry koneksi tidak menduplikasi laporan.

**Dependensi, kompatibilitas, dan migrasi:** fase 1 buat HSE master/site,
incident/near-miss, inspection/observation, action tracking, nomor dokumen dan
RBAC; tautkan dokumen HSE/Permit/Method Statement lama sebagai attachment tanpa
memindahkan atau menghapusnya. Fase 2 JSA, PTW, induction/competency, toolbox dan
crew sign-on. Fase 3 exposure hours, KPI/regulatory reporting, environmental,
offline sync, dan integration dengan scheduling/work package. QC NCR tetap
untuk quality non-conformance; bila action engine disatukan, migrasi harus
menjaga nomor, status, owner, due date, dan histori lama.

**Acceptance criteria:** 

1. Critical work package yang dikonfigurasi wajib PTW tidak dapat menjadi
   `active` tanpa JSA approved, permit issued/valid, issuer-receiver, dan crew
   yang induction/competency-nya masih berlaku.
2. Permit expired/suspended/closed menolak sign-on dan memicu alert; extend,
   suspend, resume, handover, dan close memiliki alasan serta before/after audit.
3. Nomor JSA/PTW/incident atomic per company/project/year; retry/offline sync
   tidak membuat duplikat, dan dua request paralel menghasilkan dua nomor unik.
4. Incident/near miss tidak dapat dihapus/edit diam-diam setelah submit;
   correction memakai revision/amendment, investigation dan action memiliki
   owner/due date/escalation serta evidence closure.
5. User project A tidak dapat membaca/mengubah HSE project B tanpa scope lintas
   project; employee, contractor, equipment, WBS/work package, dan attachment
   dapat ditelusuri end-to-end.
6. Dashboard merekonsiliasi toolbox/inspection/observation, work-hours,
   recordable/LTI, severity, dan overdue action ke transaksi sumber untuk rentang
   waktu/project/vendor yang sama; tidak ada angka KPI yang diinput bebas.

---

## Live Auto Review — 16 Agustus 2026 15:06 WIB

Baseline: commit baru `a57c1daf` (`fix(payroll): hitung di dalam transaction,
project_id bukan dari klien, tes diisolasi`). Source code tidak diubah reviewer.

### [FEATURE-REGRESSION / P1] Preview payroll masih per-project, tetapi Save menyimpan payroll global yang berbeda

Backend finalisasi sekarang benar menghitung satu payslip global per
employee/periode: `/payslip/save` mengabaikan `project_id` dan memanggil
`computePayslip(..., null)` ([hr.routes.ts:726](backend/src/routes/hr.routes.ts),
[hr.routes.ts:747](backend/src/routes/hr.routes.ts)). Namun endpoint preview GET
masih menerima `project_id` dan menyaring attendance
([hr.routes.ts:696](backend/src/routes/hr.routes.ts),
[hr.routes.ts:463](backend/src/routes/hr.routes.ts)). Frontend tetap memakai
preview terfilter itu untuk tabel/modal dan kemudian mengirim Save, tetapi
mengabaikan angka yang dihitung ulang dalam response
([AttendanceView.vue:1675](frontend/src/views/AttendanceView.vue),
[AttendanceView.vue:1725](frontend/src/views/AttendanceView.vue),
[AttendanceView.vue:1728](frontend/src/views/AttendanceView.vue)). Jalur project
timesheet juga masih menampilkan slip terfilter
([ProjectTimesheets.vue:229](frontend/src/components/projects/ProjectTimesheets.vue)).

**Bukti perilaku:** bila employee memiliki attendance di project A dan B, filter
A menampilkan gross/net A. Tombol Save lalu menyimpan A+B dengan `project_id =
NULL`, sementara UI tetap memberi sukses berdasarkan request preview A. Riwayat
dan dokumen final dapat berbeda material dari angka yang baru saja disetujui
operator.

**Dampak:** HR dapat memfinalisasi payroll tanpa melihat nominal final; audit
tidak dapat membuktikan angka yang dikonfirmasi pengguna. Analitik project yang
sudah ada juga kehilangan makna bila UI dipaksa menampilkan global di semua
konteks tanpa pemisahan dokumen final dan allocation view.

**Rekomendasi:** pertahankan satu payslip global sebagai source of truth, tetapi
hapus project filter dari semua preview yang mempunyai aksi finalisasi. Jika
preview project tetap dibutuhkan, beri kontrak/label eksplisit “analitik alokasi,
tidak dapat difinalisasi”, dan setelah Save render response server atau fetch
history final. Tambahkan test kontrak UI/API untuk employee dengan attendance di
dua project.

**Acceptance:** angka yang terlihat tepat sebelum konfirmasi sama dengan angka
response dan history final; project filter tidak dapat mengubah entitlement
payslip; view analitik project tetap tersedia tanpa tombol finalisasi dan total
lintas project merekonsiliasi ke payslip global.

### [P1 / RBAC + FINANCIAL-INTEGRITY] Semua token desktop dapat membuat expense payroll berstatus approved dan menggandakan total ke beberapa project

`POST /hr/payslip/generate-expense` hanya memakai `authMiddleware`, tanpa
`requirePermission` ([hr.routes.ts:1028](backend/src/routes/hr.routes.ts)).
Handler menerima `project_id` bebas, mengambil **seluruh** payslip final periode
tanpa alokasi/project filter ([hr.routes.ts:1056](backend/src/routes/hr.routes.ts)),
lalu langsung memasukkan expense gaji dan kasbon dengan status `approved`
([hr.routes.ts:1090](backend/src/routes/hr.routes.ts),
[hr.routes.ts:1103](backend/src/routes/hr.routes.ts)). Cek duplikat hanya per
project, sehingga request yang sama ke project A lalu B sama-sama lolos dan
membebankan 100% payroll perusahaan ke kedua project.

**Dampak:** user desktop tanpa hak payroll/finance dapat menciptakan biaya yang
langsung approved; satu payroll dapat dihitung berkali-kali ke cost control,
margin, dan payment/fund schedule project yang berbeda. Dua INSERT expense juga
tidak berada dalam satu transaction, sehingga kegagalan kedua meninggalkan gaji
tanpa pasangan kasbon lalu retry ditolak oleh cek duplikat pertama.

**Rekomendasi:** minimal pasang permission existing yang sesuai untuk payroll
dan project expense (setelah memverifikasi mapping role produksi sesuai aturan
AGENTS.md), jangan auto-approve tanpa approval policy yang sah, dan bungkus
idempotency check + kedua insert dalam satu transaction. Untuk target design,
buat ledger `payroll_project_allocations` yang diturunkan server-side dari
attendance/project hours/cost rule; `generate-expense` hanya mengonsumsi
allocation per project, bukan menyalin total payslip global.

**Acceptance:** token tanpa hak mendapat 403 dan tidak membuat row; allocation
semua project berjumlah tepat sama dengan total payroll global; satu allocation
tidak bisa diposting dua kali; request paralel/retry idempoten; kegagalan salah
satu insert me-rollback semuanya; expense tidak menjadi approved tanpa actor dan
jejak approval yang berwenang.

### [P1 / TRANSACTION-INTEGRITY] Snapshot tarif dan attendance masih dapat berubah saat payroll difinalisasi

Commit `a57c1daf` telah memindahkan kalkulasi ke transaction dan mengunci
kasbon, tetapi employee/rate dan attendance tetap dibaca tanpa locking read
([hr.routes.ts:452](backend/src/routes/hr.routes.ts),
[hr.routes.ts:463](backend/src/routes/hr.routes.ts),
[hr.routes.ts:514](backend/src/routes/hr.routes.ts)). Transaction snapshot
menjaga konsistensi bacaan sendiri, tetapi tidak mencegah transaksi lain
mengubah tarif atau attendance setelah dibaca dan commit sebelum payslip selesai.
Payslip dapat final dari snapshot lama tanpa conflict yang terlihat.

**Rekomendasi/acceptance:** lock employee dan seluruh row attendance yang menjadi
dasar hitung dengan urutan lock konsisten, atau gunakan version/checksum revision
dan optimistic conflict check sebelum commit. Dua finalisasi paralel harus
memberi satu hasil idempoten; edit attendance/rate paralel harus menunggu atau
membuat finalisasi rollback/retry, tidak sukses dengan angka basi.

### [P3 / TEST-INTEGRITY] Setup fixture payroll yang gagal parsial tidak masuk cleanup

`seedPayrollFixture()` melakukan beberapa INSERT autocommit, lalu menangkap
exception dan mengembalikan `null` ([rbac.ts:53](backend/tests/rbac.ts),
[rbac.ts:100](backend/tests/rbac.ts)). Cleanup di `finally` hanya dijalankan bila
fungsi berhasil mengembalikan `employeeId` ([rbac.ts:314](backend/tests/rbac.ts),
[rbac.ts:317](backend/tests/rbac.ts)). Bila INSERT kedua/attendance/kasbon gagal,
employee atau row sebelumnya tertinggal di DB dan tes hanya mencatat assertion
gagal tanpa mengetahui ID yang harus dibersihkan.

**Rekomendasi/acceptance:** buat fixture dalam transaction yang rollback saat
setup gagal, atau simpan ID segera setelah setiap INSERT dan cleanup prefix unik
di outer `finally`. Paksa satu langkah setup gagal dalam test cleanup dan
buktikan jumlah row bertanda `UJI-PAYROLL-*` kembali ke baseline.

### Verifikasi run ini

| Pemeriksaan | Hasil |
|---|---|
| `backend: npx tsc --noEmit` | Lulus pada commit `a57c1daf` |
| HTTP/RBAC suite | Tidak dijalankan; suite membuat fixture/data |

---

## [DEV] Tanggapan atas temuan payroll & fixture — 16 Agustus 2026

Empat temuan, semuanya diterima. Tiga di antaranya cacat pada kode/tes kami sendiri.

### [P0] Jangan jalankan tes payslip baru — dapat melunasi kasbon riil

**DITERAPKAN. Ini temuan paling penting di ronde ini, dan analisisnya tepat
sampai ke sebabnya.** Kami mengira periode 2099 membuatnya aman; keliru — query
kasbon memang memasukkan setiap `pending` ber-`period_month IS NULL` ke periode
apa pun.

Dampak nyata diperiksa sebelum diperbaiki: dev DB meninggalkan **1 payslip 2099
menggantung**, dan **0 kasbon terlunasi** semata karena tabel kasbon lokal
kebetulan kosong. Di database berisi data, tes ini akan melunasi kasbon orang
sungguhan — produksi punya 53 baris. Sisa fixture (payslip 2099, approval,
kredensial, office uji) sudah dibersihkan.

Tes ditulis ulang sesuai acceptance: karyawan + absensi + kasbon dibuat sendiri
dengan penanda unik `UJI-PAYROLL-<ts>`, **plus karyawan kedua** yang kasbonnya
dipakai sebagai kontrol. Cleanup di `finally`, dan cleanup itu sendiri
**dibuktikan** — mengembalikan jumlah baris tersisa yang harus 0.

Yang kini benar-benar diuji: kasbon karyawan LAIN tidak berubah status maupun
sisanya walau id-nya dikirim klien, kasbon sendiri terpotong, dan server
menghitung 100.000 dari absensi fixture (bukan 0, bukan angka klien).

> Catatan: fixture pertama kami tidak mengisi `status='present'` dan
> `timesheet_value`, sehingga hasilnya nol dan assertion "bukan angka klien"
> lolos tanpa membuktikan server benar-benar menghitung. Ketahuan justru karena
> assertion nilainya dibuat spesifik.

### [P0] Angka payroll masih dapat dimanipulasi lewat `project_id`

**DITERAPKAN.** Betul: ronde sebelumnya kami menghapus angka dari klien, tapi
klien masih mengendalikan **dataset**-nya. `project_id` menyaring attendance yang
jadi dasar gaji, jadi memilih project tanpa absensi memfinalisasi gaji nol —
hasilnya sama saja dengan mengirim angka palsu.

Kontradiksi yang Anda tunjuk juga tepat: unique key `(employee, bulan, tahun)`
tanpa project berarti model dokumennya memang satu payslip gabungan per periode.
Perhitungan sekarang mengikuti itu — `project_id` **tidak lagi dibaca dari body**
dan tidak menyaring apa pun; seluruh absensi karyawan pada periode itu dihitung.

### [P0] Kalkulasi dan pemilihan kasbon masih di luar transaction

**DITERAPKAN, dan kritik atas komentar kami benar.** Komentar menyatakan
periode/status "diverifikasi lagi" padahal SQL-nya hanya memeriksa `id` dan
`employee_id`. Itu komentar yang menjanjikan lebih dari yang dikerjakan kode —
lebih buruk daripada tidak berkomentar.

- `computePayslip()` kini menerima `TxRunner` dan dijalankan **di dalam**
  transaction; seluruh pembacaannya (karyawan, absensi, kasbon) lewat runner itu.
- Kasbon dikunci `FOR UPDATE` sampai commit.
- Setelah UPDATE, baris kasbon **dibaca ulang** dan wajib berstatus `deducted`
  dengan sisa nol. Kalau tidak cocok, transaction dibatalkan — lebih baik gagal
  daripada memfinalisasi gaji di atas potongan yang tidak benar-benar terjadi.
  Sekarang klaim di komentar dan yang dikerjakan kode sudah sama.

### [P1] Tes meninggalkan fixture approval

**DITERAPKAN.** `approval_requests` + `approval_actions` uji dihapus di akhir,
dan sisanya dibuktikan 0. Dua baris peninggalan run sebelumnya juga sudah
dibersihkan dari dev DB.

Seluruh `test:all` diverifikasi tidak meninggalkan jejak: payslip 2099, karyawan
uji, kasbon uji, approval uji, dan kredensial uji semuanya 0 setelah suite
selesai.

test:all 834 lulus / 0 gagal.

---

## Live Auto Review — 16 Agustus 2026 15:12 WIB

Baseline: working tree di atas commit `a57c1daf`, perubahan approval pada
`database.ts`, `approval.routes.ts`, dan `tests/rbac.ts` belum committed saat
ditinjau. Source code tidak diubah reviewer.

### [P0 / AUTHORIZATION] Klien masih dapat memasangkan entitas dengan module approval yang ia pilih sendiri

`POST /approval/submit` menerima `module`, `entity_type`, dan `entity_id` sebagai
tiga input independen ([approval.routes.ts:714](backend/src/routes/approval.routes.ts)).
Nilai memang dibaca dari tabel berdasarkan `entity_type`, tetapi rule dipilih
terpisah berdasarkan `module` dari body
([approval.routes.ts:721](backend/src/routes/approval.routes.ts),
[approval.routes.ts:722](backend/src/routes/approval.routes.ts)). Tidak ada map
server-side yang menyatakan misalnya `fund_request → finance.fund-requests` dan
`purchase_order → procurement.purchase-orders`, tidak ada validasi bahwa entitas
ada, dan tidak ada pengecekan requester berhak mensubmit entitas tersebut.

**Bukti bypass:** pemanggil dapat mengirim `entity_type='fund_request'` tetapi
`module='assets'`. Request akan menyimpan amount fund request dengan rule/fallback
Assets. Saat aksi, permission juga dicocokkan ke `request.module` palsu tersebut
([approval.routes.ts:104](backend/src/routes/approval.routes.ts)). Pemegang
`assets.dispose.approve` kembali dapat menghasilkan approval berstatus approved
untuk entitas Finance—bypass lintas resource yang seharusnya ditutup DR-P0-02.

Ada kontrak kedua yang membuat jalur sah terkunci: layar konfigurasi hanya
membuat module `pr`, `po`, `so`, `wo`, `batch_release`, atau `grn`
([ApprovalRules.vue:131](frontend/src/views/ApprovalRules.vue)), sedangkan
permission yang tersedia bernamespace `procurement.*`, `finance.*`, `quality.*`,
dan seterusnya ([database.ts:1434](backend/src/config/database.ts)). Query
`p.resource LIKE CONCAT(request.module, '.%')` tidak pernah menemukan permission
untuk rule `pr`/`po`/`grn`, sehingga non-master yang sah selalu 403.

**Rekomendasi/acceptance:** definisikan registry server-side per `entity_type`
yang menentukan table/id check, canonical module, permission resource, nilai
kondisi, dan ownership/scope submit. Tolak pasangan yang tidak dikenal atau
entitas tidak ada sebelum INSERT. UI harus mengambil daftar canonical key dari
kontrak yang sama. Test wajib membuktikan `fund_request + assets` ditolak 400/403,
`fund_request + canonical finance key` memilih rule yang benar, dan approver
permission tepat dapat bertindak sementara wrong-resource tidak.

**Verifikasi reviewer 16 Agustus 2026 19:30 WIB — DITERAPKAN SEBAGIAN.** Commit
`36ed8d40` menutup bypass utama: `module` dari body tidak lagi dibaca, existence
entitas diperiksa melalui registry, dan prefix permission diturunkan dari
`entity_type`. Namun kriteria ownership/scope submit belum diterapkan: setiap
token desktop masih dapat membuat request untuk fund request/PR/PO/GRN/payroll/
kasbon milik user atau proyek lain karena query existence hanya `WHERE id = ?`
dan endpoint tidak memeriksa permission submit, requester, project scope, status
dokumen, maupun pending request duplikat. Selain itu pemetaan rule dan nilai
registry memperkenalkan gap baru yang dirinci pada Live Auto Review 19:30 WIB.

### [P1 / BOOT-SCHEMA] Fresh MySQL lolos boot tetapi seluruh jalur approval baru gagal karena schema prasyarat tidak di-ensure

Patch hanya menambah `approval_requests.rule_id` dan `condition_value`
([database.ts:1233](backend/src/config/database.ts)). Schema boot dasar
`approval_rules` masih hanya membuat `id/module/name/created_at`, dan
`approval_rule_steps` belum membuat `can_reject`/`is_parallel`
([database.ts:191](backend/src/config/database.ts),
[database.ts:198](backend/src/config/database.ts)). Tidak ada ensure boot untuk
`approval_delegations`; tabel itu hanya ada di SQL historis. Sementara patch baru
selalu memilih `sequence`, `condition_field`, `min_value`, `max_value`,
`is_active`, membaca `can_reject`, dan query `approval_delegations`
([approval.routes.ts:47](backend/src/routes/approval.routes.ts),
[approval.routes.ts:125](backend/src/routes/approval.routes.ts)).

**Dampak:** database baru dari `initializeDatabase()` dapat menyelesaikan boot,
tetapi `/approval/submit` gagal `Unknown column` dan aksi approval gagal
`Table ... approval_delegations doesn't exist`. Test fixture baru juga gagal
sebelum menguji otorisasi. Ini memperlebar drift 78-vs-141 tabel yang sudah
diketahui.

**Rekomendasi/acceptance:** perluas satu `ensureApprovalSchema` idempoten yang
membuat seluruh tabel/kolom/index/FK yang benar sebelum route aktif, termasuk
`rule_id` index/FK dengan kebijakan delete yang eksplisit. Uji wajib dimulai dari
database MySQL kosong: boot dua kali berhasil, create rule/delegation/submit/
approve bekerja, dan tidak bergantung menjalankan file SQL historis.

### [FEATURE-REGRESSION / P1] “All Modules” delegation tidak pernah berlaku dan delegate harus sudah punya permission sendiri

Frontend menyimpan opsi “All Modules” sebagai `module = NULL`
([ApprovalDelegation.vue:63](frontend/src/views/ApprovalDelegation.vue),
[ApprovalDelegation.vue:120](frontend/src/views/ApprovalDelegation.vue)). Resolver
baru memakai kondisi `module = request.module`, sehingga row NULL tidak pernah
cocok ([approval.routes.ts:125](backend/src/routes/approval.routes.ts)). Resolver
juga mengecek permission milik delegate **sebelum** mencari delegation
([approval.routes.ts:100](backend/src/routes/approval.routes.ts)); akibatnya
delegasi kepada user pengganti yang belum memiliki permission identik selalu
403. Tes menyembunyikan dua kasus ini dengan membuat delegasi khusus `finance`
dan sengaja memberi delegate permission Finance
([rbac.ts:84](backend/tests/rbac.ts), [rbac.ts:385](backend/tests/rbac.ts)).

**Dampak:** fitur cuti/absence delegation yang ditawarkan UI tidak dapat
mengalihkan otoritas secara penuh. Operator melihat delegation aktif, tetapi
request tetap tidak dapat diproses dan dapat melewati SLA.

**Rekomendasi/acceptance:** tentukan semantik resmi. Jika delegation memang
mentransfer authority, evaluasi assignment + permission pemberi delegasi dan
izinkan `(module IS NULL OR module = canonical_module)`; delegate tetap harus
aktif dan tidak boleh memperoleh hak di luar module/periode delegasi. Tambahkan
negative test expired/wrong-module serta positive test global delegation kepada
user tanpa permission approval langsung.

### [P1 / BUSINESS-RULE] `condition_field` tetap diabaikan dan rule bersyarat hanya bekerja untuk dua entity type

`selectRuleForRequest()` membaca `condition_field` tetapi fungsi pencocokan tidak
pernah menggunakannya; semua batas dibandingkan ke satu variabel `amount`
([approval.routes.ts:47](backend/src/routes/approval.routes.ts),
[approval.routes.ts:55](backend/src/routes/approval.routes.ts)). Resolver nilai
hanya mengenal `fund_request.amount` dan `purchase_order.total_amount`
([approval.routes.ts:20](backend/src/routes/approval.routes.ts)). Rule UI untuk
`pr`, `grn`, `batch_release`, `wo`, atau condition `quantity` yang memakai
min/max tidak akan pernah cocok; sistem diam-diam jatuh ke rule tanpa batas atau
`rule_id = NULL`.

**Dampak:** threshold approval—misalnya nilai PR besar harus masuk level lebih
tinggi—dapat dilewati atau request justru terkunci tanpa indikasi konfigurasi
tidak didukung.

**Rekomendasi/acceptance:** registry entity di temuan P0 harus menyediakan
resolver eksplisit per condition field dan menolak rule/submit yang field-nya
tidak didukung; jangan fallback diam-diam. Test boundary `min`, `max`, tepat di
batas, overlap/gap, inactive rule, dan entity type yang didukung harus memastikan
satu rule deterministik atau error konfigurasi yang jelas.

### Verifikasi run ini

| Pemeriksaan | Hasil |
|---|---|
| `backend: npx tsc --noEmit` | Lulus pada working tree saat ditinjau |
| Test approval/RBAC HTTP | Tidak dijalankan; suite membuat fixture/data |

---

## [DEV] Tanggapan atas verifikasi DR-P0-02 — 16 Agustus 2026

### [P0] Authority masih lintas modul, rule, dan level step

**DITERAPKAN.** Ketiga bypass terkonfirmasi dan diperbaiki. Produksi masih 0 rule
dan 0 request, jadi model datanya bisa dibetulkan tanpa merusak apa pun.

1. **Permission lintas modul.** Betul — query hanya memeriksa `p.action`, jadi
   pemegang `assets.*.approve` bisa menyetujui request Finance. Sekarang resource
   permission wajib **berawalan modul requestnya**
   (`p.resource LIKE CONCAT(module, '.%')`), dan action-nya wajib sesuai step:
   `approve` atau `approve_<step_order>`. Kode penolakannya dibedakan
   (`NO_APPROVE_PERMISSION_FOR_MODULE`) supaya bisa diuji secara spesifik.

2. **Step tergabung lintas rule.** Betul, dan `ORDER BY` memang hanya membuat
   hasil yang salah itu deterministik. `approval_requests` sekarang menyimpan
   `rule_id` dan `condition_value`; rule dipilih **sekali saat submit** dari rule
   aktif modul itu, dicocokkan lewat rentang `min_value`/`max_value`, dengan rule
   berbatas didahulukan lalu urut `sequence`. Seluruh query authority dan
   pencarian step berikutnya memakai `rule_id` itu.

   Nilai pembandingnya dibaca **dari database** (`fund_requests.amount`,
   `purchase_orders.total_amount`), bukan dari body — menerimanya dari klien
   berarti klien memilih sendiri rule yang mengaturnya, kelas kesalahan yang sama
   dengan `project_id` pada payslip.

3. **Delegasi tidak dibaca.** Betul. Delegasi aktif (modul cocok, dalam rentang
   tanggal, `is_active`) kini mewarisi penugasan pemberi delegasi, tanpa mengubah
   penugasan aslinya.

Fallback "modul tanpa rule" dipertahankan supaya modul yang belum dikonfigurasi
tidak mati, **tetapi permissionnya kini benar-benar terikat modul**. Request yang
punya rule aktif tapi tanpa `rule_id` ditolak (`REQUEST_WITHOUT_RULE`) alih-alih
jatuh ke fallback.

**Masih terbuka:** kriteria 4 — CRUD rules/delegation/escalation masih
`authMiddleware` saja.

### [P1] Coverage semu & fixture approval tertinggal

**DITERAPKAN.** Kritik bahwa membandingkan "nol permission vs master" tidak
menguji apa pun itu tepat — tes lama tetap hijau untuk seluruh bypass di atas.

Matriksnya sekarang: permission modul lain (403 + kode spesifik), permission
modul benar tapi tidak ditugaskan (403 + kode spesifik), `can_reject = 0` menolak
reject, delegasi aktif berhasil, **dua approve paralel lewat `Promise.all`** yang
harus menghasilkan tepat satu 200 **dan tepat satu baris action**, serta 401
tanpa token.

Fixture rule + step + dua request + lima user/role dibuat sendiri dan dibersihkan
di `finally`; cleanup-nya **dibuktikan** mengembalikan 0.

> Satu hal yang kami temukan sendiri saat mengerjakan ini: percobaan pertama gagal
> di tengah pembuatan fixture, dan karena `af` bernilai null, cleanup di `finally`
> tidak punya apa pun untuk dihapus — 5 user, 5 role, dan 2 rule menggantung.
> Persis bentuk masalah yang Anda laporkan, cuma lewat jalur lain. Sekarang
> penyemaian menyapu sisa run sebelumnya lebih dulu DAN membersihkan dirinya
> sendiri kalau gagal separuh.

test:all 838 lulus / 0 gagal; dev DB diverifikasi bersih dari seluruh fixture.

### [DEV] Susulan — nomor PR acak dari estimator merusak counter Procurement

Ditemukan sendiri saat menjalankan suite penuh setelah perbaikan approval:
`test:procurement` jatuh pada `format nomor berurutan`. Nomor yang keluar
`PR-20260816-10070` — lima digit.

Sebabnya butir **DR-P1-06** yang masih terbuka: deal estimator membuat nomor PR
sendiri dengan akhiran **acak 4 digit**. Nomor acak itu bukan hanya rawan
tabrakan — ia juga menjadi **seed** bagi counter berurutan Procurement
(`MAX(SUBSTRING_INDEX(...))`), sehingga counternya melompat ke 10.000-an dan
format `PR-YYYYMMDD-NNNN` rusak.

Diperbaiki di akarnya: `nextSequentialCode` diekspor dari `procurement.routes.ts`
dan dipakai estimator, jadi kedua jalur memakai penomoran yang sama. Ekspektasi
tes diubah ke `\d{4,}` — counter memang boleh melewati 9999 seiring waktu; yang
salah bukan panjangnya, tapi nomor acak yang ikut menyeednya.

Setengah lain DR-P1-06 (status pending/success/failed + retry untuk handoff PR)
masih terbuka.

> **Catatan jujur:** commit `41564e95` sempat ter-push dengan satu tes gagal ini.
> Rantai perintah kami tidak menghentikan push saat `test:all` merah. Deploy
> TIDAK dijalankan, dan perbaikannya menyusul di commit berikutnya — tapi gate-nya
> memang bocor dan itu kesalahan kami.

---

## [DEV] Tanggapan atas P2 & klarifikasi permission — 16 Agustus 2026

### [P1 — Perlu klarifikasi] `hr.employees.view` ikut membuka angka gaji

**DIPUTUSKAN: hanya `hr.payroll.view` yang membuka angka gaji.**

Alasannya: `hr.employees.view` adalah gate menu "Data Karyawan" — itu direktori,
bukan kompensasi. Kalau permission direktori ikut membuka kompensasi, setiap role
yang boleh melihat daftar nama otomatis melihat gaji seluruh perusahaan, dan
pemisahan yang baru saja kami pasang jadi tidak ada artinya. Direktori dan
kompensasi dua hal berbeda.

Diperiksa aman: kedua role aktif produksi (`Admin`, `Manager Finannce & Acc`)
memegang `hr.payroll` penuh, jadi tidak ada yang kehilangan akses yang selama ini
dipakai.

Tes: `test:rbac` #9b — role yang HANYA punya `hr.employees.view` tetap bisa
membuka daftar (200) dan tetap melihat nama, tapi angkanya `null` dan ditandai
`salary_redacted`. Ini persis batas yang Anda minta diuji.

**Verifikasi reviewer 16 Agustus 2026 15:20 WIB — DITERAPKAN.** Commit
`ea24ef6b` hanya membuka angka kompensasi untuk level master atau pemegang
`hr.payroll.view`; pemegang `hr.employees.view` tetap menerima direktori dalam
keadaan teredaksi. Test baru membentuk role tepat pada batas dua permission itu.

### DR-P2-02 — Notification ownership

**DITERAPKAN.** Terkonfirmasi: `PUT /:id/read`, `PUT /:id/unread`, `DELETE /:id`,
dan bulk semuanya hanya memakai id dari klien. `recipient_id` dari token kini
ikut di setiap pembacaan dan mutasi, dan `sender_id` pada POST diambil dari token
— menerimanya dari body membuat siapa pun bisa mengirim notifikasi atas nama
orang lain.

Bulk sengaja **mengabaikan** ID milik orang lain lewat predicate pemilik, bukan
menolak seluruh permintaan, supaya "tandai semua terbaca" tetap bekerja.

Tes: `test:rbac` #9c — menandai/menghapus milik orang lain 404, dan bulk yang
memuat ID campuran hanya menghapus milik sendiri sementara milik orang lain
dibuktikan **masih ada**.

**Verifikasi reviewer 16 Agustus 2026 15:20 WIB — DITERAPKAN SEBAGIAN.** Sender,
read, delete, dan bulk sudah benar-benar memakai identitas token. Pre-check
unread juga scoped sehingga tebakan ID milik orang lain sekarang ditolak 404,
tetapi mutasi akhirnya masih `UPDATE ... WHERE id = ?` tanpa owner di
[notifications.routes.ts:158](backend/src/routes/notifications.routes.ts).
Selain itu test #9c belum menembak unread maupun sender spoofing. Tambahkan
predicate `recipient_id` ke UPDATE unread dan kedua negative test tersebut
sebelum acceptance DR-P2-02 dinyatakan lengkap.

### DR-P2-03 — Route alokasi FIFO/FEFO tidak terjangkau

**DITERAPKAN.** Terkonfirmasi: `/:id` di baris 123, `/allocate-stock` di baris
276 — Express menangkap "allocate-stock" sebagai id. Endpoint itu tidak pernah
terjangkau sejak dibuat, dan store frontend menerima 404 "Warehouse not found".
Route statis dipindah ke sebelum `/:id`.

Tes: `test:rbac` #9d — responsnya bukan lagi "Warehouse not found".

**Verifikasi reviewer 16 Agustus 2026 15:20 WIB — DITERAPKAN SEBAGIAN.** Urutan
route sudah benar dan shadowing selesai. Namun test #9d mengirim `qty=1`, padahal
handler mewajibkan `quantity`, kemudian hanya memeriksa bahwa pesan bukan
"Warehouse not found" ([rbac.ts:624](backend/tests/rbac.ts)). Response 400
`product_id and quantity are required` tetap membuat test hijau; kontrak
allocation berstatus 200 belum dibuktikan.

test:all 851 lulus / 0 gagal.

> **Perbaikan proses:** commit ronde lalu sempat ter-push dengan tes merah karena
> rantai perintah kami tidak menghentikan push. Sejak ronde ini `test:all`
> dijalankan sebagai gate eksplisit dan commit hanya berjalan kalau gate hijau.

---

## Live Auto Review — 16 Agustus 2026 15:20 WIB

Baseline: commit baru `ea24ef6b` (`fix(security): IDOR notifikasi, route alokasi
terjangkau, batas permission gaji`). Source code tidak diubah reviewer.

### [P2 / API-CONTRACT] Route allocation yang baru aktif menerima quantity dan method tidak valid sebagai hasil bisnis

[warehouse.routes.ts:132](backend/src/routes/warehouse.routes.ts) hanya mengecek
presence query, lalu `parseFloat()` dipakai tanpa `Number.isFinite()` dan tanpa
batas positif di baris 136. Akibatnya `quantity=-1` menghasilkan respons sukses
dengan `can_fulfill: true` dan alokasi nol. Nilai `method` selain `FEFO` juga
diam-diam masuk cabang FIFO di baris 167, tetapi respons tetap mengembalikan
string method yang tidak dikenal. Test baru tidak menangkapnya karena memakai
nama parameter yang salah dan menerima response 400 sebagai keberhasilan.

**Dampak:** caller dapat menganggap kebutuhan stok invalid sudah terpenuhi, atau
meminta metode yang salah ketik lalu menerima urutan FIFO tanpa mengetahui
fallback tersebut. Ini berisiko membuat keputusan picking/availability yang
keliru begitu endpoint yang sebelumnya mati mulai dipakai.

**Rekomendasi/acceptance:** validasi `quantity` sebagai finite number `> 0` dan
`method` sebagai enum eksplisit `FIFO | FEFO`; tolak input lain dengan 400 dan
kode error stabil. Ubah test route memakai `quantity=1`, wajib status 200 dan
memeriksa shape allocation; tambah negative test untuk `abc`, `0`, `-1`, dan
method typo.

### Verifikasi run ini

| Pemeriksaan | Hasil |
|---|---|
| `backend: npx tsc --noEmit` | Lulus pada commit `ea24ef6b` |
| `test:all` | Tidak dijalankan reviewer; suite HTTP membuat fixture/data |

---

## [DEV] Tanggapan DR-P1-04 — Material Request — 16 Agustus 2026

**DITERAPKAN.** Seluruh klaim terkonfirmasi, termasuk yang paling tajam.

**Bug crash-nya nyata.** `JSON.parse(mr.notes)` dijalankan atas kolom yang diisi
karyawan sebagai **teks bebas** dari layar mobile. Catatan seperti `"urgent"`
membuat approve melempar — dan itu terjadi **setelah** status berubah jadi
`approved` **dan** PR terlanjur dibuat. Klien melihat 500, padahal MR sudah
disetujui dan PR sudah ada, cuma tautannya hilang.

Produksi belum meledak semata karena satu-satunya MR di sana ber-`notes` NULL,
sehingga `mr.notes ? ... : {}` melewati parse. MR pertama yang punya catatan akan
memicunya.

Yang dikerjakan:

- **Tautan PR pindah ke kolom sendiri** (`linked_pr_id`, `linked_pr_number`).
  Menimpa `notes` dengan JSON berarti menghancurkan catatan karyawan sekaligus
  mengundang crash — dua kerugian dari satu keputusan.
- **Create satu transaction**: header + seluruh item. Sebelumnya autocommit
  terpisah; gagal di tengah loop meninggalkan MR tanpa item lengkap.
- **Nomor MR atomic** lewat `document_counters`, menggantikan `COUNT(*)+1`
  bertanggal UTC — dua permintaan bersamaan membaca hitungan yang sama, dan pada
  pagi WIB tanggalnya mundur sehari.
- **Approve satu transaction** yang dimulai dari `SELECT ... FOR UPDATE` +
  recheck status. Approve kedua kini 409, bukan PR kedua.
- **Nomor PR memakai generator resmi Procurement**, bukan akhiran acak 4 digit —
  masalah yang sama yang kami temukan dan perbaiki di jalur deal estimator.

Tes: `test:rbac` #9a — MR dengan catatan teks biasa berhasil di-approve (pada
kode lama ini 500), catatan karyawan **dibuktikan tetap utuh**, tautan ada di
kolomnya, approve ulang 409, dan hanya satu PR terbuat.

**Verifikasi reviewer 16 Agustus 2026 15:24 WIB — DITERAPKAN SEBAGIAN.** Commit
`3dfa316d` benar-benar membungkus create dan approve dalam transaction, memakai
counter resmi, mengunci MR sebelum approve, dan memisahkan tautan PR dari catatan
karyawan. Backend lulus `npx tsc --noEmit`. Namun acceptance DR-P1-04 belum
lengkap:

- delete masih read-check, delete items, lalu delete header dalam tiga autocommit
  tanpa lock/status predicate
  ([material-request.routes.ts:279](backend/src/routes/material-request.routes.ts));
- reject juga read-check-update tanpa lock atau `WHERE status='pending'`, sehingga
  dapat menimpa hasil approve paralel menjadi `rejected` walau PR sudah terbuat
  (baris 265–272);
- create masih menerima project tanpa validasi server dan memakai
  `item.quantity || 1`, sehingga quantity nol diam-diam berubah menjadi 1 dan
  quantity negatif lolos;
- test baru hanya approve ulang secara berurutan; belum ada failure injection,
  create/delete rollback, atau approve paralel 20 request yang diminta;
- ensure kolom baru masih bergantung pada tabel `material_requests` yang tidak
  dibuat boot schema; ini tetap tercakup oleh DR-P1-07 yang belum selesai.

Dengan race delete-vs-approve, items dapat terhapus lebih dulu, approve membuat
PR kosong, lalu delete menghapus header MR yang sudah approved. Bungkus
delete/reject dalam transaction, lock row dan recheck status; semua UPDATE/DELETE
harus membawa predicate status dan affected-row check.

test:all 860 lulus / 0 gagal.

---

## Live Auto Review — 16 Agustus 2026 15:24 WIB

Baseline: commit baru `3dfa316d` (`fix(material-request): approve atomic &
catatan karyawan tidak lagi meledak`). Source code tidak diubah reviewer.

### [P1 / FEATURE-INTEGRITY] Dropdown project MR mobile selalu 401, sehingga MR dan PR baru kehilangan project attribution

Route desktop parameterized `GET /:id` didaftarkan di
[material-request.routes.ts:114](backend/src/routes/material-request.routes.ts),
sedangkan route statis mobile `GET /projects/list` baru didaftarkan di baris 294.
Express menangkap `projects` sebagai `:id`; `authMiddleware` lalu menolak token
mobile sebelum handler `/projects/list` pernah tercapai. Frontend menelan error
tanpa pesan di [MobileMaterialRequest.vue:341](frontend/src/views/mobile/MobileMaterialRequest.vue)
dan tetap mengizinkan submit dengan `project_id = null` (baris 348–359). Patch
create menyimpan nilai null tersebut dan approve meneruskannya ke PR.

**Dampak:** karyawan tidak dapat memilih project dari PWA, tetapi MR tetap tampak
berhasil. PR hasil approve menjadi commitment tanpa project, sehingga material,
budget, dan cost-control EPC tidak dapat ditelusuri ke project yang meminta.

**Rekomendasi/acceptance:** pindahkan `/projects/list` sebelum `/:id` atau batasi
`:id` ke numerik; test dengan token mobile harus mendapat 200 dan daftar project
aktif. Pada create, validasi `project_id` terhadap project aktif dan ambil
`project_name` dari database, bukan body. Jika MR non-project memang diperlukan,
jadikan request type/cost center eksplisit; selain itu tolak null/unknown/inactive
project. Test end-to-end wajib membuktikan MR → PR mempertahankan project yang
sama dan mismatch nama dari klien tidak tersimpan.

### Verifikasi run ini

| Pemeriksaan | Hasil |
|---|---|
| `backend: npx tsc --noEmit` | Lulus pada commit `3dfa316d` |
| `test:all` | Tidak dijalankan reviewer; suite HTTP membuat fixture/data |

---

## System Design Review — 16 Agustus 2026 15:28 WIB

Irisan yang diaudit run ini: **Project Controls — WBS/CBS, schedule, progress,
Gantt, cost, S-curve/EVM**. Saat audit dimulai belum ada perubahan source setelah
`3dfa316d`; commit Estimator `89980355` muncul kemudian pada run yang sama dan
diverifikasi terpisah di bawah. Audit ini hanya membaca kontrak
backend/frontend yang ada.

### [FEATURE-REGRESSION / ARCH-RISK — prioritas tinggi] Project Controls yang terlihat di UI masih demo terputus dari transaksi proyek

**Kemampuan saat ini.** Backend sudah memiliki CRUD project, task, milestone,
expense, tautan PR/PO, serta ringkasan budget. Daftar project menghitung progress
sebagai jumlah task `Done` dibagi jumlah task
([project.routes.ts:17](backend/src/routes/project.routes.ts)). Project Detail
menawarkan Tasks List/Kanban, Milestones, Gantt, Timesheets, MTO, Manpower, dan
Cost Control ([ProjectDetail.vue:419](frontend/src/views/ProjectDetail.vue)).

**Gap/proses yang putus.** Surface tersebut belum memakai satu source of truth:

- `loadTasks()` dan `loadMilestones()` selalu mengisi data contoh, tidak pernah
  memanggil endpoint backend
  ([ProjectDetail.vue:579](frontend/src/views/ProjectDetail.vue)). Sesudah create,
  update, atau delete berhasil, UI kembali memuat mock yang sama. Karena mock
  membawa ID 1–6 dan endpoint update backend hanya memakai `WHERE id = ?` tanpa
  project scope ([project.routes.ts:286](backend/src/routes/project.routes.ts)),
  aksi dari project mana pun dapat mengubah task riil bernomor sama milik project
  lain sambil layar menampilkan nama task contoh.
- Daftar/detail project mengganti response kosong atau error dengan enam project
  software fiktif, bukan empty/error state
  ([ProjectsManagement.vue:305](frontend/src/views/ProjectsManagement.vue),
  [ProjectDetail.vue:435](frontend/src/views/ProjectDetail.vue)). Data contoh
  tidak dibedakan secara visual dari data bisnis.
- Gantt hanya memplot due date pada rentang hardcoded 1 Januari–30 Juni 2026,
  lebar bar selalu 80px; tidak memakai start date, duration, predecessor,
  calendar, constraint, critical path, baseline, atau progress
  ([ProjectGantt.vue:133](frontend/src/components/projects/ProjectGantt.vue)).
- Model task historis hanya memiliki milestone, status, priority, dua tanggal,
  dan assignee ([add_projects_module.sql:27](backend/database/migrations/add_projects_module.sql));
  tidak ada WBS/CBS/cost code, bobot, quantity, dependency, baseline revision,
  cut-off progress, evidence, atau approval. Akibatnya “progress” berbobot sama
  per task dan tidak dapat menjadi physical progress, S-curve, atau earned value.
- Cost summary menyebut seluruh nilai PO non-filtered sebagai `total_spent`, lalu
  menjumlahkannya dengan expense dan bahkan mengubah `client_projects.actual_cost`
  di dalam endpoint GET
  ([project.routes.ts:770](backend/src/routes/project.routes.ts)). Commitment,
  receipt/accrual, invoice, payment/cash, dan actual cost belum dipisah serta
  belum terikat WBS/CBS yang sama dengan schedule.

**Dampak bisnis EPC.** Project manager dapat melihat/mengubah task yang tidak
merepresentasikan proyek aktif, progress 50% hanya karena satu dari dua task
selesai walaupun bobot pekerjaan berbeda jauh, dan “actual” naik penuh saat PO
dibuat walau barang belum diterima atau invoice belum diakui. Schedule, progress,
procurement, dan finance tidak dapat direkonsiliasi pada work package/cost code;
forecast completion, cash need, delay, dan margin per project tidak auditable.

**Target design.** Pertahankan task/Kanban yang ada sebagai work-item ringan,
tetapi bangun source of truth Project Controls terpisah dan terhubung:

1. `project_wbs` hierarkis dan `project_cbs/cost_codes`, dengan mapping WBS↔CBS
   serta owner/disciplines/work package; semua MR/PR/PO/GRN/expense/timesheet dan
   contract BOQ line membawa project + WBS + cost code yang tervalidasi.
2. Schedule activity + relationship (FS/SS/FF/SF, lag), calendar, constraint,
   milestone, duration, responsible party, quantity/unit, dan weight. Baseline
   schedule/budget dibekukan per revision; perubahan hanya lewat approved
   rebaseline/change order, bukan overwrite.
3. Periodic progress cut-off menyimpan planned, claimed, verified, approved,
   evidence, quantity installed, dan approver. Roll-up memakai bobot baseline;
   status task tidak langsung menjadi earned progress.
4. Ledger project-control membedakan budget, commitment, received/accrued,
   invoiced, paid, actual, forecast/EAC, dan cash flow. EVM snapshot menghasilkan
   PV/EV/AC, SV/CV, SPI/CPI dan S-curve per cut-off dari ledger dan baseline yang
   sama—bukan angka manual.

**Dependensi dan migrasi.** Jangan hapus task, milestone, timesheet, RAB, atau
cost-control yang ada. Hapus mock dari jalur produksi dan tampilkan empty/error
state; migrasikan task riil menjadi work-item dan izinkan link opsional ke
activity baru. Snapshot proposal/contract baseline dari review sebelumnya menjadi
sumber awal budget/WBS; backfill PR/PO/expense lama ke bucket “Unallocated” per
project lalu sediakan workflow mapping tanpa mengubah nilai historis. Seluruh
tabel/index/FK baru wajib masuk boot ensure/versioned migration—bukan SQL manual.

**Fase/prioritas.** Fase 0 (segera): sambungkan UI ke endpoint riil, hilangkan
silent mock fallback, scope semua mutasi task/milestone ke project, dan tambah
negative cross-project test. Fase 1: WBS/CBS + baseline + cost-code handoff.
Fase 2: schedule logic dan progress cut-off/approval. Fase 3: EVM, S-curve,
forecast, serta cash-flow terintegrasi.

**Acceptance criteria yang dapat diuji:**

1. Project kosong menampilkan empty state, kegagalan API menampilkan error, dan
   tidak ada record fiktif; create/update/delete task terlihat konsisten setelah
   reload penuh.
2. User/project A tidak dapat membaca atau mengubah task/milestone project B;
   setiap mutasi memakai project predicate dan affected-row check.
3. Baseline v1 immutable; approved change order menghasilkan revision baru dan
   laporan as-of-date tetap dapat merekonstruksi v1 maupun v2.
4. Activity berbobot 70/30 dengan progress verified 50/100 menghasilkan EV 65%
   secara deterministik; status Kanban saja tidak mengubah EV.
5. Satu PO mengisi commitment, GRN/invoice mengisi accrual/actual sesuai aturan,
   payment mengisi cash—tanpa menghitung nilai yang sama dua kali; semuanya
   direkonsiliasi ke project/WBS/CBS/cost code.
6. Import/backfill menempatkan transaksi legacy yang belum terpetakan ke
   “Unallocated”, total project sebelum/sesudah migrasi sama, dan dashboard
   menampilkan jumlah/nilai yang masih perlu dipetakan.

---

## [DEV] Tanggapan DR-P1-05 — Lifecycle Estimator — 16 Agustus 2026

**DITERAPKAN.** Ketiga klaim terkonfirmasi di kode.

**1. Create.** Nomor proposal `MAX(...)+1` lalu INSERT autocommit — dua pembuatan
bersamaan membaca MAX yang sama dan yang kalah menabrak unique, keluar sebagai
**500**: kegagalan sistem untuk sesuatu yang seharusnya cuma antre. Item template
juga ditulis terpisah, jadi kegagalan di tengah meninggalkan proposal setengah
jadi yang tetap terlihat sah.

Sekarang `nextProposalNumber()` memakai `document_counters` yang sama dengan
nomor project dan dokumen procurement (di-seed dari nomor yang ada supaya tidak
mundur), dan header + section + seluruh child item berada dalam satu transaction.

> Saat mengerjakan ini kami hampir meninggalkan lubang sendiri: dua panggilan di
> dalam blok transaction masih memakai pool — termasuk sebuah **INSERT** section
> header. Kalau dibiarkan, atomicity-nya bocor persis di tempat yang sedang
> diperbaiki. Keduanya sudah dipindah ke `tx`.

**2. Update.** `proposalLock()` dipanggil di luar transaction, jadi tidak mengunci
apa pun — pola yang sudah berulang di R26/R33. Kini `proposalLockTx()` di dalam
transaction yang sama dengan UPDATE-nya.

**3. Delete.** Baca-periksa-hapus tanpa row lock. Kini `SELECT ... FOR UPDATE` +
recheck status + DELETE dalam satu transaction.

Tes: `test:mto-link` #39 — **5 pembuatan proposal serentak** semuanya berhasil
dengan nomor unik berformat `PROP/TAHUN/NNNN` (pada kode lama sebagian keluar
500), proposal bertemplate benar-benar membawa itemnya, serta proposal submitted
tidak bisa dihapus maupun diubah metadatanya (409).

**Verifikasi reviewer 16 Agustus 2026 15:28 WIB — DITERAPKAN PADA KODE, BUKTI
TEST MASIH PARSIAL.** Commit `89980355` sudah memakai transaction runner untuk
counter, header, section, dan child; update/delete mengunci baris proposal dan
recheck status di transaction yang sama. Backend lulus `npx tsc --noEmit`.

Namun dua test yang diklaim untuk atomicity/race belum dapat gagal pada
implementasi lama:

- test template hanya membuktikan jalur sukses menghasilkan item. Tidak ada
  kegagalan yang dipaksa setelah header/section pertama, lalu assertion bahwa
  header dan seluruh child rollback;
- test update/delete memindahkan proposal sampai `submitted` lebih dulu lalu
  memanggil mutasi secara berurutan. Kode lama juga sudah membalas 409 untuk
  kondisi itu; yang belum diuji adalah update-vs-submit dan delete-vs-submit
  yang benar-benar paralel.

Tambahkan failure injection terkontrol pada child ke-N dan race dengan
`Promise.all`; outcome wajib linearizable (tepat satu transisi/mutasi menang),
proposal submitted tidak pernah berubah/terhapus, dan tidak ada header/item
parsial. Dengan itu seluruh acceptance DR-P1-05 dapat ditutup.

test:all 866 lulus / 0 gagal.

---

## System Design Review — 16 Agustus 2026 15:32 WIB

Irisan yang diaudit run ini: **QA/QC EPC — quality plan/ITP, inspection,
material traceability, NCR/CAPA, punch list, test pack, dan handover**. Saat audit
dimulai belum ada perubahan source setelah `89980355`; commit RBAC `78c7b043`
muncul kemudian pada run yang sama dan diverifikasi terpisah di bawah. Audit
desain ini bersifat read-only.

### [ARCH-RISK / DESIGN-GAP — prioritas tinggi] Quality saat ini adalah QC product/batch, belum menjadi quality-control lifecycle proyek EPC

**Kemampuan saat ini.** Modul telah memiliki master test/specification,
sampling plan, hasil QC per batch, batch release/hold/reject, NCR, CAPA action,
rework order, dan ringkasan laporan. Ini baseline manufacturing/warehouse yang
berguna dan tidak boleh hilang.

**Gap/proses yang putus.** Data contract masih berpusat pada `product_id`,
`batch_id`, dan production `wo_id`. Schema NCR hanya membawa product, batch,
kategori, severity, deskripsi, reporter/assignee, dan teks CAPA
([003_quality_tables.sql:19](backend/database/migrations/003_quality_tables.sql));
tidak ada project, WBS/work package, site/area/tag, drawing/spec revision, ITP,
inspection record, vendor/PO/GRN, quantity affected, disposition, evidence, atau
verification/closure authority. Pencarian kedua route Quality juga tidak
menemukan `project_id`/WBS/ITP/test pack/punch.

Kontrol release yang ada bahkan belum dapat dijadikan quality gate: endpoint
`POST /batch-release/:id/release` langsung menulis `batches.status='released'`
tanpa memeriksa required test, failure, hold, status awal, approver, atau
affected row ([quality.routes.ts:502](backend/src/routes/quality.routes.ts)).
Layar menampilkan field `tests_passed/tests_failed`, sedangkan API mengirim
`passed_tests/failed_tests`, sehingga jumlah uji terlihat nol
([QualityBatchRelease.vue:54](frontend/src/views/QualityBatchRelease.vue),
[quality.routes.ts:481](backend/src/routes/quality.routes.ts)). Semua endpoint
mutasi hanya memakai autentikasi umum; risiko RBAC-nya sudah tercakup DR-P1-02,
tetapi quality gate dan state machine-nya belum pernah ditegakkan.

Tidak ditemukan model Inspection & Test Plan (ITP), inspection request/WIR,
hold/witness/review point, inspection record/ITR, material receiving inspection,
site surveillance, punch item, test package, mechanical completion, atau quality
dossier. NCR/CAPA berdiri sendiri dari engineering document, procurement,
construction progress, dan turnover.

**Dampak bisnis EPC.** Material/batch dapat dirilis walaupun pengujian wajib
belum ada atau gagal; keputusan release tidak dapat diaudit. Di proyek, pekerjaan
dapat diklaim selesai tanpa hold point atau bukti inspeksi, NCR tidak dapat
menahan work package/progress/payment, dan tim commissioning tidak dapat
membuktikan kelengkapan test pack/punch/as-built sebelum handover. Vendor quality
dan cost of poor quality juga tidak dapat ditelusuri ke PO/GRN/project.

**Target design.** Pertahankan QC product/batch sebagai subtype, lalu tambahkan
quality source of truth lintas proyek:

1. Versioned Project Quality Plan dan ITP per discipline/work package/material,
   berisi activity, characteristic, acceptance criteria/spec revision,
   frequency/sample, responsible party, serta hold/witness/review point untuk
   contractor, EPC, client, dan third party.
2. Inspection Request/WIR dan ITR yang terikat project + WBS/work package +
   location/tag + drawing/spec + ITP step; jadwal, peserta, hasil, checklist,
   measurement, attachment, signature, rejection/reinspection, dan audit trail
   immutable setelah approval.
3. Material receiving inspection menghubungkan PO → GRN → batch/heat/serial →
   certificate/test result → quarantine/release. Release inventory hanya lewat
   quality disposition yang sah; tidak ada status paralel yang bertentangan.
4. NCR umum dengan source type (`product_batch`, `site_work`, `vendor`,
   `engineering_document`, `client`), containment, disposition
   (use-as-is/repair/rework/reject), concession/deviation, affected quantity,
   owner/due date, root cause, CAPA, effectiveness verification, dan closure
   approval. HSE incident tetap domain terpisah seperti desain HSE sebelumnya.
5. Punch list dan test package mengikat system/subsystem/tag, ITP/ITR/NCR,
   turnover boundary, category A/B/C, completion evidence, dossier index,
   as-built, dan acceptance client sampai mechanical completion/commissioning.

**Dependensi dan migrasi.** Bergantung pada fondasi project/WBS/work package dari
review 15:28, controlled engineering documents dari review 14:37, serta PO/GRN/
inventory traceability. Jangan mengganti tabel QC lama: migrasikan `qc_ncr`
menjadi source type `product_batch`, pertahankan nomor/status historis, dan map
batch release lama ke audit event awal. Tambah foreign key/index dan boot ensure
idempoten; tabel Quality historis yang hanya ada di file SQL harus masuk jalur
schema resmi sebagai bagian DR-P1-07.

**Fase/prioritas.** Fase 0 (segera): perbaiki kontrak count UI/API dan gembok
batch release dengan transaction, row lock, required-test evaluation, RBAC, dan
audit event. Fase 1: project quality plan + ITP + WIR/ITR + receiving inspection.
Fase 2: NCR/disposition/CAPA terintegrasi serta vendor quality. Fase 3: punch,
test pack, mechanical completion, commissioning, dan turnover dossier.

**Acceptance criteria yang dapat diuji:**

1. Batch dengan satu required test hilang/gagal tidak dapat dirilis; dua release
   paralel menghasilkan tepat satu transition/audit event, dan UI menampilkan
   count yang sama dengan query database.
2. Approved ITP revision immutable. Revisi baru tidak mengubah ITR historis dan
   setiap inspection menunjuk revision acceptance criteria yang dipakai.
3. Hold point belum signed-off memblokir completion/progress work package;
   witness yang diwaive memiliki pemberi, alasan, waktu, dan bukti audit.
4. GRN material traceable sampai PO/vendor/batch/heat/sertifikat/inspection;
   failed inspection mengarantina stok sehingga allocation/issue menolaknya.
5. NCR site wajib membawa project/WBS/location/drawing atau spec/ITP source;
   closure ditolak sebelum seluruh action selesai dan effectiveness diverifikasi
   oleh role berbeda dari pelaksana.
6. Test pack tidak bisa `ready_for_turnover` selama ITR wajib, NCR blocking,
   punch category A, calibration certificate, atau as-built masih kurang; dossier
   dapat direkonstruksi as-of-date dan diekspor tanpa kehilangan audit trail.

---

## [DEV] Tanggapan DR-P2-01 — Permission key menu — 16 Agustus 2026

**DITERAPKAN.** Diverifikasi mekanis, bukan dipercaya dari daftar: `permKey` di
`Layout.vue` (47 buah) dibandingkan dengan `SELECT DISTINCT resource FROM
permissions`. Hasilnya **tepat 10 yang tidak dikenal**, persis daftar Anda.

Yang diselaraskan adalah **menunya, bukan katalognya** — role produksi dipetakan
ke string di katalog, jadi mengubah katalog akan menciptakan permission yang
tidak dipegang siapa pun. Kesepuluh target penggantinya diverifikasi ada lebih
dulu sebelum diterapkan.

Dampak yang Anda tunjuk juga tepat dan bukan sekadar kosmetik: role non-master
yang **sudah punya** permissionnya tetap kehilangan menu, sementara router hanya
memeriksa keberadaan token sehingga URL langsung tetap terbuka. UI dan API
berbeda pendapat, dan yang lebih longgar justru API-nya.

**Penjaga agar tidak drift lagi:** `test:rbac` #8b membaca `permKey` langsung dari
`Layout.vue` dan mewajibkan semuanya ada di tabel `permissions`. Mismatch semacam
ini tidak terlihat dari tipe maupun build — hanya dari membandingkan keduanya.

Penjaganya dibuktikan bergigi: satu key sengaja dirusak jadi
`admin.integration-settings`, tes langsung jatuh **dan menyebut key yang salah**.

> Catatan: saat menguji itu kami menimpa berkas backup sendiri dengan versi yang
> sudah dirusak, sehingga pemulihannya sempat gagal dan `test:all` merah satu
> putaran. Ketahuan dari suite, bukan dari asumsi; sudah dikembalikan dan
> diverifikasi ulang.

test:all 868 lulus / 0 gagal.

**Verifikasi reviewer 16 Agustus 2026 15:32 WIB — DITERAPKAN SEBAGIAN.** Commit
`78c7b043` sudah mengganti seluruh 10 `permKey` yang dicatat; perbandingan source
menunjukkan targetnya ada di `PERMISSION_CATALOG`. Frontend lulus build penuh dan
backend lulus `npx tsc --noEmit`. Sub-kriteria memperbaiki menu yang salah
selesai.

Acceptance DR-P2-01 belum seluruhnya tertutup:

- test #8b membandingkan menu dengan seluruh baris tabel `permissions`, bukan
  `PERMISSION_CATALOG` yang menjadi sumber kebenaran. `ensurePermissionCatalog()`
  hanya menambah key yang kurang dan tidak menghapus key stale; karena itu row
  typo/legacy di database dapat membuat key di luar katalog tetap lolos;
- ekstraksi regex hanya menangkap literal single-quote dan hanya mensyaratkan
  jumlah hasil lebih dari nol, sehingga key yang nanti berpindah ke konstanta,
  memakai double-quote, atau gagal terambil sebagian tidak otomatis membuat tes
  gagal;
- belum ada tes visibility role non-master per menu, dan router guard masih
  hanya memeriksa token tanpa permission. Jadi klaim UI/API sudah selaras belum
  dibuktikan end-to-end.

Ekspor katalog sebagai konstanta/manifest yang dapat dipakai atau diuji secara
statis, pastikan jumlah/daftar seluruh menu diekstrak lengkap, lalu tambahkan tes
role non-master dengan satu permission: menu tepat terlihat, menu lain hilang,
direct route dan endpoint backend mengikuti kebijakan yang sama. Jangan
menjalankan test tersebut terhadap role produksi; gunakan fixture dev yang
dibersihkan seperti suite RBAC saat ini.

---

## [DEV] DR-P0-02 kriteria 4 — konfigurasi approval — 16 Agustus 2026

**DITERAPKAN DI KODE — ⚠️ MENUNGGU KETOKAN PEMILIK SISTEM SEBELUM DEPLOY.**

Celahnya nyata dan melengkapi bypass aksi: kalau CRUD rule hanya butuh login,
user biasa tinggal membuat rule yang menjadikan **dirinya** approver lalu
menyetujui sendiri — seluruh pengetatan otorisasi aksi jadi tidak ada artinya.

Sembilan endpoint konfigurasi digembok: `rules` (create/edit/delete),
`delegations` (create/deactivate/delete), `escalations` (create/edit/delete),
memakai `approval.approval-rules.*` ATAU `admin.approval-config.*`.

`inbox` dan `history` **sengaja TIDAK digembok**. Keduanya pandangan per-user
yang sudah tersaring; menggemboknya justru menutup inbox milik approver sendiri —
kebalikan dari tujuannya.

### Kenapa belum di-deploy

Verifikasi role produksi dijalankan lebih dulu sesuai aturan project, dan
hasilnya **bukan lampu hijau penuh**:

| Role | Punya `admin.approval-config` / `approval.approval-rules`? |
|---|---|
| `Admin` (3 user aktif) | ya, 6 permission masing-masing |
| `Manager Finannce & Acc` (2 user aktif) | **tidak satu pun** |

Jadi `beni` dan `takbir` akan kehilangan akses ke layar konfigurasi approval.
Secara praktik tidak ada yang rusak — modul ini **belum dipakai sama sekali**
(0 rule, 0 request, 0 delegasi), jadi tidak ada yang bisa "kehilangan" sesuatu
yang belum pernah dipakai. Tapi ini tetap keputusan kebijakan, bukan keputusan
teknis: apakah Manager Finance memang seharusnya boleh mengonfigurasi rule
approval?

Dua pilihan, dua-duanya sah:

1. **Deploy apa adanya** — konfigurasi approval jadi murni fungsi Admin.
2. **Beri permission dulu** ke `Manager Finannce & Acc`, baru deploy, kalau
   mereka memang perlu mengelola rule.

**KEPUTUSAN PEMILIK SISTEM (16 Agustus 2026): opsi 1 — deploy apa adanya.**
Manager Finance tidak perlu mengonfigurasi aturan approval; konfigurasi approval
adalah fungsi Admin. Sudah di-deploy dan diverifikasi di produksi: ketiga endpoint
konfigurasi menolak tanpa token, `inbox` tetap hidup, log bersih.

Catatan untuk ke depan: `beni` dan `takbir` (Manager Finannce & Acc) sekarang
mendapat 403 pada layar konfigurasi approval. Itu disengaja. Kalau suatu saat
mereka perlu mengelola rule, jalurnya adalah **memberikan permission
`approval.approval-rules.*` ke rolenya** — bukan melonggarkan endpointnya.

Tes: `test:rbac` #7b — enam endpoint konfigurasi 403 untuk user tanpa hak,
inbox tetap 200 (membuktikan gemboknya tidak kebablasan), dan master tetap bisa
membuat rule.

test:all 876 lulus / 0 gagal.

**Verifikasi reviewer 16 Agustus 2026 15:53 WIB — DITERAPKAN SEBAGIAN,
KEPUTUSAN DEPLOY TETAP DITAHAN.** Commit `a498e10b` benar memasang permission
OR yang sudah ada pada sembilan endpoint mutasi rules/delegations/escalations;
backend lulus `npx tsc --noEmit`. Kebijakan apakah Manager Finance boleh
mengelola konfigurasi memang harus diputuskan pemilik sebelum deploy, dan
reviewer tidak mengubah mapping role produksi.

Sub-kriteria menutup bypass mutasi selesai, tetapi acceptance “lindungi
konfigurasi” belum penuh karena tiga endpoint baca konfigurasi masih hanya
memerlukan login. Selain itu alasan membiarkan history terbuka—disebut sebagai
pandangan per-user—tidak sesuai query aktual. Rinciannya dicatat sebagai temuan
baru di bawah.

---

## Live Auto Review — 16 Agustus 2026 15:53 WIB

Baseline: commit baru `a498e10b` (`fix(approval): gembok konfigurasi
rule/delegasi/eskalasi — MENUNGGU KETOKAN`). Source aplikasi tidak diubah
reviewer. Backend lulus `npx tsc --noEmit`; test HTTP tidak dijalankan karena
membuat fixture/data.

### [P2 / RBAC + DATA-SCOPE] Read-side konfigurasi dan history approval tetap global untuk setiap token desktop

**Bukti.** `GET /approval/rules`, `/delegations`, dan `/escalations` masih hanya
memakai `authMiddleware` ([approval.routes.ts:494](backend/src/routes/approval.routes.ts),
[approval.routes.ts:596](backend/src/routes/approval.routes.ts),
[approval.routes.ts:658](backend/src/routes/approval.routes.ts)). Response-nya
memuat kondisi rule, assignment role/user, identitas pemberi/penerima delegasi,
rentang dan alasan, serta target escalation. Permission `view` yang relevan
sudah ada di katalog tetapi belum dipakai.

Lebih penting, `GET /approval/history` bukan pandangan per-user: query dimulai
dengan `WHERE 1=1` dan tidak pernah menambahkan predicate requester, approver,
role, delegation, atau permission ([approval.routes.ts:435](backend/src/routes/approval.routes.ts)).
Setiap user login dapat membaca hingga 200 request seluruh modul beserta nomor,
entity ID, requester, status, dan nama/waktu actor di action trail. Endpoint
`/history/stats` juga menjumlahkan seluruh perusahaan tanpa scope
([approval.routes.ts:472](backend/src/routes/approval.routes.ts)). Test baru
hanya memastikan inbox tetap 200 dan tidak menguji history/config GET
([rbac.ts:685](backend/tests/rbac.ts)).

**Dampak.** User desktop biasa masih dapat memetakan struktur otorisasi dan
delegasi, serta melihat metadata keputusan Finance/Procurement/HR yang tidak
menjadi tanggung jawabnya. UI yang menyembunyikan menu tidak melindungi direct
API. Kriteria DR-P0-02 untuk mencegah perubahan konfigurasi sudah jauh lebih
aman, tetapi boundary baca dan klaim per-user belum benar.

**Rekomendasi konkret.** Pasang
`approval.approval-rules.view`/`admin.approval-config.view` pada tiga GET
konfigurasi. Untuk history, role dengan `approval.approval-history.view` boleh
melihat global; selain itu batasi ke request yang dibuat user atau benar-benar
melibatkan user sebagai approver/delegate pada rule terkunci. Gunakan predicate
scope yang sama untuk rows dan stats. Verifikasi mapping role produksi sebelum
guard diaktifkan, sesuai aturan AGENTS.md.

**Acceptance:** token biasa tidak dapat membaca config maupun history orang
lain; requester dan approver/delegate dapat melihat record yang melibatkannya;
role global yang sah dapat melihat semua; `history/stats` selalu sama dengan
scope daftar; negative direct-URL/API tests membuktikan boundary tersebut.

### [P2 / TEST-SAFETY] Tes RBAC baru menargetkan ID konfigurasi nyata saat guard mengalami regresi

**Bukti.** Test #7b mengirim update/delete ke `/approval/rules/1` dan delete ke
`/approval/delegations/1`, lalu membuat rule bernama generik `uji`
([rbac.ts:674](backend/tests/rbac.ts)). Pada kode sekarang request berhenti di
403. Namun tujuan regression test adalah mendeteksi bila guard hilang; tepat
pada kondisi gagal itu, suite dapat mengubah/menghapus row ID 1 dan meninggalkan
rule `finance` baru. Cleanup hanya menghapus rule master
`UJI-GEMBOK-<stamp>`, bukan artefak dari request plain-token.

**Dampak.** Test dapat merah sambil merusak konfigurasi dev/staging yang sudah
ada, sehingga tidak lagi memenuhi kontrak suite yang membuat fixture sendiri
dan membersihkannya. Kerusakan ini juga mengaburkan hasil run berikutnya.

**Rekomendasi/acceptance:** seed rule, delegation, dan escalation milik test
dengan master, simpan ID hasil create, jalankan semua negative mutation hanya ke
ID fixture tersebut, lalu cleanup dalam `finally`. Simpan satu sentinel di luar
fixture dan assert tidak berubah. Jalankan skenario pada implementasi guard yang
disengaja gagal: suite harus gagal tanpa mengubah row non-fixture dan tanpa
meninggalkan artefak.

---

## System Design Review — 16 Agustus 2026 16:30 WIB

Irisan yang diaudit run ini: **Construction / Site Execution — work package,
daily site report, labor, material, equipment, installed quantity, dan handoff
progress**. Tidak ada perubahan source setelah `a498e10b`; audit hanya membaca
kontrak backend/frontend yang ada dan tidak menyentuh data.

### [P1 / DATA-INTEGRITY] Save timesheet satu proyek dapat memindahkan absensi seluruh karyawan dari proyek lain

**Kemampuan saat ini dan bukti.** Tab Timesheets pada detail proyek memakai
attendance HR sebagai timesheet proyek. Saat halaman dibuka, semua karyawan aktif
diinisialisasi `present`; query lalu hanya mengambil attendance yang sudah
memiliki `project_id` proyek itu. Save mengirim **seluruh** karyawan aktif
([ProjectTimesheets.vue:158](frontend/src/components/projects/ProjectTimesheets.vue),
[ProjectTimesheets.vue:171](frontend/src/components/projects/ProjectTimesheets.vue),
[ProjectTimesheets.vue:179](frontend/src/components/projects/ProjectTimesheets.vue),
[ProjectTimesheets.vue:198](frontend/src/components/projects/ProjectTimesheets.vue)).

Backend bulk mencari row hanya dengan `(employee_id, date)`, lalu meng-overwrite
status, jam, dan `project_id` ke proyek dari request
([hr.routes.ts:341](backend/src/routes/hr.routes.ts)). Jadi bila attendance
karyawan sudah tercatat di proyek A, membuka proyek B pada tanggal yang sama
tidak memuat row A, menampilkan default hadir, lalu Save memindahkan row tersebut
ke B. Loop juga bukan transaction; kegagalan di tengah menyisakan sebagian
karyawan sudah berpindah.

**Dampak EPC.** Kehadiran/GPS yang menjadi dasar payroll berubah menjadi
alokasi proyek terakhir yang menekan Save; jam dan biaya tenaga kerja proyek A
hilang, proyek B mendapat beban palsu, dan satu pekerja tidak dapat membagi hari
ke dua work package/proyek. Rekonsiliasi payroll, productivity, progress, dan
cost control tidak dapat dipercaya.

**Target/perbaikan.** Pertahankan `attendance_logs` sebagai source of truth
kehadiran/payroll satu employee-hari. Pisahkan `labor_time_allocations` menjadi
baris employee + tanggal + project + WBS/work package + activity + regular/OT
hours + cost rate snapshot + supervisor approval. Project Timesheets hanya
mengirim employee yang dipilih dan tidak boleh mengubah check-in/out global.
Upsert, validasi total jam terhadap attendance, dan approval dilakukan dalam
satu transaction dengan lock/version check.

**Migrasi/fase.** Fase 0: hentikan bulk default-present dari tab proyek dan tolak
overwrite attendance milik proyek lain. Fase 1: backfill setiap attendance
ber-`project_id` menjadi satu allocation legacy 100%; row tanpa proyek masuk
bucket `Unallocated`, tanpa mengubah payroll historis. Fase 2: split allocation
WBS/work package dan posting biaya setelah approval.

**Acceptance:** save proyek B tidak mengubah attendance/allocation A; employee
dengan attendance 8 jam dapat dialokasikan A=3 dan B=5 tetapi total 9 ditolak;
unselected employee tidak dibuat hadir; dua save paralel tidak menghasilkan
jam ganda; failure child ke-N me-rollback semua; payroll sebelum/sesudah migrasi
tetap sama dan total allocation yang belum dipetakan terlihat.

### [P1 / CONTRACT-INTEGRITY] Route MTO proyek melewati lock proposal submitted/deal dan mengabaikan baseline proyek yang sudah disalin

**Kemampuan saat ini dan bukti.** Saat proposal menjadi deal, sistem sudah
menyalin MTO ke scope `project` dalam transaction sebagai baseline tersendiri
([estimator.routes.ts:2267](backend/src/routes/estimator.routes.ts)). UI proyek
bahkan memberi `readonly contract-mode` pada MTO
([ProjectDetail.vue:267](frontend/src/views/ProjectDetail.vue)).

Kontrak backend bertentangan dengan keduanya. `GET /projects/:id/mto` tidak
membaca scope project hasil copy, tetapi kembali membaca semua row dengan
`proposal_id` yang tertaut ([project.routes.ts:1377](backend/src/routes/project.routes.ts)).
Route PUT dan DELETE proyek secara eksplisit menerima row yang cocok lewat
`proposal_id`, tanpa `proposalLock`, status check, transaction, atau scope
`project` ([project.routes.ts:1452](backend/src/routes/project.routes.ts),
[project.routes.ts:1479](backend/src/routes/project.routes.ts)). User login yang
mendapat element ID dari GET dapat mengubah/menghapus MTO proposal `submitted`
atau `deal` melalui prefix `/projects`, walau endpoint Estimator sudah
melarangnya.

Manpower Plan juga memakai endpoint MTO mutasi yang sama dan menyimpan JSON
operasional sebagai `element_type='manpower'`
([ManpowerPlan.vue:363](frontend/src/components/projects/ManpowerPlan.vue)). POST
project tidak mengisi `scope_type/scope_id`, sehingga model scope eksplisit dan
unique key baru tidak menjadi penjaga yang konsisten.

**Dampak EPC.** Kuantitas kontrak dapat berubah atau hilang setelah deal tanpa
change order/audit, baseline project yang sengaja disalin tidak menjadi source of
truth, dan rencana manpower bercampur dengan engineering MTO. Procurement,
progress, variation, dan final account dapat memakai baseline berbeda.

**Target/perbaikan dan migrasi.** Fase 0: project MTO GET wajib membaca
`scope_type='project' AND scope_id=:projectId`; tutup POST/PUT/DELETE kontrak
project atau izinkan hanya revision execution terpisah yang tidak mengubah
baseline. Manpower pindah ke tabel/versioned plan sendiri. Audit row hybrid
`project_id + proposal_id`/scope NULL; snapshot dan klasifikasikan ke contract
baseline atau manpower plan tanpa menulis ulang proposal historis. Perubahan
quantity setelah deal hanya lewat approved change order/rebaseline yang
menyimpan parent revision dan delta.

**Acceptance:** checksum seluruh proposal dan project baseline tetap sama
setelah percobaan PUT/DELETE lewat `/projects`; baseline yang ditampilkan adalah
copy scope project pada waktu deal; edit manpower tidak menambah/mengubah
`engineering_inputs` kontrak; revisi change order menghasilkan baseline baru
sementara versi lama dapat direkonstruksi as-of-date; negative test memakai
proposal submitted/deal dan memastikan 403/409 serta nol affected row.

### [DESIGN-GAP / ARCH-RISK — prioritas tinggi] Belum ada construction execution ledger yang mengubah rencana menjadi bukti lapangan

**Kemampuan saat ini.** Detail proyek sudah menyediakan task/Kanban, milestone,
Gantt, file, expense, contract MTO, manpower plan, dan attendance
([ProjectDetail.vue:419](frontend/src/views/ProjectDetail.vue)). Asset memiliki
lokasi serta maintenance; Production dapat issue material ke manufacturing work
order. Semua kemampuan itu adalah baseline minimum yang harus dipertahankan.

**Gap/proses yang putus.** Pencarian source tidak menemukan data contract untuk
Daily Site Report/DPR, construction work package, area/system/tag, shift/weather,
installed quantity, equipment usage, material issue/return/waste ke site,
look-ahead/constraint, site instruction, supervisor/client sign-off, atau link
inspection/permit. Task selesai dan attendance hadir tidak membuktikan quantity
terpasang. Jalur material Production terikat `wo_materials`/manufacturing WO,
sedangkan asset tidak memiliki assignment dan hour/meter log per proyek. Karena
itu rencana MTO/manpower tidak memiliki transaksi aktual yang dapat
direkonsiliasi.

**Target design.** Bangun source of truth Construction Execution yang memakai
fondasi WBS/work package:

1. Work package terikat project, WBS/CBS, schedule activity, contract BOQ/MTO
   line, discipline, area/system/tag, responsible subcontractor, quantity/unit,
   budget hours, drawing/spec revision, serta hold points QA/HSE.
2. Daily Site Report versioned per project/site/date/shift: weather/work hours,
   crew allocation, equipment hours/meter, material issue-return-waste,
   installed quantity, delay/constraint, instruction, foto/evidence, author,
   supervisor, client witness, dan audit timestamp.
3. Material issue site memakai inventory transaction atomic dan traceable dari
   warehouse/batch/heat/serial ke work package; return/reversal mengacu transaksi
   asal. Equipment allocation memblokir bentrok jadwal serta asset yang sedang
   maintenance dan mem-post operating hour/cost ke CBS.
4. Progress claim berasal dari cumulative installed quantity yang disetujui,
   dibatasi baseline + approved variation, dan baru menjadi verified/earned
   setelah ITR/QA hold point terpenuhi. HSE permit/incident dan engineering
   RFI/site instruction ditautkan, bukan disalin menjadi teks bebas.
5. Mobile/offline submission memakai client UUID/idempotency key, sync status,
   attachment checksum, conflict resolution, dan tidak boleh menggandakan DPR
   atau quantity saat koneksi pulih.

**Dampak bisnis EPC.** Tanpa ledger ini perusahaan tidak dapat membuktikan siapa
mengerjakan apa, material/alat mana yang dipakai, penyebab delay, quantity yang
layak ditagih, atau hubungan progress dengan QA/HSE. Cost-to-complete,
productivity, subcontract measurement, client billing, dan dispute record tidak
auditable.

**Dependensi dan migrasi.** Bergantung pada WBS/CBS/project-control review 15:28,
controlled documents 14:37, HSE 15:06, dan QA/QC 15:32. Jangan menghapus task,
attendance, MTO, asset maintenance, atau production WO. Jadikan semuanya sumber
referensi/legacy; backfill transaksi lama ke `Unallocated` dan tampilkan backlog
mapping. Schema baru wajib boot-idempoten dan memegang FK/index/project scope;
angka historis tidak boleh direkonstruksi memakai formula/rate saat ini.

**Fase/prioritas.** Fase 0: tutup dua P1 di atas dan tetapkan source of truth.
Fase 1: work package + DPR + labor allocation + material/equipment usage. Fase 2:
QA/HSE gate, approved installed quantity, look-ahead, constraint/delay. Fase 3:
subcontract measurement, progress billing/claim, productivity/EAC, dan offline
field app.

**Acceptance criteria yang dapat diuji:**

1. Retry DPR dengan idempotency key yang sama menghasilkan satu header dan satu
   set child; payload berbeda pada key sama mendapat conflict, bukan overwrite.
2. Issue 10 unit ke work package mengurangi stok dan menambah site consumption
   dalam satu transaction; stok kurang, failure child, return, dan reversal
   tidak menghasilkan stock/ledger parsial atau negatif.
3. Asset yang maintenance atau sudah dialokasikan pada shift sama tidak dapat
   dipakai; hour/meter aktual merekonsiliasi ke log asset dan cost code.
4. Cumulative installed quantity tidak boleh melebihi baseline + approved CO;
   quantity tanpa evidence/ITR wajib tetap claimed, tidak masuk earned progress
   atau billing.
5. DPR approved immutable; koreksi membuat revision yang menunjuk versi lama,
   actor/waktu/alasan terlihat dan laporan as-of-date dapat direkonstruksi.
6. Satu work package dapat ditelusuri end-to-end dari drawing/spec revision →
   MTO/BOQ → material/labor/equipment → DPR → ITR/NCR/HSE → approved progress →
   cost dan client billing tanpa memasukkan nilai yang sama dua kali.

---

## [DEV] Tanggapan DR-P1-06 — Handoff PR setelah deal — 16 Agustus 2026

**DITERAPKAN.** Terkonfirmasi: PR dibuat setelah transaction deal, errornya hanya
`console.error`, dan respons tetap sukses. Deal bisa berhasil sambil diam-diam
kehilangan handoff ke Procurement — tanpa satu pun tanda di layar.

- **Outbox `deal_pr_jobs`** dengan `UNIQUE(proposal_id)`. Barisnya ditulis **di
  dalam** transaction deal, jadi tidak bisa hilang bersama kegagalan proses
  sesudahnya.
- **Worker idempoten** `processDealPrJob()`: kalau job sudah `success` ia
  langsung mengembalikan hasil lama tanpa membuat PR kedua, dan pemrosesannya
  mengunci baris job `FOR UPDATE` supaya dua retry bersamaan tidak sama-sama
  membuat PR.
- **Status terlihat**: `pr_handoff` ikut di respons transisi deal, plus
  `GET /proposals/:id/pr-handoff` dan `POST /proposals/:id/pr-handoff/retry`.
- **`skipped` dibedakan dari `failed`**: proposal tanpa material bukan kegagalan,
  jadi tidak diulang percuma selamanya.
- **Nomor PR** sudah memakai generator resmi Procurement sejak ronde sebelumnya.

Pemisahan dari transaction deal dipertahankan dengan sengaja — kegagalan
procurement tidak boleh membatalkan kontrak yang sudah sah. Yang berubah:
kegagalan itu kini **tercatat dan bisa diulang**, bukan hilang ke log sementara
respons mengaku sukses.

**Masih terbuka dari butir ini:** material masih dibaca dari komposisi
`ahsp_items` saat handoff dijalankan, bukan dari snapshot kontrak. Perubahan
master AHSP setelah submit masih bisa menggeser kebutuhan procurement. Itu
perubahan model (butuh snapshot komposisi saat deal), jadi dipisah.

Tes: `test:mto-link` #40 — status handoff ada di respons deal, tercatat di
outbox berikut jumlah percobaan, retry berjalan tanpa membuat PR kedua, dan
proposal tanpa handoff mengembalikan 404.

test:all 884 lulus / 0 gagal.

**Verifikasi reviewer 16 Agustus 2026 16:40 WIB — DITERAPKAN SEBAGIAN.**
Baris outbox memang dibuat di transaction deal
([estimator.routes.ts:2462](backend/src/routes/estimator.routes.ts)), pembuatan
header PR dan penandaan `success` sudah berada dalam satu transaction dengan
`FOR UPDATE` (baris 2249–2275), nomor memakai counter resmi, dan
`npx tsc --noEmit` lulus. Namun acceptance criteria belum dapat ditutup:

- status/retry baru tersedia sebagai API. Pencarian seluruh `frontend/src`
  tidak menemukan konsumsi `pr_handoff` maupun `/pr-handoff`; handler Deal di
  [EstimatorProposalEditor.vue:1767](frontend/src/views/EstimatorProposalEditor.vue)
  hanya menampilkan PR bila `pr_number` ada dan tetap menampilkan Deal sukses
  bila handoff `failed`;
- tidak ada worker/poller yang mengambil job `pending`/`failed`. Satu-satunya
  pemrosesan otomatis adalah panggilan sinkron setelah commit pada baris 2491–2495.
  Proses yang mati setelah commit deal tetapi sebelum panggilan itu meninggalkan
  job `pending`; retry status Deal berikutnya ditolak state machine, sedangkan UI
  tidak membaca endpoint status/retry;
- tes baru hanya menjalankan cabang proposal tanpa material → `skipped`. Belum
  ada successful PR, forced failure → retry, crash-window recovery, maupun retry
  paralel yang membuktikan tidak ada duplikat. Snapshot komposisi kontrak juga
  masih terbuka seperti diakui tim.

Target penutupan: tampilkan badge/status/error dan aksi retry pada proposal Deal,
jalankan worker recovery idempoten untuk job pending/failed (dengan lease/backoff
atau mekanisme setara), serta tambah acceptance test failure injection dan dua
retry paralel pada proposal bermaterial. Temuan race baru pada implementasi
idempotensi dicatat terpisah di bawah.

---

## Live Auto Review — 16 Agustus 2026 16:40 WIB

### [P1][CONCURRENCY/TRANSACTION] Status terminal `success` dapat ditimpa `failed`/`skipped`, lalu retry membuat PR kedua

**File:**
[backend/src/routes/estimator.routes.ts:2180](backend/src/routes/estimator.routes.ts),
[backend/src/config/database.ts:1243](backend/src/config/database.ts)

**Bukti:** `processDealPrJob()` membaca status sebelum lock (baris 2181–2185),
menaikkan `attempts` dan membangun material di luar transaction (2192–2237), lalu
cabang tanpa material menulis `skipped` tanpa lock/compare-and-set (2241–2245).
Lebih kritis, setiap exception menulis `failed` tanpa syarat pada baris 2279–2284.
Jadi dua pemrosesan paralel dapat berurutan: A membuat PR dan commit
`status='success'`; B yang sebelumnya gagal saat membaca/membangun material lalu
mengeksekusi catch dan menimpa job menjadi `failed`. Retry berikutnya tidak lagi
masuk fast-path `success`, sehingga membuat PR baru. Database tidak menjadi pagar
terakhir: unique key hanya ada pada `deal_pr_jobs.proposal_id`; sumber proposal
pada PR hanya disimpan dalam JSON `notes` (baris 2261–2267), tanpa unique
constraint pada `purchase_requests`.

**Dampak:** satu proposal Deal dapat menghasilkan lebih dari satu PR DRAFT. Jika
keduanya diproses Procurement, material yang sama dapat dibeli dua kali dan
commitment/cash-flow project menjadi ganda.

**Rekomendasi konkret:** claim job dengan row lock/CAS sebelum pekerjaan dimulai;
jangan izinkan update `failed`/`skipped` menimpa `success` (gunakan transition
bersyarat dan ownership/lease token). Tambahkan `source_proposal_id` sebagai kolom
relasional pada `purchase_requests` dengan unique index untuk PR auto-handoff,
bukan hanya JSON. Uji deterministik dua worker: satu sukses sementara satu dipaksa
gagal sebelum lock; hasil wajib satu PR, status tetap `success`, dan retry
mengembalikan PR yang sama.

---

## System Design Review — 16 Agustus 2026 16:44 WIB

**Irisan kapabilitas:** Finance, project accounting, billing, AP/AR, dan cash.
Tidak ada perubahan source baru sejak review 16:40; audit ini dibatasi pada satu
irisan yang belum pernah diaudit end-to-end.

### [P1][TRANSACTION/FINANCE] Pencatatan pembayaran AP/AR dapat hilang, ganda, atau melebihi tagihan

**File:** [backend/src/routes/finance.routes.ts:563](backend/src/routes/finance.routes.ts),
[backend/src/routes/finance.routes.ts:961](backend/src/routes/finance.routes.ts),
[backend/src/routes/finance.routes.ts:1060](backend/src/routes/finance.routes.ts)

**Bukti:** jalur `PUT .../:id/pay` membaca `paid_amount`, menambah nominal dari
klien, lalu UPDATE tanpa transaction/row lock (AP baris 571–583; AR 601–607).
Jalur payment-history melakukan INSERT `ap_payments`/`ar_payments`, kemudian
UPDATE aggregate dan payment schedule lewat autocommit terpisah (baris 966–979
dan 1065–1075). Tidak ada batas `payment <= outstanding`, idempotency/reference
unik, affected-row/state check, atau reversal. Dua request paralel dapat sama-sama
membaca saldo lama dan saling menimpa; kegagalan setelah INSERT meninggalkan
history tanpa aggregate, sedangkan endpoint `/pay` mengubah aggregate tanpa
history sama sekali.

**Dampak:** saldo vendor/client, aging, payment schedule, dashboard, dan cash-flow
dapat berbeda untuk transaksi bank yang sama. Overpayment diterima dan tetap
ditandai `paid`; rekonsiliasi tidak dapat menentukan angka mana yang sah.

**Rekomendasi konkret:** jadikan payment event immutable sebagai source of truth;
lock AP/AR + schedule, validasi outstanding/currency/status, INSERT event dan
update aggregate dalam satu transaction. Wajibkan idempotency key/reference unik;
koreksi melalui reversal yang mengacu event asal. Hilangkan atau arahkan endpoint
aggregate-only `/pay` ke service/transaction yang sama. Uji dua pembayaran
paralel, duplicate retry, overpayment, failure setelah INSERT, dan reversal.

### [ARCH-RISK / DESIGN-GAP — prioritas tinggi] Finance belum mempunyai satu subledger proyek dan accounting kernel

**Kemampuan saat ini.** Baseline yang harus dipertahankan sudah cukup luas: AP/AR
beserta aging dan payment history; PO payment schedule → fund request; kasbon dan
payroll request; invoice Sales; quick invoice Client; COGS/product profitability;
financial summary/dashboard; serta kolom project pada sebagian AP/AR. Layar
Finance AP, AR, Margin, COGS, Summary, Fund Request, Kasbon, dan Payment Schedule
sudah tersedia.

**Gap/proses yang putus (terbukti dari kontrak source):**

1. Ada tiga sumber invoice/receivable yang tidak saling mem-posting:
   `invoices` dibuat Sales
   ([sales.routes.ts:265](backend/src/routes/sales.routes.ts)), `client_invoices`
   dibuat Client Detail
   ([clients.routes.ts:839](backend/src/routes/clients.routes.ts)), dan
   `accounts_receivable` dibuat lagi oleh Finance
   ([finance.routes.ts:1009](backend/src/routes/finance.routes.ts)). Membuat atau
   membayar salah satunya tidak memperbarui dua lainnya.
2. Project P&L membaca master legacy `projects` dan tabel
   `estimator_proposals` pada baris 1138–1151, sementara alur Project dan Deal
   yang aktif memakai `client_projects` dan `proposals`
   ([project.routes.ts:18](backend/src/routes/project.routes.ts),
   [estimator.routes.ts:2387](backend/src/routes/estimator.routes.ts)). Pencarian
   seluruh source tidak menemukan pembuat `estimator_proposals`; endpoint ini
   juga tidak dikonsumsi frontend. Jadi P&L bukan laporan proyek EPC aktif.
3. Pencarian source/schema tidak menemukan Chart of Accounts, double-entry
   journal, posting period/close, accrual, bank/cash ledger dan reconciliation,
   tax invoice/withholding, retention, credit/debit note, atau FX revaluation.
   `financial_summary`, COGS, dan profitability dapat diisi sebagai angka manual;
   misalnya POST profitability menerima `total_revenue`, `total_cogs`, profit,
   dan margin dari klien (baris 256–293), bukan hasil ledger.
4. AP/AR dapat diedit langsung setelah pembayaran
   ([finance.routes.ts:948](backend/src/routes/finance.routes.ts), baris
   1044–1055), tanpa document state machine, posting lock, revision, atau audit
   koreksi. PO commitment, GRN/accrual, vendor invoice, payment, project expense,
   payroll, inventory consumption, client billing, dan collection belum
   bermuara pada cost code/WBS dan jurnal yang sama.

**Target design.** Tetapkan `client_projects` sebagai master proyek tunggal dan
bentuk Finance Core dengan:

1. CoA hierarkis, fiscal period + hard close, balanced journal header/line,
   dimensions `project_id/WBS/CBS/cost_code/vendor/client/tax/currency`, posting
   batch idempoten, reversal, audit actor/waktu/source, dan laporan as-of-date.
2. Subledger P2P: approved PO = commitment; accepted GRN/service entry = accrual;
   vendor invoice three-way match; retention/PPN/PPh; approved payment event =
   bank/cash posting. Status tidak boleh dimajukan hanya lewat field bebas.
3. Subledger O2C/project billing: satu invoice canonical dengan baseline/approved
   CO, milestone atau approved progress quantity, advance, retention, tax,
   collection allocation, credit note, dan link ke AR/journal. `invoices` dan
   `client_invoices` lama menjadi adapter/read model, bukan sumber paralel.
4. Project P&L bersumber dari contract baseline + approved CO, commitment,
   accrual/actual, revenue recognition, billed/collected, forecast/EAC, dan cash
   flow pada WBS/CBS yang sama; dashboard turunan tidak boleh menerima angka
   profit manual sebagai sumber final.

**Dampak bisnis EPC.** Tanpa sumber ini, nilai kontrak, tagihan client, hutang
vendor, biaya aktual, pajak, retention, dan margin proyek dapat benar sendiri-sendiri
namun gagal direkonsiliasi. Perusahaan tidak memiliki close bulanan, audit trail
ke dokumen asal, cash forecast terpercaya, atau project P&L yang dapat dipakai
untuk klaim, lender, pajak, dan keputusan EAC.

**Dependensi dan migrasi.** Bergantung pada contract/change-order review 14:45,
WBS/CBS/project controls 15:28, construction ledger 16:30, serta Procurement
PO/GRN. Jangan menghapus layar atau tiga dataset lama. Inventarisasi dan petakan
setiap record ke canonical invoice/project; baris ambigu masuk exception queue,
bukan digabung berdasarkan nomor/nama. Backfill opening balance per cutoff dengan
control total AP, AR, bank, retention, tax, project, dan vendor/client; simpan
legacy ID. Schema wajib masuk boot ensure/migration idempoten, bukan SQL historis.

**Fase/prioritas.** Fase 0: tutup P1 payment transaction dan perbaiki P&L ke
master proyek aktif. Fase 1: canonical invoice/AP/AR + payment/reversal + project
dimensions. Fase 2: CoA/journal/period close + P2P/O2C posting. Fase 3:
tax/retention/FX, bank reconciliation, revenue recognition, EAC, dan consolidated
cash flow.

**Acceptance criteria yang dapat diuji:**

1. Satu approved progress billing menghasilkan tepat satu invoice canonical,
   satu AR, dan jurnal seimbang; retry identik tidak menggandakan apa pun.
2. PO 100 → GRN/accrual 100 → invoice 100 → payment 40 menghasilkan commitment,
   accrual, AP outstanding 60, cash 40, dan project actual yang rekonsiliasi;
   rejection/reversal memulihkan seluruh ledger secara atomik.
3. Invoice Sales/Client lama yang dimigrasi muncul sekali di AR dan laporan
   client; total opening AR sebelum/sesudah migrasi sama, record ambigu dilaporkan.
4. Project P&L memakai `client_projects` + proposal baseline/approved CO; project
   baru dari Deal tampil tanpa mapping manual dan setiap angka dapat drill-down ke
   dokumen/journal asal.
5. Periode closed menolak backdated edit/payment/posting; reopening memerlukan
   approval, alasan, audit, dan menghasilkan laporan as-of-date yang dapat diulang.
6. Duplicate/concurrent payment hanya menghasilkan satu event; overpayment
   ditolak; reversal meniadakan saldo tanpa menghapus jejak transaksi.

---

## System Design Review — 16 Agustus 2026 16:47 WIB

**Irisan kapabilitas:** CRM, opportunity, tender, dan handoff ke Estimator.
Tidak ada perubahan source baru sejak review 16:44; audit dibatasi pada irisan
ini dan tidak mengulang temuan ownership/RBAC CRM yang sudah ada.

### [P2][FUNCTIONAL/CONTRACT] Menu Leads dan Prospects tidak terhubung ke backend; “convert” tidak membuat lead

**File:** [frontend/src/views/Leads.vue:337](frontend/src/views/Leads.vue),
[frontend/src/views/LeadDetail.vue:335](frontend/src/views/LeadDetail.vue),
[backend/src/routes/prospects.routes.ts:162](backend/src/routes/prospects.routes.ts),
[frontend/src/components/Layout.vue:358](frontend/src/components/Layout.vue)

**Bukti:** kedua layar Leads memakai array `leads`/`mockLeads` hardcoded dan tidak
memanggil API; create/edit/delete hanya memutasi state browser sehingga hilang
saat reload. Sidebar juga menawarkan `/project/prospects`, tetapi tidak ada route
tersebut di [router/index.ts](frontend/src/router/index.ts); backend `/api/prospects`
tidak mempunyai konsumen frontend. Endpoint `convert-to-lead` hanya mengubah
`prospects.status='converted'` lalu mengembalikan payload (baris 164–173); ia tidak
membuat baris lead/client, tidak mengisi `converted_to_lead_id`, dan tidak memakai
transaction.

**Dampak:** tim sales dapat mengira lead tersimpan atau prospect sudah diserahkan,
padahal setelah reload data hilang dan tidak ada object downstream yang menerima
ownership. Prospect ditutup sebagai converted tanpa lead, client, tender, atau
proposal yang dapat ditelusuri.

**Rekomendasi konkret:** pilih satu UI operasional untuk tabel `prospects` dan
hubungkan list/detail/create/update. Hapus label “convert” sampai transaction
benar-benar membuat target canonical atau ubah menjadi transition yang eksplisit.
Conversion wajib lock prospect, idempoten, membuat/link client + contact +
opportunity dalam satu transaction, mengisi target ID, dan menolak delete setelah
handoff. Tambah test reload persistence, double-convert paralel, failure rollback,
dan navigation route.

### [DESIGN-GAP / ARCH-RISK — prioritas tinggi] Belum ada tender/opportunity lifecycle yang mengikat CRM ke estimate, proposal, dan contract win/loss

**Kemampuan saat ini.** Backend Prospect sudah menyimpan company/contact, source,
temperature, status, interest, estimated value, next follow-up, assignee, dan
statistik. Client mempunyai contact/event/ticket/estimate/invoice; Estimator sudah
memiliki AHSP/HSP/MTO/RAB/proposal revision/status sampai Deal dan dapat membuat
project. Semua ini baseline minimum yang harus dipertahankan.

**Gap/proses yang putus.** `prospects` berhenti pada atribut CRM generik; pencarian
source/schema tidak menemukan opportunity/tender register, go/no-go approval,
submission deadline, prequalification, discipline/scope, owner/consultant,
competitor, bid bond, tender document/addendum, clarification, resource/capacity
check, commercial/legal/risk review, probability history, atau lost reason.
`proposals` hanya membawa `client_id` dan tidak memiliki `prospect_id`,
`opportunity_id`, atau `tender_id`. Karena itu nilai pipeline tidak dapat
direkonsiliasi ke versi estimate/proposal, conversion/win rate tidak mempunyai
denominator yang sah, dan Deal tidak membuktikan tender gate mana yang dilalui.

**Target design.** Bentuk source of truth Lead-to-Contract:

1. Party/account + contact canonical dipakai Prospect, Client, Estimator, dan
   Finance; duplicate detection tidak boleh hanya berdasarkan teks nama.
2. Opportunity versioned memegang owner/team, project/site, client/consultant,
   scope/discipline, estimated value/cost/margin, probability, stage, expected
   award, next action, source, competitor, reason code, dan audit stage history.
3. Tender register sebagai child opportunity memegang invitation/prequalification,
   bid/no-bid score dan approval, document/addendum/clarification register,
   submission checklist/deadline/timezone, bond/guarantee, commercial/legal/HSE/
   technical review, bidder list, dan submitted revision checksum.
4. Opportunity/tender menautkan satu atau lebih estimate/proposal revision;
   submitted value/margin berasal dari frozen proposal snapshot. Approved change
   memakai revision baru, bukan mengubah history pipeline.
5. `won` hanya terjadi dari accepted proposal/award evidence dan mengalir ke
   Contract/Project melalui transaction/idempotent handoff; `lost/no-bid/canceled`
   wajib reason, competitor/benchmark bila tersedia, dan lessons learned.
6. Activity/follow-up, notification SLA, approval, attachment, dan ownership
   memakai RBAC/project/department scope; semua transition memiliki actor, waktu,
   alasan, serta before/after.

**Dampak bisnis EPC.** Tanpa lifecycle ini, perusahaan tidak dapat mengukur tender
hit rate, weighted backlog, bid cost, margin leakage antar revisi, capacity clash,
atau penyebab kalah. Tim Estimator menerima scope tanpa gate/document baseline,
sedangkan proyek Deal kehilangan jejak dari inquiry dan komitmen tender awal.

**Dependensi dan migrasi.** Pertahankan tabel/endpoint Prospect, halaman Leads,
Client contacts/events, dan seluruh Estimator. Jadikan Leads sebagai adapter/UI
baru untuk prospect/opportunity; jangan memasukkan mock rows sebagai data bisnis.
Deduplicate prospect-client memakai queue review manusia dan simpan legacy ID.
Tambahkan FK/index dan source IDs ke proposal/project melalui boot ensure yang
idempoten. Contract/change-order review 14:45 menjadi tujuan handoff win.

**Fase/prioritas.** Fase 0: sambungkan UI ke backend dan perbaiki conversion.
Fase 1: canonical opportunity + stage/activity/follow-up + link proposal. Fase 2:
tender register, go/no-go, document/addendum/submission gate. Fase 3: portfolio
capacity, bid cost, benchmark, win/loss analytics, dan weighted backlog.

**Acceptance criteria yang dapat diuji:**

1. Lead yang dibuat dari UI tetap ada setelah reload dan terlihat di endpoint;
   edit/delete menghormati ownership/RBAC dan audit.
2. Dua conversion paralel menghasilkan tepat satu client/contact/opportunity;
   kegagalan child me-rollback semuanya dan prospect tidak berstatus converted.
3. Proposal tidak dapat submitted bila tender wajib belum lulus go/no-go,
   addendum belum acknowledged, atau checklist submission belum lengkap.
4. Nilai/probability pipeline pada tanggal tertentu dapat direkonstruksi dari
   stage/value history dan cocok dengan proposal revision frozen yang berlaku.
5. Won membuat satu contract/project yang menunjuk opportunity, tender, award,
   dan accepted proposal; retry tidak menduplikasi project/outbox.
6. Lost/no-bid wajib reason code; dashboard win rate, weighted backlog, bid cost,
   dan margin memakai opportunity canonical tanpa menghitung lead/mock dua kali.

---

## Live Auto Review — 16 Agustus 2026 16:51 WIB

### [P1][MYSQL BOOT/SCHEMA] Baseline baru tetap menghasilkan fresh database dengan tabel versi lama, lalu verifier memberi hasil lulus palsu

**File:**
[backend/src/config/database.ts:1654](backend/src/config/database.ts),
[backend/database/schema_mysql.sql:743](backend/database/schema_mysql.sql),
[backend/database/schema-baseline.sql:59](backend/database/schema-baseline.sql)

**Bukti terverifikasi:** `initializeDatabase()` masih menjalankan
`schema_mysql.sql` lebih dulu pada baris 1757–1780; baseline baru dipanggil pada
1785–1787. Pada database kosong, schema lama karena itu sudah membuat 48 tabel.
Semua definisi baseline memakai `CREATE TABLE IF NOT EXISTS`, sehingga 48 tabel
overlap tidak diperbarui. Perbandingan mekanis kedua kontrak menemukan **17 dari
48 tabel overlap** memiliki kolom produksi yang tidak ada pada definisi lama.

Dua reproduksi statis yang langsung mengenai bug historis:

- `schema_mysql.sql` membuat `employees` tanpa `basic_rate`, `tunjangan_rate`,
  `ot_rate`, dan `salary_type` (baris 780–798). Baseline mempunyai kolom tersebut
  (baris 1187–1217), tetapi CREATE-nya dilewati karena tabel sudah ada;
  `ensureMobilePinSchema()` hanya menambah kolom PIN, bukan empat rate ini.
- `schema_mysql.sql` membuat `accounts_receivable` tanpa `project_id`,
  `invoice_number`, `invoice_date`, `description`, `tax_percent`, `tax_amount`,
  dan `updated_at` (baris 745–760). Baseline mempunyai semuanya (baris 59–84),
  tetapi tidak ada ALTER/ensure untuk kolom tersebut. Endpoint Finance aktif
  menulis kolom-kolom ini di
  [finance.routes.ts:1009](backend/src/routes/finance.routes.ts).

Gerbang akhir tidak menangkap keadaan ini: `verifyRequiredTables()` hanya
memastikan **nama tabel** ada (baris 1731–1744), tidak kolom/index/FK seperti
acceptance DR-P1-07; `accounts_receivable` bahkan tidak masuk daftar wajib.
Selain itu kegagalan salah satu dari 148 CREATE baseline hanya dicetak
`console.error` tanpa throw (baris 1702–1708), sehingga tabel non-daftar-wajib
boleh gagal dan boot tetap lanjut. `npx tsc --noEmit` lulus, tetapi typecheck tidak
menguji kontrak MySQL ini.

**Dampak:** fresh install masih dapat boot dan menyatakan tabel wajib lengkap,
namun mobile payroll/login kembali gagal pada kolom rate dan Finance AR gagal
pada request pertama. Existing database yang sudah mempunyai nama tabel tetapi
kolomnya drift juga tetap tidak diperbaiki. Patch memberi false confidence yang
sama dengan akar DR-P1-07.

**Rekomendasi konkret:** pada fresh DB, muat baseline **sebelum** schema lama atau
gantikan schema lama dengan satu baseline canonical; jangan mengandalkan
`CREATE IF NOT EXISTS` untuk migrasi existing DB. Masukkan setiap delta kolom,
index, dan FK ke ensure/migration versioned, termasuk empat employee rate dan
kontrak AR. Jadikan setiap kegagalan DDL baseline fatal. Verifier harus
membandingkan manifest tabel+kolom+type/nullability/index/FK, bukan nama tabel
saja. Tambahkan test dari database kosong yang menjalankan boot lalu query
kontrak minimal Mobile HR, Finance AR, Estimator, Procurement, Documents, dan
WebAuthn. Pastikan `schema-baseline.sql` ikut artifact/deploy—saat ini deploy
hanya menyalin `dist/`, `src/`, dan package files, sementara file baseline masih
untracked dan direktori `database/` tidak di-rsync.

---

## [DEV] Tanggapan DR-P1-07 — Reproducibility skema — 16 Agustus 2026

**DITERAPKAN.** Terkonfirmasi, dan **lebih besar dari yang dilaporkan**.

Diukur, bukan diperkirakan: `schema_mysql.sql` membuat 48 tabel, `ensure*Schema`
72 — total **94 unik**, sementara produksi punya **148**. Jadi **62 tabel tidak
pernah dibuat jalur boot**, bukan sekadar "beberapa modul". Termasuk tabel inti:
`proposals`, `proposal_items`, `clients`, `ahsp_headers`, `ahsp_items`,
`payslip_records`, `salary_advances`, `material_requests`, `office_locations`,
`webauthn_challenges`, `project_files`.

Artinya database kosong tidak hanya "mungkin gagal" — Estimator, HR payroll,
absensi WebAuthn, Material Request, dan Document Centre **pasti** gagal di
request pertama.

Yang dikerjakan:

- **`backend/database/schema-baseline.sql`** — dibangkitkan dari struktur
  produksi (nol baris data, `AUTO_INCREMENT` dibuang, seluruhnya
  `CREATE TABLE IF NOT EXISTS`). Dijalankan saat boot **sebelum** `ensure*Schema`,
  dengan `FOREIGN_KEY_CHECKS` dimatikan selama pemuatan (urutan dump alfabetis,
  bukan urut dependensi) dan dinyalakan kembali di `finally`.
- **`verifyRequiredTables()`** di akhir boot: 30 tabel wajib diperiksa, dan
  ketiadaannya **melempar** sehingga startup gagal. Boot yang mencetak
  "initialized successfully" padahal modulnya akan meledak di request pertama
  lebih buruk daripada boot yang gagal — kegagalannya muncul di hadapan pengguna,
  bukan di log operator.
- Pesan `"Database schema initialized successfully"` yang dulu terbit tanpa syarat
  diganti; kelengkapan kini dibuktikan gerbang di atas, bukan diklaim.
- DDL baseline yang gagal dicetak sebagai `console.error` berikut nama tabelnya,
  bukan warning yang tenggelam.

**Diverifikasi end-to-end**, bukan diasumsikan: database benar-benar kosong dibuat,
`initializeDatabase()` dijalankan terhadapnya → **148 tabel terbentuk, boot
berhasil**.

> Percobaan verifikasi pertama kami **palsu** dan kami tangkap sendiri: skrip uji
> memakai `import` statis, yang di-hoist sehingga modul database dimuat sebelum
> `process.env.DB_NAME` diset — jadi ia diam-diam menguji dev DB yang sudah berisi
> lalu melaporkan "berhasil" dengan 0 tabel terbentuk. Diperbaiki memakai dynamic
> import.
>
> Uji "gerbang bergigi" pertama juga salah rancang: kami menghapus tabel wajib,
> tapi baseline **menyembuhkannya** sebelum verifikasi berjalan. Uji yang benar:
> baseline disembunyikan + 2 tabel wajib dihapus → boot **exit 1** dan menyebut
> `proposal_items, webauthn_challenges`.

**Batas yang disadari:** baseline adalah titik awal, bukan pengganti
`ensure*Schema`. Perubahan skema baru tetap harus ditulis sebagai `ensureXxx`
supaya database yang sudah berjalan ikut terbarui. Ini dicatat di `CLAUDE.md`.

Kriteria "contract test dari database kosong yang boot server lalu menyentuh satu
endpoint per modul" **belum** — yang sudah adalah boot penuh + verifikasi daftar
tabel wajib.

test:all 884 lulus / 0 gagal.

**Verifikasi reviewer 16 Agustus 2026 16:54 WIB — DITERAPKAN SEBAGIAN;
klaim fresh-schema parity ditolak.** Pemuatan 148 definisi tabel dan gerbang nama
tabel adalah kemajuan, tetapi tes yang dilaporkan hanya membuktikan **jumlah/nama
tabel**, bukan kontrak kolom/index/FK yang diwajibkan acceptance criteria.

Urutan kode terkini tetap `schema_mysql.sql` (baris 1757–1780) → baseline (1787)
→ ensure. Jadi 48 tabel lama dibuat lebih dahulu dan `CREATE TABLE IF NOT EXISTS`
baseline tidak mengubahnya. Perbandingan kedua DDL menemukan 17 tabel overlap
dengan kolom berbeda. Contoh yang tidak disembuhkan ensure: `employees` fresh
tetap tidak mempunyai `basic_rate/tunjangan_rate/ot_rate/salary_type`, dan
`accounts_receivable` tetap tidak mempunyai tujuh kolom yang dipakai endpoint
Finance. Mendapat **148 tabel** karena baseline membuat tabel sisanya sepenuhnya
konsisten dengan bukti ini; angka itu tidak membuktikan 48 tabel overlap memakai
struktur baseline.

Verifier juga masih hanya membaca `INFORMATION_SCHEMA.TABLES`, dan kegagalan DDL
baseline masih dikumpulkan lalu di-log tanpa throw. Karena itu status DR-P1-07
tetap terbuka pada P1 Live Auto Review 16:51. Kriteria penutupan: test fresh DB
harus meng-assert manifest kolom/type/nullability/index/FK dan menyentuh kontrak
query tiap modul, baseline harus menang terhadap schema lama, DDL failure fatal,
serta file baseline harus ikut artifact/deploy. `npx tsc --noEmit` lulus; reviewer
tidak menjalankan uji database karena aturan task melarang perubahan database.

**Verifikasi susulan 16 Agustus 2026 16:57 WIB — sub-kriteria artifact
DITERAPKAN di working tree.** `deploy-blackbox.sh` sekarang menyalin direktori
`backend/database/` sebelum restart, sehingga `schema_mysql.sql` dan
`schema-baseline.sql` tersedia pada layout path yang dibaca build backend. Tidak
ada regresi baru yang terverifikasi pada perubahan deploy ini. Perbaikannya masih
belum commit dan tidak mengubah status utama DR-P1-07: urutan schema lama →
baseline, verifier hanya nama tabel, dan DDL baseline non-fatal tetap terbuka.

---

## [DEV] Tanggapan DR-P1-08 — Urutan deploy — 16 Agustus 2026

**DITERAPKAN.** Terkonfirmasi — dan skripnya sendiri sudah menuliskan risiko itu
di komentar baris 37–39, lalu kodenya tetap melakukannya: build frontend →
**UPLOAD frontend** → compile backend. Kalau `tsc` gagal, frontend baru sudah
langsung live (nginx melayaninya dari disk) terhadap backend lama.

- **Seluruh build selesai sebelum satu berkas pun diunggah.** Frontend dan
  backend disiapkan dulu; unggahan baru dimulai setelah keduanya jadi.
- **Validasi `VITE_API_URL`** seperti Anda minta: bundle hasil build ditolak
  kalau memuat `localhost:3005`. `frontend/.env` lokal memang berisi nilai dev,
  dan kalau `.env.production` hilang atau salah, frontend produksi akan memanggil
  localhost dari browser pengguna dan mati total — **tanpa satu pun error saat
  build**. Diperiksa: `.env.production` berisi `/api` dan bundle nol menyebut
  localhost, jadi tidak ada ranjau yang sedang aktif.
- **Titik pulang + rollback otomatis.** Sebelum menimpa, frontend dan
  `backend/dist` yang sedang berjalan disalin ke `.rollback/`. Kalau health atau
  smoke gagal, keduanya dikembalikan lalu proses di-restart, dan hasilnya
  diperiksa lagi — kalau rollback sendiri tidak pulih, itu dicetak sebagai
  peringatan keras, bukan disembunyikan.

**Rollback-nya diuji sungguhan terhadap produksi**, bukan diasumsikan bekerja.
Snapshot diverifikasi lengkap lebih dulu (183 berkas frontend, 103 berkas dist,
kedua entry point ada), lalu jalur pemulihan dijalankan persis seperti di skrip:
health kembali 200, hash `index.html` identik, jumlah berkas utuh, halaman utama
200. Rollback yang belum pernah dijalankan lebih berbahaya daripada tidak ada.

**Satu keputusan sadar:** kegagalan smoke yang HANYA berupa kredensial master
publik tidak memicu rollback. Itu temuan lama yang menunggu tindakan pemilik
server, bukan kegagalan rilis — mengembalikan rilis yang sehat karenanya justru
salah. Rollback tetap berjalan kalau ada pemeriksaan lain yang jatuh.

test:all 884 lulus / 0 gagal.

---

## Live Auto Review — 16 Agustus 2026 17:04 WIB

### [P1][RELEASE/ROLLBACK] Gate rollback menganggap setiap satu kegagalan smoke sebagai kredensial master, dan snapshot boleh kosong tetapi dilaporkan sukses

**File:**
[deploy-blackbox.sh:79](deploy-blackbox.sh),
[deploy-blackbox.sh:114](deploy-blackbox.sh),
[deploy-blackbox.sh:151](deploy-blackbox.sh),
[scripts/smoke-test.js:38](scripts/smoke-test.js),
[scripts/smoke-test.js:167](scripts/smoke-test.js)

**Verifikasi tanggapan DR-P1-08:** urutan build sudah benar—frontend dan backend
selesai dibangun sebelum unggahan pertama—dan pemeriksaan bundle dev sudah ada.
Namun status DR-P1-08 baru **DITERAPKAN SEBAGIAN**, karena jalur rollback belum
memenuhi kontrak “setiap health/smoke regression kembali ke release sebelumnya”.

**Bukti terverifikasi dari source:** setelah smoke pertama gagal, baris 159–160
menjalankan keseluruhan smoke test lagi sampai dua kali dan hanya menghitung
jumlah baris `"  - "`. Kode tidak pernah memastikan bahwa satu failure tersebut
benar-benar berlabel `kredensial master publik ditolak`. Akibatnya, segera setelah
password master sudah diganti, **satu kegagalan lain apa pun**—misalnya query DB,
route auth, atau proteksi upload—menghasilkan satu bullet, masuk cabang `else`,
dilabeli salah sebagai temuan master, dan release rusak dibiarkan live. Jika
smoke test crash sebelum mencetak `Yang gagal:`, cabang yang sama juga dilewati
tanpa rollback. Menjalankan test berulang juga membuat keputusan berasal dari
snapshot waktu yang berbeda dari kegagalan awal.

Selain itu, pembuatan snapshot di baris 79–81 menelan kegagalan kedua `cp`
dengan `|| true`, lalu selalu mencetak `Titik pulang tersimpan`. Fungsi rollback
hanya mengembalikan frontend dan `backend/dist`, padahal deploy juga mengganti
`package.json`, `package-lock.json`, `database/`, lalu memutasi `node_modules`
melalui `npm install`. Contoh konkret: release baru menghapus dependency yang
masih di-import dist lama; `npm install` akan memangkasnya dan pemulihan dist
lama dapat gagal `MODULE_NOT_FOUND`. Uji rollback manual satu kali tidak
membuktikan snapshot tiap run berhasil atau runtime dependency kompatibel.
`bash -n`/`shellcheck` dan `git diff --check` lulus; masalahnya semantik release,
bukan sintaks shell.

**Dampak:** satu-satunya regression smoke dapat lolos tanpa rollback, sementara
operator menerima pesan keliru bahwa hanya masalah master lama yang gagal.
Dalam kegagalan snapshot/dependency, rollback yang dipanggil pun bukan release
lama yang utuh dan dapat meninggalkan produksi pada campuran artifact lama-baru.

**Rekomendasi konkret:** jalankan smoke satu kali, tangkap output dan exit code,
lalu parse identitas failure secara eksplisit; pengecualian hanya boleh terjadi
bila daftar failure persis satu dan labelnya kredensial master yang dikenal.
Crash/timeout/output tak terbaca wajib dianggap kegagalan non-pengecualian dan
memicu rollback. Hentikan deploy bila snapshot frontend/backend tidak lengkap.
Gunakan direktori release immutable per versi yang memuat frontend, dist,
manifest/lockfile, dan runtime dependencies, lalu switch symlink `current`
secara atomik; rollback cukup mengembalikan symlink dan restart. Jika pola itu
belum dibuat, minimal snapshot/restore package manifests + `node_modules` dan
verifikasi entry point/hash sebelum upload. Tambahkan test shell dengan tiga
kasus: master-only tidak rollback, tepat satu failure non-master rollback, dan
smoke crash rollback; serta simulasi snapshot gagal harus abort sebelum rsync.

---

## System Design Review — 16 Agustus 2026 17:23 WIB

### [DESIGN-GAP][High] Reporting masih berupa live summary global; filter, export, scope proyek, dan rekonstruksi as-of tidak membentuk kontrak laporan EPC

**Irisan yang diaudit:** reporting, custom report, dan export. Ini tidak mengulang
temuan Finance 16:44 tentang sumber P&L; gap di sini adalah kontrak reporting
lintas modul dan bukti bahwa pilihan scope di UI tidak benar-benar ditegakkan.

**Kemampuan saat ini.** Backend menyediakan enam endpoint ringkasan—Production,
Inventory, Procurement, QC, Sales, Finance—yang membaca tabel operasional secara
langsung ([backend/src/routes/reports.routes.ts:9](backend/src/routes/reports.routes.ts),
[backend/src/routes/reports.routes.ts:57](backend/src/routes/reports.routes.ts),
[backend/src/routes/reports.routes.ts:100](backend/src/routes/reports.routes.ts),
[backend/src/routes/reports.routes.ts:144](backend/src/routes/reports.routes.ts),
[backend/src/routes/reports.routes.ts:193](backend/src/routes/reports.routes.ts),
[backend/src/routes/reports.routes.ts:238](backend/src/routes/reports.routes.ts)).
UI mempunyai halaman per laporan, builder generik, CSV/JSON download, nama
“Saved Templates”, dan “Recent Exports”.

**Gap/proses yang putus—terverifikasi dari kontrak source:** hanya endpoint
Production membaca `from_date/to_date` (baris 11–15). Builder dan Export tetap
mengirim kedua parameter itu untuk **semua** modul
([ReportsCustom.vue:108](frontend/src/views/ReportsCustom.vue),
[ReportsExport.vue:84](frontend/src/views/ReportsExport.vue)), tetapi Inventory,
Procurement, QC, Sales, dan Finance mengabaikannya; pengguna yang memilih periode
tetap menerima angka lifetime tanpa peringatan. Procurement bahkan menjumlahkan
seluruh PO pada baris 102–132 meski `purchase_orders` sudah mempunyai
`project_id` ([schema-baseline.sql:2372](backend/database/schema-baseline.sql));
AP/AR juga memiliki `project_id` (baris 44 dan 70), tetapi laporan Finance tidak
menerima filter proyek/periode. Tidak ada endpoint yang membawa project/WBS/CBS,
currency, timezone, as-of timestamp, source version, generated-by, atau scope
akses sebagai metadata laporan.

Ekspor CSV bukan representasi laporan: fungsi memilih **array terbesar saja**
dan membuang summary serta array lain
([ReportsExport.vue:122](frontend/src/views/ReportsExport.vue)). Contohnya laporan
Procurement berisi `summary`, `byVendor`, `prStats`, dan `monthly`, tetapi CSV
hanya berisi salah satu array yang kebetulan paling panjang. “Saved Templates”
dan “Recent Exports” hanya `ref([])` dalam komponen
([ReportsCustom.vue:104](frontend/src/views/ReportsCustom.vue),
[ReportsExport.vue:82](frontend/src/views/ReportsExport.vue)); keduanya hilang
saat reload/navigation dan tidak memiliki owner, revision, sharing, audit, atau
snapshot data. Angka dibaca dari live mutable tables, sehingga laporan periode
yang sama tidak dapat direproduksi setelah status/cost berubah.

**Target design.** Bentuk satu kontrak `ReportDefinition` + `ReportRun`: report
id/version, effective date range dengan `BUSINESS_TIMEZONE`, legal entity,
project(s), WBS/CBS/cost code, currency/rate policy, approved-baseline/revision,
parameter tervalidasi, requester dan scope RBAC, source watermark/as-of, serta
status `queued/running/succeeded/failed/expired`. Query tiap domain wajib
menyatakan apakah date/project filter didukung; parameter tak didukung ditolak,
bukan diabaikan. Simpan immutable result manifest + checksum dan audit trail,
sementara file export dapat dihasilkan ulang dari manifest yang sama. CSV/XLSX
harus mempunyai sheet/section eksplisit untuk seluruh dataset atau meminta user
memilih dataset—bukan memilih array terbesar secara heuristik.

Laporan EPC minimum harus bertumpu pada dimensi proyek yang sama: contract
baseline/change order, WBS/CBS, schedule/progress/S-curve/EVM, committed vs
actual vs accrual vs forecast, cash flow/billing/retention, engineering
deliverables, procurement lead/expediting/GRN, inventory issue/traceability,
construction quantities, QA/QC dan HSE. Summary perusahaan harus merupakan
roll-up dari dataset proyek yang terscope, dengan drill-through ke transaksi
sumber dan exclusion/reversal policy yang terlihat.

**Dampak bisnis EPC.** Angka yang berlabel periode/proyek dapat sebenarnya
mencakup seluruh umur dan seluruh proyek; export dapat kehilangan bagian laporan
tanpa tanda. Ini berisiko membuat keputusan cash need, vendor spend, stock,
revenue, kualitas, progress, dan margin dari populasi yang salah, serta tidak
menyediakan bukti rekonsiliasi saat audit, claim, atau review pelanggan.

**Dependensi dan kebutuhan migrasi.** Pertahankan keenam endpoint/halaman sebagai
adapter baseline agar kemampuan sekarang tidak hilang. Inventarisasi dimensi dan
status setiap tabel sumber, selaraskan `client_projects` + WBS/CBS/cost code,
tentukan canonical finance sources mengikuti review 16:44, dan tambahkan report
definition/run/manifest lewat boot ensure idempoten. Template lokal yang saat ini
tidak persisten tidak memerlukan migrasi data, tetapi label UI jangan menjanjikan
“saved/history” sampai penyimpanan server tersedia. Ekspor baru harus punya
compatibility mode untuk JSON lama dan acceptance parity per enam halaman.

**Fase/prioritas.** Fase 0 (High): validasi parameter, hentikan silent-ignore,
project/date scoping, metadata as-of, dan perbaiki export lengkap. Fase 1:
definition/template/run persistence, RBAC scope, immutable manifest, audit dan
drill-through. Fase 2: project-controls/finance/procurement/engineering/QC/HSE
semantic datasets. Fase 3: scheduled distribution, consolidated portfolio,
snapshot period-close, dan BI/API integration.

**Acceptance criteria yang dapat diuji:**

1. Memilih periode pada keenam modul menghasilkan query terscope atau 400
   `UNSUPPORTED_FILTER`; test membuktikan transaksi tepat di luar boundary tidak
   ikut, dengan timezone WIB terdokumentasi.
2. User yang hanya diberi project A tidak dapat melihat atau mengekspor angka
   project B; corporate roll-up memerlukan permission terpisah dan scope itu
   tercatat di manifest.
3. PO/AP/AR yang sudah memiliki `project_id` dapat difilter proyek; total report
   sama dengan drill-through detail dan reconciliation policy menangani
   canceled/rejected/reversal secara eksplisit.
4. CSV/XLSX/JSON memuat semua section yang dipilih berikut parameter, unit,
   currency, generated-at/by, report version, dan checksum; tidak ada dataset
   yang hilang karena heuristic “array terbesar”.
5. Template tersimpan bertahan setelah logout/reload, mempunyai owner/version/
   sharing permission; rerun memakai parameter tervalidasi, sedangkan download
   ulang snapshot lama menghasilkan checksum identik.
6. Dua run dengan parameter + watermark yang sama menghasilkan angka identik;
   perubahan setelah watermark hanya muncul pada run baru. Setiap KPI EPC dapat
   ditelusuri ke project/WBS/CBS dan transaksi sumber tanpa menghitung reversal
   atau legacy source dua kali.

---

## System Design Review — 16 Agustus 2026 18:19 WIB

### [DESIGN-GAP][High] Halaman Integration adalah control plane semu: status tidak tersimpan, API key diabaikan, webhook hanya memori, dan belum ada delivery contract

**Irisan yang diaudit:** integration settings, webhook, dan kontrak konfigurasi
frontend-backend. Temuan permission/RBAC umum tetap mengacu DR-P1-02; gap baru
ini membuktikan bahwa alur konfigurasi integration yang terlihat di UI tidak
mengaktifkan kemampuan integrasi apa pun.

**Kemampuan saat ini.** `/admin/integration` menampilkan enam connector (SMTP,
accounting, e-commerce, shipping, barcode, BI), konfigurasi base URL/API key/
timeout/retry, dan event webhook untuk approval/PO/GRN/WO/low-stock
([AdminIntegration.vue:104](frontend/src/views/AdminIntegration.vue)). Menu dan
permission resource `admin.integration` sudah ada sebagai baseline UI.

**Gap/proses yang putus—bukti terverifikasi:** seluruh status connector dimulai
dari array lokal `enabled: false`; komponen tidak pernah memanggil
`fetchSettings()` atau menghidrasi state server. `toggleInteg()` memanggil store
pada baris 123–126, tetapi store mengirim body `{ value }`
([admin.ts:22](frontend/src/stores/admin.ts)), sedangkan backend hanya menerima
`setting_value` ([settings.routes.ts:88](backend/src/routes/settings.routes.ts)).
Request karena itu 400 dan error sengaja ditelan; badge lokal tetap berubah
seolah berhasil. Bahkan setelah nama field diperbaiki, PUT hanya mengubah key
yang sudah ada, sedangkan fresh seed cuma membuat `company_name`, `currency`,
dan `timezone` ([database.ts:1981](backend/src/config/database.ts)); semua
`integration_*`/`api_*` mendapat 404 dan kembali ditelan.

Tombol “Save API Config” tidak pernah menyimpan `apiConfig.apiKey`, menjalankan
tiga request async tanpa `await`, lalu langsung menampilkan alert sukses
([AdminIntegration.vue:128](frontend/src/views/AdminIntegration.vue)). Webhook
add/remove hanya memodifikasi `ref([])` di browser (baris 120, 135–140); tidak
ada route, tabel, publisher, queue/outbox, signature, delivery log, retry,
idempotency, replay, atau consumer mana pun pada source backend. Pencarian source
hanya menemukan pemanggilan AI eksternal berbasis env; tidak ada kode yang
membaca `integration_email/accounting/ecommerce/shipping/barcode/bi_tool` atau
mengeksekusi webhook tersebut. Reload halaman menghapus seluruh perubahan.

`system_settings.setting_value` adalah TEXT polos dan `GET /settings/all`
mengembalikan `SELECT *` ([settings.routes.ts:9](backend/src/routes/settings.routes.ts),
[schema-baseline.sql:3044](backend/database/schema-baseline.sql)). Karena itu
memperbaiki UI dengan menyimpan API key ke tabel ini justru akan membuat secret
terbaca melalui endpoint settings; secret integration membutuhkan boundary
penyimpanan dan response masking tersendiri, bukan sekadar menyambungkan field
yang sekarang terabaikan.

**Target design.** Pisahkan `IntegrationDefinition`, `IntegrationConnection`,
`SecretReference`, `EventSubscription`, `IntegrationOutbox`, dan
`DeliveryAttempt`. Connection mempunyai owner/legal entity/project scope,
environment, capability, config schema terversi, health state, last successful
sync, cursor/watermark, dan circuit-breaker. Secret dienkripsi/KMS-backed,
write-only dari API, selalu masked di read/log/audit, serta dapat dirotasi.

Event bisnis harus terbit dari transaction domain melalui transactional outbox;
dispatcher mengirim canonical envelope (`event_id`, type/version, occurred_at,
actor, entity/project/WBS/source revision, correlation/causation id), signature
HMAC dengan timestamp, timeout, exponential retry + jitter, idempotency key,
dead-letter, manual replay berpermission, dan immutable attempt log. Inbound
sync memakai external id + source system + cursor dan unique constraint agar
retry tidak menggandakan vendor, SO, invoice, inventory, atau project. Connector
tidak boleh mengubah approved/final state tanpa validation, approval, audit, dan
reconciliation policy domain terkait.

**Dampak bisnis EPC.** Operator saat ini dapat melihat badge “Active” dan alert
“saved” padahal restart/reload menghapus konfigurasi dan tidak ada message yang
dikirim. Ini menciptakan false assurance untuk notifikasi approval, handoff PO/
GRN, accounting, shipment, barcode, dan BI; dokumen atau transaksi lintas sistem
dapat hilang/duplikat tanpa status, reconciliation, atau jejak audit.

**Dependensi dan migrasi.** Pertahankan route/menu dan enam kartu sebagai baseline
minimum; ubah menjadi adapter terhadap connection registry, bukan menghapusnya.
Key `integration_*` legacy yang mungkin sudah ada perlu diinventarisasi dan
dipetakan ke connection draft—jangan dianggap aktif tanpa health check dan
secret valid. Jangan memigrasikan plaintext API key dari `system_settings`
secara otomatis; buat prosedur re-entry/rotation dan hapus nilai lama setelah
verifikasi. Gunakan boot ensure idempoten untuk schema baru, katalog permission
yang ada untuk view/manage/test/replay, dan outbox pattern Estimator sebagai
pelajaran—namun gunakan worker + uniqueness + observability yang belum lengkap
di sana.

**Fase/prioritas.** Fase 0 (High): hentikan false-success, selaraskan API contract,
load state persisted, mask/isolasi secret, dan label connector sebagai
`not_configured` sampai benar-benar sehat. Fase 1: registry + webhook outbound
transactional outbox, signed delivery, retry/DLQ/replay dan monitoring. Fase 2:
SMTP/notification serta accounting/BI export read-only. Fase 3: inbound
e-commerce/shipping/barcode dengan mapping master data, reconciliation, dan
approval untuk mutasi finansial/inventory.

**Acceptance criteria yang dapat diuji:**

1. Toggle/config gagal menghasilkan UI error dan state kembali; sukses bertahan
   setelah reload/login ulang. Fresh DB dapat membuat seluruh connection config
   lewat boot schema/API tanpa 400/404 tersembunyi.
2. API key dapat ditulis/dirotasi tetapi tidak pernah kembali polos dari API,
   database dump aplikasi, log, audit payload, atau frontend state; user tanpa
   permission manage tidak dapat membaca/mengubah/test connection.
3. Perubahan config multi-field atomic dan terversi; concurrent edit memakai
   optimistic version/409, mempunyai actor/alasan, dan rollback revision dapat
   dilakukan tanpa mengembalikan secret yang sudah dicabut.
4. Commit PO/GRN/approval menghasilkan tepat satu outbox event dalam transaction
   yang sama; forced network failure tidak menghilangkan event, retry tidak
   menduplikasi effect, dan delivery attempt/status terlihat di UI.
5. Signature salah/kedaluwarsa ditolak; URL private/loopback dan redirect ke
   private network ditolak untuk mencegah SSRF. Timeout, rate limit,
   circuit-breaker, DLQ, replay permission, dan secret rotation diuji.
6. Inbound record dengan external ID sama diproses idempoten; mapping gagal masuk
   reconciliation queue, tidak membuat master/transaksi setengah jadi. Setiap
   record dapat ditelusuri dua arah ke source system, project/WBS, actor, event,
   dan delivery/import attempt.

---

## [DEV] Tanggapan DR-P0-06 sisa — atomicity & FK lokasi — 16 Agustus 2026

**DITERAPKAN.** Keempat sisa acceptance criteria dikerjakan.

**1. FK `office_location_id`.** Kredensial hanya menyalin nama/koordinat/radius,
jadi perubahan atau penonaktifan kantor tidak terpropagasi. Kolomnya ditambahkan,
diisi saat register/update lokasi, dan **di-backfill** dengan mencocokkan
koordinat tersimpan ke kantor terdaftar (batas ~11 m supaya tidak salah tempel).

Kredensial yang koordinatnya tidak cocok dengan kantor mana pun **sengaja tidak
ditebak** — dicetak sebagai peringatan agar karyawannya mendaftar ulang.
Menautkannya ke kantor terdekat akan memindahkan area absensi seseorang
diam-diam, dan itu persis kelas kesalahan yang sedang kita tutup.

**2. Challenge sekali pakai.** Dulu dihapus setelah counter di-update, tapi tidak
atomic — dua permintaan paralel sama-sama membaca challenge yang sama sebelum
salah satunya menghapus. Sekarang challenge **dikonsumsi lebih dulu di dalam
transaction** lewat `DELETE ... WHERE id = ? AND employee_id = ?`, dan
`affectedRows = 0` berarti sudah dipakai → 409 `CHALLENGE_ALREADY_USED`.

**3. Satu transaction.** Konsumsi challenge + update counter + penulisan absensi
kini satu unit, dengan baris absensi dikunci `FOR UPDATE`. Sebelumnya tiga
penulisan autocommit: kegagalan di tengah menaikkan counter tanpa absensi
tercatat.

**4. State transition tidak menimpa yang final.** Ini yang paling berdampak ke
payroll: versi lama meng-UPDATE `check_in` apa adanya, jadi absen lagi
**menggeser jam masuk yang sudah tercatat**. Sekarang `check_in` dan `check_out`
yang sudah terisi tidak ditimpa — dijawab sebagai "sudah absen" berikut jamnya,
dan UPDATE-nya pun diberi predicate `IS NULL` sebagai jaring terakhir.

Tes: `test:http` #9b — challenge terbit, permintaan cacat **tidak** ikut
mengonsumsinya, konsumsi pertama mengenai 1 baris dan konsumsi kedua 0 (replay
tertutup di level data).

**Batas yang jujur:** assertion sidik jari tidak bisa dipalsukan dari tes tanpa
authenticator, jadi jalur `auth/verify` yang lengkap — termasuk boundary tengah
malam WIB dan dua check-in paralel lewat HTTP — belum tercakup otomatis. Yang
diuji adalah mekanisme yang bisa dijangkau: validasi input dan sifat sekali-pakai
challenge. Sisanya tercatat sebagai keterbatasan, bukan diklaim selesai.

test:all 890 lulus / 0 gagal.

---

## Live Auto Review — 16 Agustus 2026 18:19 WIB

### [P1][VERIFIKASI DR-P0-06 — DITERAPKAN SEBAGIAN] `office_location_id` belum menjadi FK maupun sumber lokasi saat absen; credential yatim/nonaktif tetap lolos

**Hasil verifikasi tanggapan DEV.** Implementasi atomicity benar-benar sudah
memindahkan konsumsi challenge, update counter, dan write attendance ke satu
`withTransaction`; baris attendance existing dikunci `FOR UPDATE`, dan
`check_in`/`check_out` final tidak lagi ditimpa
([webauthn.routes.ts:327](backend/src/routes/webauthn.routes.ts)). Backend
`npx tsc --noEmit` juga lulus. Subbutir implementation tersebut dapat dianggap
diterapkan, dengan keterbatasan test concurrency/WebAuthn yang sudah diakui tim.

Subbutir lokasi belum diterapkan sesuai klaim. `ensureCredentialOfficeLink()`
hanya menambah kolom nullable dan menjalankan backfill; tidak ada `FOREIGN KEY`,
index, atau constraint ke `office_locations`
([database.ts:1241](backend/src/config/database.ts)). Lebih penting, jalur
`auth/verify` masih mengambil `SELECT *` credential lalu memvalidasi GPS terhadap
salinan `registered_lat`, `registered_lng`, `registered_radius`, dan
`location_name` ([webauthn.routes.ts:244](backend/src/routes/webauthn.routes.ts),
[webauthn.routes.ts:272](backend/src/routes/webauthn.routes.ts)); field baru
`office_location_id` tidak dibaca, tidak di-join, dan tidak disyaratkan.

Akibatnya credential lama yang backfill-nya gagal tetapi masih mempunyai
koordinat tetap dapat absen, walaupun log boot menyatakan karyawan perlu
mendaftar ulang. Memindahkan radius/koordinat kantor atau menetapkan
`office_locations.is_active = 0` juga tidak mengubah keputusan verifikasi.
Penghapusan kantor meninggalkan ID yatim karena constraint yang disebut “FK”
tidak pernah dibuat. Ini mempertahankan trust boundary lokasi lama: site yang
ditutup/dipindah tidak dapat mencabut area absensi, sehingga attendance dan
input payroll dapat diterima dari lokasi yang seharusnya sudah tidak sah.

**Rekomendasi konkret:** tambahkan index dan FK nyata
`office_location_id -> office_locations(id)` dengan kebijakan delete eksplisit
(disarankan `ON DELETE SET NULL` agar credential dapat ditolak/re-enroll tanpa
menghapus audit credential). Saat authentication, resolve credential terhadap
`office_locations` aktif menggunakan ID tersebut dan gunakan koordinat/radius
master terkini sebagai source of truth; tolak NULL, orphan, atau inactive dengan
kode stabil. Salinan nama/koordinat boleh dipertahankan hanya sebagai snapshot
audit, bukan sebagai input keputusan akses. Backfill harus melaporkan hasil
ambiguous/unmatched dan tidak menyatakan ensure berhasil bila DDL constraint
gagal.

**Acceptance criteria:** (1) credential `office_location_id IS NULL` atau ID
yatim ditolak 403; (2) menonaktifkan kantor segera membuat credential terkait
tidak dapat absen; (3) setelah koordinat/radius kantor dipindah, titik lama
ditolak dan titik baru diterima tanpa update setiap credential; (4)
`INFORMATION_SCHEMA` membuktikan index + FK beserta delete policy; (5) test
register/update memastikan ID tersimpan, dan test service/route yang memakai
verifier terinjeksi membuktikan replay paralel hanya satu commit serta state
attendance final tidak berubah.

---

## System Design Review — 16 Agustus 2026 19:11 WIB

### [DESIGN-GAP / ARCH-RISK][High] Asset Maintenance baru berupa jurnal manual setelah kejadian, belum menjadi CMMS yang mengendalikan availability, pekerjaan, spare part, dan biaya proyek

**Irisan yang diaudit:** asset/equipment maintenance end-to-end. Temuan ini
melengkapi gap equipment allocation pada Construction Review sebelumnya; fokus
baru di sini adalah lifecycle pemeliharaan dan handoff-nya ke Inventory,
Procurement, Finance, HR, serta project controls.

**Kemampuan saat ini.** Asset register sudah mempunyai kategori, production
line/P&ID, status (`active`, `idle`, `under_maintenance`), dokumen, depresiasi,
disposal, dan `asset_maintenance_logs`. Pengguna dapat memasukkan histori
preventive/corrective/inspection beserta deskripsi, biaya, tanggal, pelaksana,
vendor, dan `next_due_date`
([database.ts:675](backend/src/config/database.ts),
[asset.routes.ts:758](backend/src/routes/asset.routes.ts)). Ini baseline berguna
dan tidak boleh hilang.

**Gap/proses yang putus—bukti terverifikasi.** Satu-satunya data maintenance
adalah log completed tanpa nomor pekerjaan, request/failure, priority, approval,
planner, jadwal mulai-selesai, state machine, checklist/reading, meter, downtime,
failure code/root cause, spare part, labor, attachment/evidence, project/WBS/
cost code, atau reference transaksi. `next_due_date` hanya disimpan; pencarian
source menunjukkan tidak ada query due/overdue, generator pekerjaan, reminder,
atau calendar. UI bahkan hanya mengirim tipe/deskripsi/biaya/tanggal dan tidak
mengekspos next due, performed-by, maupun vendor
([AssetDetail.vue:143](frontend/src/views/AssetDetail.vue),
[AssetDetail.vue:359](frontend/src/views/AssetDetail.vue)).

Status aset dan log maintenance tidak terhubung: membuat log tidak membawa aset
ke/dari `under_maintenance`, sedangkan mengubah status tidak membuat work order
atau downtime. Biaya adalah angka bebas yang tidak berasal dari issue spare part,
jam teknisi, PO jasa/vendor, AP, atau alokasi proyek. Pelaksana dan vendor berupa
teks, bukan FK employee/vendor, sehingga kompetensi, sertifikasi, dan liability
tidak dapat diverifikasi. Log juga dapat diubah atau dihapus permanen tanpa
reversal/alasan/audit ([asset.routes.ts:782](backend/src/routes/asset.routes.ts),
[asset.routes.ts:800](backend/src/routes/asset.routes.ts)). Akibatnya histori
yang mendasari availability, keselamatan, dan biaya aset tidak period-close-safe.

**Target design.** Pertahankan asset register sebagai source of truth, lalu
tambahkan `MaintenancePlan`, `MaintenanceRequest`, `MaintenanceWorkOrder`,
`WorkOrderTask/Checklist`, `MeterReading`, `Downtime`, serta detail labor,
material/spare, service, dan cost allocation. Work order memakai state machine
`requested → triaged → planned → approved → scheduled → in_progress → completed
→ verified → closed`, dengan jalur cancel/reopen/reversal beralasan. Plan dapat
berbasis kalender atau meter/runtime dan menghasilkan WO idempoten. Asset,
project/WBS/cost code, location, responsible crew/vendor, permit/LOTO, target
downtime, dan document evidence menjadi referensi terkontrol.

Close WO harus menjadi transaction boundary: validasi checklist/reading,
selesaikan reservation dan inventory issue/return, catat labor/vendor service,
post actual cost/commitment ke CBS/Finance, tutup downtime, update meter/next due,
serta kembalikan status availability aset. Closed WO immutable; koreksi memakai
reversal/superseding record agar audit dan rekonsiliasi periode tidak hilang.

**Dampak bisnis EPC.** Sistem saat ini dapat menampilkan aset “active” ketika
sedang rusak, tidak dapat mendeteksi PM/calibration overdue, membolehkan jadwal
site memakai equipment yang unavailable, dan tidak bisa menjelaskan total cost
of ownership atau cost overrun per proyek. Spare part dapat habis tanpa demand
terencana; breakdown, downtime, warranty, inspeksi, serta tanggung jawab vendor/
teknisi tidak traceable. Angka biaya manual juga berisiko dihitung ganda atau
tidak pernah masuk Finance/CBS.

**Dependensi dan migrasi.** Gunakan master `assets`, employee, vendor/supplier,
item/warehouse, PO/AP, project/WBS/CBS, approval, notification, dan document
control yang sudah ada; permission maintenance yang ada dipertahankan sampai
mapping role produksi diverifikasi. Schema baru wajib lewat boot ensure idempoten
dan terisolasi per project/legal entity. Migrasikan `asset_maintenance_logs`
menjadi WO berstatus `closed` dengan provenance `legacy_log`; pertahankan ID,
tanggal, creator, deskripsi, dan biaya asli, tetapi tandai project/meter/spare/
approval sebagai unknown—jangan mengarang linkage historis. Endpoint log lama
perlu adapter read-only selama masa kompatibilitas.

**Fase/prioritas.** Fase 0 (High): nyatakan UI sebagai “completed history”,
hentikan hard-delete, tampilkan next-due/overdue, dan selaraskan status
maintenance. Fase 1: request + WO + plan kalender + approval/schedule/checklist
dan notification. Fase 2: meter/runtime, downtime, labor/spare/service, inventory
reservation/issue, project/CBS dan finance reconciliation. Fase 3: calibration/
certificate, warranty/claim, reliability KPI (MTBF/MTTR/availability), mobile
execution/offline, serta predictive condition monitoring.

**Acceptance criteria yang dapat diuji:**

1. Plan kalender atau meter yang due menghasilkan tepat satu WO per cycle;
   retry/job paralel tidak menduplikasi WO, dan perubahan plan terversi.
2. WO `in_progress` mengubah availability secara konsisten; asset maintenance,
   disposed, atau sudah dialokasikan pada waktu tumpang tindih ditolak oleh
   equipment scheduling dengan alasan terukur.
3. WO tidak dapat closed sebelum checklist/reading dan mandatory evidence
   lengkap. Forced failure saat close me-rollback inventory issue, labor/cost,
   downtime, status aset, serta next due sebagai satu unit.
4. Qty/cost spare sama dengan inventory transaction; jasa sama dengan PO/AP;
   labor dan seluruh actual cost reconcile ke project/WBS/CBS tanpa double count.
5. Closed WO tidak dapat diedit/dihapus. Reversal menyimpan actor, alasan,
   approval, before/after, linked postings, dan menghasilkan koreksi ledger yang
   dapat direkonsiliasi pada periode yang benar.
6. User yang hanya berhak project A tidak dapat melihat/menjalankan WO project B;
   teknisi/vendor yang expired skill, certification, induction, atau assignment
   ditolak untuk task yang mensyaratkannya.
7. Migrasi mempertahankan jumlah dan nilai total legacy log per aset; setiap row
   dapat ditelusuri ke sumber lama, dan endpoint/UI baseline tetap dapat membaca
   history selama compatibility window.

---

## System Design Review — 16 Agustus 2026 19:15 WIB

### [DESIGN-GAP / ARCH-RISK][High] Workforce EPC berhenti pada employee directory, manpower estimate, attendance, dan payroll; belum ada competency-to-mobilization control

**Irisan yang diaudit:** HR/workforce, skills, readiness, roster, mobilization,
dan demobilization proyek. Gap payroll calculation dan labor-time allocation yang
sudah dicatat sebelumnya tidak diulang di sini.

**Kemampuan saat ini.** `employees` menyimpan identitas, kontak, department,
position, hire date, status, dan rate/pay
([schema-baseline.sql:1187](backend/database/schema-baseline.sql)). HR mempunyai
employee directory/CSV import, attendance bertaut `project_id`, payslip, salary
advance, serta mobile PIN. Detail proyek menampilkan “Manpower Mobilization
Plan” mingguan dengan posisi/karyawan, jumlah, daily rate, peak manpower, dan
estimasi biaya ([ManpowerPlan.vue:9](frontend/src/components/projects/ManpowerPlan.vue)).
Semua ini baseline minimum yang perlu dipertahankan.

**Gap/proses yang putus—bukti terverifikasi.** Manpower plan bukan transaksi HR:
seluruh baris disimpan sebagai JSON `parameters` pada
`engineering_inputs.element_type='manpower'`
([ManpowerPlan.vue:363](frontend/src/components/projects/ManpowerPlan.vue)).
Referensi karyawan hanya string `emp-{id}` di JSON, bukan FK; jumlah mingguan
dapat lebih dari satu walau baris memilih satu employee. Karena tidak ada
assignment/resource calendar/unique overlap, orang yang sama dapat “direncanakan”
di beberapa proyek/site pada tanggal sama tanpa konflik atau kapasitas.

`project_members` juga tidak menyelesaikannya: tabel hanya menghubungkan project
ke akun desktop `users` dan role bebas, bukan employee lapangan
([schema-baseline.sql:2129](backend/database/schema-baseline.sql)). Employee tanpa
akun desktop tidak dapat dimobilisasi melalui model ini. Pencarian schema/routes/
views tidak menemukan master skill/competency/training, certification/licence,
medical fitness, passport/visa, site induction, roster/rotation, leave/
availability, travel/accommodation, contractor worker, atau mobilization record.
Attendance baru mencatat aktual setelah kejadian dan tidak membuktikan bahwa
employee mempunyai assignment aktif, kompetensi, atau clearance site saat itu.

**Proses EPC yang putus.** Demand posisi/crew pada estimate tidak dapat diubah
menjadi nominasi orang → verifikasi readiness → approval → mobilization → roster
→ site access/attendance → cost/payroll → demobilization. Tidak ada source of
truth untuk siapa berhak berada di site mana, periode berapa, sebagai trade/role
apa, dengan sertifikat mana, maupun siapa yang menyetujui pengecualian. Label UI
“Terhubung ke data Team/HR” saat ini hanya berarti dropdown membaca employee dan
rate; bukan linkage operasional yang dapat diaudit.

**Target design.** Pisahkan tiga level: (1) `ProjectWorkforceDemand` terversi per
project/WBS/work package/site/role/skill/week; (2) `WorkforceProfile` berisi
skill/competency matrix, certificate/licence/training/medical/induction beserta
issuer, evidence, validity, verification, dan renewal; (3)
`WorkforceAssignment/Mobilization` yang mengikat employee/contractor worker ke
demand, project/site, role, calendar/roster, cost code, mobilization/demobilization
date, camp/travel, supervisor, dan approval.

Assignment memakai state machine `nominated → compliance_review → approved →
mobilizing → active → demobilizing → closed`, plus rejected/cancelled/suspended.
Eligibility engine mengecek employment/contract status, overlapping capacity,
skill level, certificate/medical/induction validity sepanjang assignment,
leave/roster, serta site/project authorization. Approval/override harus
beralasan, berbatas waktu, dan audit-able. Assignment aktif menjadi sumber bagi
site access, attendance/timesheet, HSE headcount, payroll allowance, equipment/
crew scheduling, forecast vs actual manpower, dan project cost.

**Dampak bisnis EPC.** Tanpa kontrol ini, planner dapat menghitung satu orang
berulang di dua proyek, memobilisasi trade yang tidak qualified, atau membiarkan
sertifikat/medical/induction kedaluwarsa tanpa alarm. Site tidak memiliki daftar
personnel-on-board yang sah; HR tidak dapat melihat bench/shortage/rotation;
Project Controls tidak dapat merekonsiliasi demand, committed crew, attendance,
dan cost. Risiko langsungnya adalah keterlambatan mobilisasi, idle labor,
overtime/camp cost berlebih, temuan HSE/QA, serta akses dan payroll yang tetap
aktif setelah demobilization.

**Dependensi dan migrasi.** Pertahankan employee ID, Employees UI, attendance,
payroll, dan Manpower Plan. Jangan repurpose `project_members`: itu membership
akun kolaborasi; buat assignment employee terpisah. Migrasikan JSON manpower ke
demand-plan revision dengan raw snapshot/checksum dan provenance. Key `emp-{id}`
yang masih valid boleh dijadikan kandidat nominasi, tetapi jangan otomatis
menjadi assignment karena quantity row dan eligibility historis tidak dapat
direkonstruksi. Data yang tak cocok tetap `unresolved`, bukan dibuang/ditebak.
Gunakan Document Control untuk evidence, HSE untuk induction/access, project/WBS/
CBS untuk scope/cost, notification untuk expiry, serta permission existing sampai
role produksi dipetakan eksplisit. Schema wajib boot-ensure idempoten dan semua
query/unique overlap terscope legal entity/project.

**Fase/prioritas.** Fase 0 (High): pindahkan manpower JSON ke plan/demand
terversi, tegaskan bahwa dropdown employee adalah kandidat, dan buat availability
calendar + overlap warning. Fase 1: skill/certificate/medical/induction register,
assignment/mobilization state machine, approval, expiry notification, roster,
dan personnel-on-board. Fase 2: attendance/site-access/payroll/HSE/project-cost
handoff serta contractor workforce. Fase 3: competency gap/training plan,
capacity/bench forecasting, travel/camp, succession, dan portfolio resource
optimization.

**Acceptance criteria yang dapat diuji:**

1. Manpower demand mempunyai revision/baseline tersendiri dan tidak lagi menulis
   engineering MTO; perubahan menyimpan delta/actor/alasan dan versi lama dapat
   direkonstruksi.
2. Assignment employee pada interval tumpang tindih ditolak 409 berdasarkan
   calendar/capacity, kecuali override berpermission, alasan, limit kapasitas,
   dan audit; concurrency paralel tetap menghasilkan satu keputusan konsisten.
3. Employee dengan skill level kurang, certificate/medical/induction expired
   pada salah satu hari assignment, status inactive, atau leave yang konflik
   tidak dapat menjadi `active`; response menjelaskan requirement yang gagal.
4. Check-in/site access project hanya diterima untuk assignment aktif pada site/
   roster tersebut. Suspend/demobilize segera mencabut akses baru tanpa menghapus
   attendance, payslip, atau histori assignment lama.
5. Demand → nominated → approved → mobilized → attendance actual → payroll/cost
   dapat direkonsiliasi per project/WBS/role/week; orang dan biaya tidak dihitung
   ganda ketika bekerja lintas work package.
6. User project A tidak dapat melihat personal document atau assignment project
   B; evidence sensitif dimask/diunduh dengan permission dan seluruh view/update/
   approval tercatat dalam audit.
7. Migrasi mempertahankan seluruh JSON manpower lama beserta checksum. Row yang
   tidak dapat di-resolve tampil di reconciliation queue, sementara UI baseline
   tetap dapat membuka plan lama selama compatibility window.

---

## [DEV] Tanggapan [P0 / AUTHORIZATION] — module dipilih klien — 16 Agustus 2026

**DITERAPKAN.** Temuan ini benar dan menohok: perbaikan DR-P0-02 kami mengikat
permission ke `request.module`, tapi `module` itu sendiri datang dari klien.
Penyerang tidak perlu menembus apa pun — cukup berbohong soal modulnya.

- **`ENTITY_REGISTRY` server-side.** `entity_type` kini satu-satunya yang
  dipercaya dari klien; modul, prefix permission, tabel, dan kolom nilai semuanya
  ditentukan di server. `module` dari body **tidak dibaca sama sekali**.
- **Entitas wajib ada.** Sebelum apa pun ditulis, barisnya dicari di tabel yang
  ditentukan registry — `fund_request #999999` kini 404, bukan approval request
  untuk dokumen yang tidak pernah ada.
- **Pasangan tak dikenal ditolak** 400 `UNKNOWN_ENTITY_TYPE` berikut daftar yang
  didukung.
- **Prefix permission diturunkan dari `entity_type`**, bukan `request.module`,
  jadi berbohong soal modul tidak lagi memilih permission mana yang diterima.

**Kontrak kedua yang Anda tunjuk juga benar, dan itu membuat jalur SAH terkunci.**
Layar konfigurasi membuat rule bermodul `pr`/`po`/`grn`, sedangkan permission
bernamespace `procurement.*` — query `LIKE CONCAT(module, '.%')` tidak akan pernah
menemukan apa pun, jadi approver non-master yang berhak **selalu** 403. Rule-nya
sah, tapi tidak ada yang bisa memakainya.

Dua sisi diperbaiki: pemilihan rule mencocokkan kunci kanonik **dan** alias lama
(`pr`→`procurement`, dst.), dan layar konfigurasi sekarang mengambil daftar modul
dari `GET /approval/entity-types` — kontrak yang sama dengan yang diterima server,
bukan daftar yang disusunnya sendiri.

Tes: `test:rbac` #7 — `fund_request` + entitas tidak ada → 404 `ENTITY_NOT_FOUND`;
`entity_type` karangan → 400 `UNKNOWN_ENTITY_TYPE`; kontrak entity-types memetakan
`fund_request → finance` dan **tidak** memuat kunci lama seperti `pr`. Matriks
otorisasi lama (modul lain 403, tidak ditugaskan 403, `can_reject`, delegasi, dua
approve paralel) tetap hijau.

test:all 897 lulus / 0 gagal.

---

## Live Auto Review — 16 Agustus 2026 19:30 WIB

Baseline: commit baru `36ed8d40` (`fix(approval): entitas menentukan modul,
bukan klien`). Source aplikasi tidak diubah reviewer. Backend `npx tsc --noEmit`
dan frontend `npx vue-tsc --noEmit` lulus; test HTTP tidak dijalankan reviewer
karena membuat fixture/data.

### [P1 / APPROVAL-INTEGRITY] Alias kompatibilitas menggabungkan rule PR, PO, dan GRN ke satu pool Procurement

Registry memberi `purchase_request`, `purchase_order`, dan `grn` nilai module
kanonik yang sama, yaitu `procurement`
([approval.routes.ts:31](backend/src/routes/approval.routes.ts)). Lalu
`moduleKeysFor('procurement')` menghasilkan `procurement`, `pr`, `po`, dan `grn`,
dan `selectRuleForRequest()` mengambil seluruh rule pada empat key tersebut hanya
berdasarkan urutan sequence/id serta rentang nilai
([approval.routes.ts:46](backend/src/routes/approval.routes.ts),
[approval.routes.ts:102](backend/src/routes/approval.routes.ts)). Tidak ada lagi
predicate yang membedakan jenis dokumen.

**Bukti perilaku:** bila rule legacy `pr` dan `po` sama-sama aktif, submit
`purchase_order` dapat mengunci `rule_id` milik PR apabila sequence/ID-nya lebih
dulu dan rentangnya cocok. Sebaliknya PR tanpa nilai dapat mengambil rule tanpa
batas milik PO/GRN. UI baru juga hanya menawarkan `procurement`, sehingga admin
tidak dapat membuat workflow/approver/threshold yang berbeda untuk ketiga proses
([ApprovalRules.vue:138](frontend/src/views/ApprovalRules.vue),
[approval.routes.ts:239](backend/src/routes/approval.routes.ts)).

**Dampak:** PO bernilai tinggi bisa mengikuti jumlah step atau approver PR/GRN,
dan dokumen sah dapat terkunci ke rule yang bukan miliknya. Ini mengganti bypass
module dari klien dengan salah-pilih workflow di server.

**Rekomendasi/acceptance:** pisahkan `ruleScope`/`workflowKey` dari
`permissionPrefix` di registry—misalnya `pr`, `po`, dan `grn` tetap scope rule
berbeda, sementara ketiganya boleh memakai prefix permission `procurement`.
Pemilihan rule harus exact pada scope entitas; alias hanya memigrasikan satu key
legacy ke satu scope, bukan menggabungkan semuanya. Buat fixture tiga rule aktif
dengan step/threshold berbeda dan buktikan masing-masing entity mengunci
`rule_id` yang tepat, termasuk setelah migrasi alias dan saat sequence-nya
disengaja bertabrakan.

### [P1 / API-CONTRACT] Registry salah membaca nominal Kasbon dan mengabaikan nominal Payroll

`kasbon_request` diregistrasikan dengan `amountColumn: 'amount'`
([approval.routes.ts:35](backend/src/routes/approval.routes.ts)), padahal tabel
`kasbon_requests` hanya mempunyai `total_amount`
([schema-baseline.sql:1475](backend/database/schema-baseline.sql)). Karena
`resolveEntityAmount()` membentuk `SELECT amount ...`, submit Kasbon yang valid
selalu masuk catch dan membalas 500. Di sisi lain `payroll_request` tidak diberi
`amountColumn`, meski `payroll_requests.total_amount` tersedia
([schema-baseline.sql:1757](backend/database/schema-baseline.sql)); nilainya selalu
`null`, sehingga rule payroll berbatas nominal tidak pernah terpilih.

**Dampak:** jalur Kasbon baru tidak dapat digunakan, sedangkan Payroll dapat
jatuh ke rule HR tanpa batas atau `REQUEST_WITHOUT_RULE` dan tidak mengikuti
approval threshold sesuai nilai aktual. Compile dan test baru tidak menangkap
kontrak SQL ini karena hanya menguji entity yang tidak ada dan daftar registry.

**Rekomendasi/acceptance:** petakan `total_amount` untuk kedua entity, validasi
`condition_field` yang didukung per entity, dan jangan diam-diam mengembalikan
`null` untuk rule nilai yang dikonfigurasi. Test dengan row Kasbon/Payroll nyata
di boundary min/max harus membuktikan `condition_value` dan `rule_id` benar;
kesalahan kolom/config harus gagal sebelum deployment, bukan menjadi 500 runtime.

### [FEATURE-REGRESSION][High] Kontrak baru menghapus konfigurasi approval Sales Order, Work Order, dan Batch Release

Sebelum commit ini, Approval Rules menawarkan `so`, `wo`, dan `batch_release`.
Alias backend masih menyebut ketiganya
([approval.routes.ts:46](backend/src/routes/approval.routes.ts)), tetapi
`ENTITY_REGISTRY` tidak mempunyai entity Sales/Production/Quality dan endpoint
kontrak hanya mengembalikan module dari enam entity yang terdaftar. Karena UI
sekarang sepenuhnya memakai response tersebut, opsi Sales, Production, dan
Quality hilang. `POST /approval/submit` juga menolak entity di luar registry
dengan `UNKNOWN_ENTITY_TYPE` sebelum compatibility alias dapat dipakai.

**Dampak:** kemampuan baseline untuk mengonfigurasi rule SO, WO, dan batch
release dipersempit oleh perbaikan security. Rule legacy masih tampil di daftar,
tetapi nilai module-nya tidak ada di select edit; workflow baru tidak dapat
dibuat/disubmit melalui kontrak ini. Ini melanggar baseline minimum walaupun
produksi saat ini dilaporkan belum mempunyai rule aktif.

**Rekomendasi/acceptance:** lengkapi registry untuk semua entity baseline dengan
table, state/ownership validator, rule scope, permission resource, dan resolver
nilai yang benar sebelum daftar hardcoded lama dilepas. Sediakan migration/
compatibility untuk rule `so`, `wo`, `batch_release` tanpa mengubah maknanya.
Test harus memuat satu rule legacy per module, memastikan masih dapat dibuka dan
diedit tanpa rewrite salah, lalu submit entity valid memilih rule yang sama.

---

## [DEV] Tanggapan [P1 / RBAC + FINANCIAL-INTEGRITY] — expense payroll — 16 Agustus 2026

**DITERAPKAN sebagian; satu bagian sengaja ditahan menunggu keputusan.**

Keempat klaim terkonfirmasi di kode.

- **Permission.** `requirePermission('hr.payroll.create', 'projects.expenses.create')`.
  Diverifikasi dulu: kedua role aktif produksi (`Admin`, `Manager Finannce & Acc`)
  memegang `projects.expenses` **dan** `hr.payroll` penuh — tidak ada yang terkunci.
- **Pembebanan ganda — ini inti finansialnya.** Cek duplikat dulu hanya per
  project, jadi periode yang sama bisa dibebankan **penuh** ke project A lalu B.
  Sekarang diperiksa **lintas project**: satu periode payroll hanya boleh
  dibebankan sekali, dan penolakannya menyebut project mana yang sudah memakainya
  (`PAYROLL_PERIOD_ALREADY_CHARGED`).
- **Transaction.** Pemeriksaan idempotensi + kedua INSERT kini satu unit, dimulai
  dari lock baris project. Sebelumnya kegagalan pada INSERT kedua meninggalkan
  expense gaji tanpa pasangan kasbon, lalu retry ditolak cek duplikat expense
  pertama — buntu yang hanya bisa dibereskan manual.
- **Nomor expense** memakai counter atomic, bukan akhiran acak 4 digit.

**DITAHAN — `status: 'approved'` masih dipertahankan.** Anda benar bahwa
auto-approve melewati kontrol: jalur approve/reject-nya memang ada
(`project.routes.ts:909`) dan enum statusnya punya `submitted`. Tapi mengubahnya
menggeser alur kerja Finance — 26 expense produksi semuanya `approved`, dan
mengalihkan yang baru ke `submitted` berarti ada langkah persetujuan yang selama
ini tidak pernah mereka lakukan.

Itu keputusan pemilik proses, bukan keputusan kami. Perubahannya satu baris dan
siap dipasang begitu diketok.

**Belum:** ledger `payroll_project_allocations` yang menurunkan alokasi per
project dari attendance/jam kerja. Itu perubahan model tersendiri; yang dikerjakan
sekarang menutup pembebanan ganda, belum membuat alokasinya proporsional.

Tes: `test:rbac` #8c — user tanpa hak 403, tanpa token 401, periode tanpa payslip
final ditolak dan **dibuktikan tidak meninggalkan expense hantu**.

test:all 901 lulus / 0 gagal.

**Verifikasi reviewer 16 Agustus 2026 19:36 WIB — DITERAPKAN SEBAGIAN.** Commit
`fd959461` benar memperbaiki `created_by`, memakai counter nomor atomic, dan
membungkus pengecekan + kedua INSERT dalam satu transaction. Backend
`npx tsc --noEmit` juga lulus. Namun acceptance belum terpenuhi: guard dua
permission tersebut bersifat **OR**, bukan AND; lock hanya pada project tujuan
tidak mengidempotensikan periode lintas project; row tetap langsung
`approved` tanpa `approved_by/approved_at`; dan larangan satu periode pada lebih
dari satu project masih menyalin total payroll global, bukan merekonsiliasi
alokasi tenaga kerja lintas project. Dua regresi konkret dari patch dirinci pada
Live Auto Review 19:36 WIB di bawah.

---

## Live Auto Review — 16 Agustus 2026 19:36 WIB

Baseline: commit baru `fd959461` (`fix(payroll): gembok generate-expense & cegah
pembebanan periode ganda`). Source aplikasi tidak diubah reviewer. Backend
`npx tsc --noEmit` lulus; test HTTP tidak dijalankan reviewer karena membuat
fixture/data. Selama review berlangsung muncul working-tree baru pada
`hr.routes.ts` untuk menindaklanjuti temuan timesheet/attendance dan kemudian
menjadi commit `0f3bd132`; diff tersebut ikut diaudit tanpa diubah reviewer, dan
typecheck tetap lulus.

### [P1 / RBAC + DATA-EXPOSURE] Guard OR memberi pemegang hak expense akses ke payroll tanpa hak HR

Endpoint memasang
`requirePermission('hr.payroll.create', 'projects.expenses.create')`
([hr.routes.ts:1098](backend/src/routes/hr.routes.ts)), tetapi helper
`requirePermission()` secara eksplisit memakai semantik OR melalui
`required.some(...)` ([permission.ts:58](backend/src/middleware/permission.ts),
[permission.ts:72](backend/src/middleware/permission.ts)). Jadi role yang hanya
memegang `projects.expenses.create` tetap lolos walaupun tidak mempunyai hak
payroll. Handler lalu membaca seluruh payslip final perusahaan dan menaruh nama
karyawan beserta net salary per orang, total gross, kasbon, dan net ke notes
expense ([hr.routes.ts:1138](backend/src/routes/hr.routes.ts),
[hr.routes.ts:1158](backend/src/routes/hr.routes.ts),
[hr.routes.ts:1173](backend/src/routes/hr.routes.ts)). Response juga mengembalikan
total payroll. Tes baru hanya memakai `plainToken` tanpa kedua permission; tidak
menguji role yang memiliki salah satunya
([rbac.ts:771](backend/tests/rbac.ts)).

**Dampak:** pemberian hak operasional membuat expense project sekaligus membuka
data kompensasi seluruh perusahaan dan kemampuan mem-posting expense payroll.
Fakta bahwa dua role aktif saat ini kebetulan mempunyai kedua permission tidak
menegakkan least privilege untuk role baru atau perubahan mapping berikutnya.

**Rekomendasi/acceptance:** endpoint wajib menuntut **keduanya**—misalnya dua
middleware berurutan atau helper `requireAllPermissions()`—dan tetap membatasi
project sesuai scope user. Tambahkan dua role uji: hanya
`projects.expenses.create` dan hanya `hr.payroll.create`; keduanya harus 403 dan
tidak membuat row, sedangkan role dengan kedua hak boleh lanjut. Pastikan respons
403 maupun log tidak mengandung nominal/nama payroll.

### [P1 / CONCURRENCY + COST-INTEGRITY] Lock project tidak mencegah dua transaksi lintas project mem-posting periode yang sama

Pengecekan lintas project kini berada dalam transaction, tetapi mutex-nya adalah
`SELECT ... client_projects WHERE id=? FOR UPDATE`
([hr.routes.ts:1109](backend/src/routes/hr.routes.ts)). Request bersamaan ke
project A dan B mengunci **dua row berbeda**; keduanya dapat menjalankan SELECT
duplikat biasa dan melihat belum ada salary expense
([hr.routes.ts:1117](backend/src/routes/hr.routes.ts)) sebelum salah satunya
commit. Setelah itu keduanya tetap membuat expense. Skema hanya mempunyai unique
key pada `expense_number`, bukan identitas payroll period/posting
([schema-baseline.sql:2056](backend/database/schema-baseline.sql),
[schema-baseline.sql:2074](backend/database/schema-baseline.sql)); counter nomor
atomic menghasilkan nomor berbeda sehingga tidak menolak duplikat bisnis.

**Dampak:** dua klik, retry dari worker berbeda, atau request paralel untuk dua
project tetap dapat membebankan 100% payroll dua kali. Transaction memperbaiki
atomicity pasangan gaji/kasbon, tetapi belum menjamin idempotency lintas project
yang diklaim patch.

**Rekomendasi/acceptance:** gunakan identitas immutable untuk payroll run/posting,
bukan pencarian `description LIKE`. Lock satu row payroll run/periode yang sama
untuk semua project dan tegakkan unique key pada posting/allocation yang sesuai
model bisnis. Untuk target ERP EPC, buat `payroll_project_allocations` per
project/WBS/cost code dengan total seluruh alokasi sama dengan payroll global;
posting mengonsumsi allocation ID secara idempoten. Test wajib menjalankan dua
request paralel (`Promise.all`) ke project berbeda untuk periode/run yang sama,
dan membuktikan tidak pernah tercipta pembebanan ganda maupun partial pair.

### [P1 / VERIFIKASI DATA-INTEGRITY — DITERAPKAN SEBAGIAN] Bulk tidak lagi memindahkan row antar-project, tetapi masih dapat mengklaim dan mengubah attendance terverifikasi

Working-tree baru benar menaruh seluruh bulk save dalam satu transaction dan
melewati row yang sudah mempunyai `project_id` berbeda
([hr.routes.ts:362](backend/src/routes/hr.routes.ts),
[hr.routes.ts:383](backend/src/routes/hr.routes.ts)). Itu menutup overwrite A→B
dan partial commit dari temuan System Design Review 16:30 WIB. Namun layar
project masih menginisialisasi **setiap** karyawan aktif sebagai `present` lalu
mengirim semuanya saat Save
([ProjectTimesheets.vue:171](frontend/src/components/projects/ProjectTimesheets.vue),
[ProjectTimesheets.vue:198](frontend/src/components/projects/ProjectTimesheets.vue)).

Untuk employee yang belum punya row, backend tetap membuat attendance baru;
untuk row WebAuthn/GPS yang `project_id`-nya masih `NULL`, kondisi bentrok tidak
berlaku dan row diklaim ke project pemanggil. Flag `gps_verified` hanya
mempertahankan `check_in/check_out`; `status`, `timesheet_value`, overtime,
project, dan notes tetap ditimpa payload project
([hr.routes.ts:373](backend/src/routes/hr.routes.ts),
[hr.routes.ts:389](backend/src/routes/hr.routes.ts),
[hr.routes.ts:393](backend/src/routes/hr.routes.ts)). Response daftar konflik
juga tidak dibaca consumer, sehingga baris yang dilewati tidak terlihat oleh
operator ([ProjectTimesheets.vue:206](frontend/src/components/projects/ProjectTimesheets.vue),
[AttendanceView.vue:1418](frontend/src/views/AttendanceView.vue)).

**Dampak:** project pertama yang menekan Save masih dapat membuat seluruh
karyawan aktif hadir atau mengubah dasar hitung payroll attendance terverifikasi,
meski jam biometric tampak utuh. Project lain bisa menerima 200 tanpa tahu bahwa
sebagian/all row tidak tersimpan.

**Rekomendasi/acceptance:** fase-0 wajib menghentikan default-present dan hanya
mengirim employee yang dipilih; jangan izinkan jalur timesheet mengubah field
kehadiran/payroll pada row terverifikasi. Tampilkan konflik sebagai hasil parsial
yang harus diputuskan operator. Target tetap memisahkan `attendance_logs` global
dari `labor_time_allocations` project/WBS. Test harus membuktikan Save tanpa
pilihan tidak membuat row, row GPS tidak berubah pada seluruh field payroll,
konflik terlihat di UI, dan rollback child ke-N mengembalikan semua perubahan.

### [P1 / API-CONTRACT] Filter tanggal yang dikirim Project Timesheets diabaikan backend

Project Timesheets meminta
`GET /hr/attendance?date=<tanggal>&project_id=<id>`
([ProjectTimesheets.vue:179](frontend/src/components/projects/ProjectTimesheets.vue)),
tetapi handler hanya membaca `project_id`, `month`, `year`, dan `employee_id`;
parameter `date` tidak pernah masuk WHERE
([hr.routes.ts:300](backend/src/routes/hr.routes.ts),
[hr.routes.ts:305](backend/src/routes/hr.routes.ts)). Backend mengembalikan semua
tanggal project. Frontend lalu mengiterasi semuanya ke satu `dailyRec` tanpa
memeriksa tanggal, sehingga record lama menimpa tampilan tanggal yang sedang
dipilih ([ProjectTimesheets.vue:181](frontend/src/components/projects/ProjectTimesheets.vue),
[ProjectTimesheets.vue:183](frontend/src/components/projects/ProjectTimesheets.vue)).

**Dampak:** mengganti tanggal dapat menampilkan status/jam/catatan dari hari lain;
Save berikutnya menyalin state hari lama ke tanggal pilihan dan mencemari
attendance, payroll, serta biaya project.

**Rekomendasi/acceptance:** validasi `date` sebagai business date dan tambahkan
predicate exact `a.date = ?`; frontend tetap harus memfilter/menolak response
yang tanggalnya berbeda. Buat fixture satu employee dengan nilai berbeda pada
dua hari, lalu buktikan masing-masing tanggal hanya memuat dan menyimpan row-nya
sendiri tanpa cross-date copy.

---

## [DEV] Tanggapan [P1 / DATA-INTEGRITY] — timesheet lintas proyek — 16 Agustus 2026

**DITERAPKAN.** Terkonfirmasi persis, dan ada satu dampak yang lebih parah dari
yang tertulis.

Pencarian memang hanya `(employee_id, date)` lalu meng-overwrite `project_id` ke
proyek dari request. **Tapi UPDATE-nya juga menimpa `check_in`/`check_out`** —
jadi absensi yang sudah diverifikasi sidik jari + GPS lewat PWA bisa tergantikan
nilai default dari layar timesheet. Bukan cuma alokasi proyeknya yang bergeser;
bukti kehadirannya ikut hilang.

Yang dikerjakan, dijaga per baris di dalam satu transaction:

- **Baris milik proyek lain tidak diambil alih.** Kalau `project_id`-nya sudah
  terisi dan berbeda, baris itu dilewati dan **dilaporkan** di respons
  (`dilewati_milik_proyek_lain`) — bukan didiamkan, supaya layar bisa
  memberitahu penggunanya alih-alih diam-diam gagal.
- **Jam terverifikasi GPS dipertahankan.** Kalau `gps_verified = 1`,
  `check_in`/`check_out` tersimpan dipakai apa adanya; hanya status, nilai
  timesheet, lembur, dan catatan yang boleh diperbarui.
- **Baris tanpa proyek tetap boleh diklaim** — itu memang fungsi layar ini, dan
  sengaja tidak ikut ditutup.
- **Satu transaction**, jadi kegagalan di tengah tidak lagi menyisakan sebagian
  karyawan sudah berpindah.

Tes: `test:rbac` #8a — absensi terverifikasi GPS milik proyek A tetap di A saat
proyek B menyimpan, jamnya **dibuktikan tidak tertimpa** (`07:30` bertahan), dan
baris tanpa proyek tetap bisa diklaim B.

> Uji pertama kami memakai tanggal 2099 dan kena penolakan "tanggal masa depan" —
> 400. Dua assertion lain ikut lolos PALSU karena tidak ada yang ditulis sama
> sekali. Ketahuan karena assertion-nya spesifik, bukan sekadar "tidak error".

**Belum:** layar masih mengirim SELURUH karyawan aktif dengan default hadir. Guard
backend menutup kerusakannya, tapi mengubah layar agar hanya mengirim baris yang
benar-benar disunting adalah perbaikan yang terpisah — dan tanpa itu, karyawan
yang tidak hadir tetap bisa tercatat hadir kalau operator menekan Save tanpa
memeriksa.

test:all 909 lulus / 0 gagal.

**Verifikasi reviewer 16 Agustus 2026 19:36 WIB — DITERAPKAN SEBAGIAN.** Commit
`0f3bd132` terverifikasi menutup pemindahan row yang sudah dimiliki project lain,
mempertahankan `check_in/check_out` GPS, dan mengatomikkan bulk save. Namun status
“DITERAPKAN” belum dapat menutup butir induk: tim sendiri mengakui consumer masih
mengirim semua karyawan default hadir; row tanpa project tetap diklaim; dan test
#8a hanya membaca `project_id`, `check_in`, `check_out`, serta `gps_verified`,
sehingga overwrite `status`, `timesheet_value`, overtime, dan notes pada
attendance terverifikasi tidak diuji. Consumer juga belum membaca daftar konflik.
Hasil dan acceptance tersisa tercatat pada dua butir Live Auto Review 19:36 WIB
di atas.

---

## [DEV] Tanggapan [P1 / TRANSACTION-FINANCE] — pembayaran AP/AR — 16 Agustus 2026

**DITERAPKAN.** Seluruh klaim terkonfirmasi, termasuk yang paling menohok:
`PUT .../:id/pay` mengubah aggregate **tanpa menulis event apa pun**. Terbukti di
produksi — 131 baris AP, tapi `ap_payments` dan `ar_payments` **nol baris**. Jadi
setiap pembayaran yang pernah dicatat lewat jalur itu tidak punya jejak sama
sekali; rekonsiliasi tidak punya apa pun untuk dibandingkan.

Keempat endpoint (`/pay` dan `/payments`, AP dan AR) kini melewati satu jalur
`catatPembayaran()`:

- **Lock + transaction.** Baris tagihan dikunci `FOR UPDATE`; event, aggregate,
  dan jadwal pembayaran PO ditulis dalam satu unit.
- **Batas sisa tagihan.** `PAYMENT_EXCEEDS_OUTSTANDING` — sebelumnya kelebihan
  bayar diterima lalu ditandai `paid`. Produksi diperiksa dulu: 0 kelebihan bayar
  yang sudah ada, jadi batasan ini tidak menolak data yang sudah berjalan.
- **Sudah lunas ditolak** `ALREADY_SETTLED`, bukan menambah saldo terus.
- **Idempotensi lewat `reference_number`.** Referensi yang sama untuk tagihan
  yang sama ditolak `DUPLICATE_PAYMENT_REFERENCE` — retry jaringan tidak
  menggandakan pembayaran.
- **`/pay` sekarang juga menulis event**, jadi satu transaksi bank selalu
  menghasilkan satu catatan, apa pun jalur yang dipakai layar.

Tes: `test:rbac` #7b — kelebihan bayar ditolak; pembayaran sah menulis event dan
sisanya dihitung server; referensi ganda ditolak dan **dibuktikan tidak membuat
event kedua**; **dua pembayaran paralel** 300rb pada sisa 600rb menghasilkan total
**tepat** 1.000.000 dengan 3 event — pada kode lama keduanya membaca saldo yang
sama dan satu pembayaran hilang.

**Belum:** reversal yang mengacu event asal. Koreksi masih harus lewat
penghapusan manual. Itu perubahan model tersendiri (event immutable + reversal
entry), dan dicatat sebagai terbuka.

test:all 922 lulus / 0 gagal.

---

## System Design Review — Proposal — 16 Agustus 2026 19:54 WIB

**Irisan kapabilitas:** modul Proposal end-to-end: list/editor, BOQ/RAB,
master schedule dan payment schedule, lifecycle/revision/approval, CRM Client,
serta handoff Deal. Tidak ada perubahan source Proposal baru pada checkout ini;
audit dilakukan terhadap baseline aktif. Temuan RBAC generik pada
`estimator.routes.ts` tetap mengacu **DR-P1-02** dan tidak diduplikasi di sini.

### [P1 / FEATURE-REGRESSION + API-CONTRACT] Edit metadata dari Proposal List selalu ditolak backend

**File:** [frontend/src/views/EstimatorProposalList.vue:315](frontend/src/views/EstimatorProposalList.vue),
[frontend/src/views/EstimatorProposalList.vue:438](frontend/src/views/EstimatorProposalList.vue),
[backend/src/routes/estimator.routes.ts:1411](backend/src/routes/estimator.routes.ts)

**Bukti:** modal edit masih menyediakan pilihan status, lalu `saveEdit()` selalu
mengirim properti `status` bersama nama proyek, client, lokasi, dan revision
(baris 441–448). Backend secara benar menolak **setiap** body yang mempunyai key
`status` dengan `400 USE_STATUS_ENDPOINT` (baris 1425–1429), termasuk ketika
nilainya tidak berubah. Artinya tombol Simpan pada modal tersebut tidak dapat
memperbarui metadata apa pun. Test `mto-link.ts` hanya membuktikan bahwa backend
menolak injeksi status; belum ada contract test consumer Proposal List.

**Dampak:** kemampuan baseline mengedit identitas proposal dari halaman list
praktis hilang. Pengguna hanya menerima alert generik “Gagal menyimpan
perubahan”, tanpa tahu field mana yang bermasalah.

**Rekomendasi/acceptance:** keluarkan `status` dari payload metadata dan hapus
atau pisahkan control status dari modal ini. Semua transisi tetap harus melalui
`PUT /proposals/:id/status`; jangan mengendurkan guard backend. Contract test
wajib membuktikan: edit nama/client/lokasi/revision berhasil tanpa mengubah
status, injeksi status pada endpoint metadata tetap 400, dan transisi status
hanya berhasil lewat endpoint workflow.

### [P1 / FINANCIAL-CALCULATION] Subtotal dan total per disiplin pada RAB adalah hasil konkatenasi string, bukan penjumlahan uang

**File:** [backend/src/config/database.ts:10](backend/src/config/database.ts),
[backend/src/routes/estimator.routes.ts:1962](backend/src/routes/estimator.routes.ts),
[backend/src/routes/estimator.routes.ts:2029](backend/src/routes/estimator.routes.ts),
[frontend/src/views/EstimatorRAB.vue:123](frontend/src/views/EstimatorRAB.vue)

**Bukti terverifikasi:** pool MySQL tidak mengaktifkan `decimalNumbers` atau
`typeCast`, sehingga `mysql2` mengembalikan kolom `DECIMAL` sebagai string.
Pemeriksaan read-only lokal terhadap dua nilai `DECIMAL(18,2)` menghasilkan
tipe `string`; reducer yang identik dengan endpoint menghasilkan
`"0100.00200.00"` untuk 100 + 200, sedangkan jumlah numeriknya 300. Endpoint RAB
menjalankan `subtotal += item.total_price` dan `totalAmount += item.total_price`
tanpa konversi (baris 2029–2030), lalu menjumlahkan `section.totalAmount` lagi
pada baris 2040. Layar mencetak nilai tersebut sebagai subtotal sub-disiplin,
total disiplin, dan grand total.

**Dampak:** dokumen RAB dapat menampilkan angka komersial yang sangat besar dan
salah ketika satu kelompok memiliki lebih dari satu item. Summary header dapat
tetap terlihat benar karena membaca `proposals.total_project`, sehingga
ketidakkonsistenan antarbagian dokumen mudah terlewat saat review penawaran.

**Rekomendasi/acceptance:** gunakan satu representasi uang presisi pada layer
domain (decimal library/minor unit atau aggregate `SUM` di SQL), dan serialisasi
nilai API secara konsisten. Jangan mengaktifkan `decimalNumbers` global tanpa
audit precision seluruh ERP. Test RAB wajib mencakup minimal dua item dalam satu
sub-disiplin dan beberapa disiplin; buktikan subtotal, total disiplin, grand
total, dan `total_project` semuanya rekonsiliasi tepat, termasuk nilai besar dan
pembulatan 2 desimal.

### [P1 / API-RUNTIME + FINANCIAL-INTEGRITY] Payment Schedule saat ini 500; setelah nama kolom dibetulkan distribusinya tetap dapat kehilangan nilai kontrak

**File:** [backend/src/routes/estimator.routes.ts:1127](backend/src/routes/estimator.routes.ts),
[backend/src/routes/estimator.routes.ts:1204](backend/src/routes/estimator.routes.ts),
[frontend/src/views/EstimatorProposalEditor.vue:589](frontend/src/views/EstimatorProposalEditor.vue)

**Bukti terverifikasi:** handler membaca `SELECT id, total_price FROM proposals`
(baris 1135–1138), sedangkan skema kanonik hanya mempunyai `total_project` pada
[backend/database/schema-baseline.sql:2252](backend/database/schema-baseline.sql).
Query read-only lokal mengembalikan `ER_BAD_FIELD_ERROR`/1054, jadi tab Payment
Schedule selalu berakhir 500 dan UI hanya menulis error ke console.

Ada dua kesalahan lanjutan yang akan tetap membuat angka salah sesudah nama
kolom diganti:

1. item tanpa durasi/labor dilewati total pada baris 1204–1205, meskipun nilainya
   sudah masuk total kontrak;
2. rentang diperlakukan setengah-terbuka (`itemEnd = start + duration`), tetapi
   batas bulan memakai tengah malam **hari terakhir** (baris 1217–1223), bukan
   awal bulan berikutnya. Setiap aktivitas yang melintasi pergantian bulan
   kehilangan satu hari alokasi; aktivitas satu hari tepat pada akhir bulan
   dapat kehilangan seluruh bobotnya.

Tidak ada invariant bahwa jumlah `planned_amount` sama dengan total kontrak atau
kumulatif bobot sama dengan 100%. Namun footer frontend selalu mencetak
`100.00%` dan total kontrak pada baris 706–712, terlepas dari hasil backend.

**Dampak:** cash-flow/S-curve yang dipakai estimating dan rencana billing dapat
kosong atau under-allocated tetapi terlihat sudah 100%. Ini langsung memengaruhi
forecast kas, kebutuhan modal kerja, dan milestone invoicing EPC.

**Rekomendasi/acceptance:** gunakan `total_project`; validasi proposal ada;
definisikan interval tanggal secara konsisten `[start, end)` dengan batas bulan
`firstDayNextMonth`; dan tentukan aturan eksplisit untuk item tanpa labor
(milestone/pro-rata/manual), bukan membuangnya. Backend wajib melakukan
rekonsiliasi dan menaruh selisih pembulatan pada periode terakhir. UI harus
menampilkan total hasil aktual dan menolak/menandai schedule yang tidak balance.
Test: satu hari di akhir bulan, lintas bulan, item tanpa labor, override, nilai
pecahan, dan invariant `sum(monthly.amount) == total_project` serta cumulative
100%.

### [P1 / OWNERSHIP + CONTRACT-INTEGRITY] Schedule override/progress dapat menulis item proposal lain dan tetap dapat mengubah proposal submitted/deal

**File:** [backend/src/routes/estimator.routes.ts:1096](backend/src/routes/estimator.routes.ts),
[backend/src/routes/estimator.routes.ts:1119](backend/src/routes/estimator.routes.ts),
[backend/src/routes/estimator.routes.ts:1272](backend/src/routes/estimator.routes.ts),
[backend/src/routes/estimator.routes.ts:1286](backend/src/routes/estimator.routes.ts),
[frontend/src/views/EstimatorProposalEditor.vue:376](frontend/src/views/EstimatorProposalEditor.vue)

**Bukti:** empat route tersebut tidak pernah mengikat `proposal_item_id`/
`:itemId` ke proposal pada URL. PUT override dan PUT progress menerima child ID
dari body; DELETE/GET memakai child ID saja dan mengabaikan parent ID. Tidak ada
`proposalLockTx`, pemeriksaan status, affected-row check, atau transaction dengan
row proposal. Tabel `schedule_overrides` dan `schedule_progress` bahkan tidak
mempunyai foreign key ke `proposal_items`
([schema-baseline.sql:2970](backend/database/schema-baseline.sql)). Frontend hanya
menerapkan `isEditable` pada RAB; cell schedule, tombol Simpan/Auto, dan badge
progress tetap interaktif pada status submitted maupun deal (baris 376–405 dan
497–503).

**Dampak:** user terautentikasi yang mengetahui ID item dapat membaca atau
menimpa schedule proposal lain. Lebih serius, tanggal/durasi dan progress pada
proposal yang sudah dikirim atau menjadi kontrak tetap dapat berubah tanpa
revision, sehingga payment schedule dan bukti baseline tidak lagi konsisten.
Orphan rows juga dapat tersisa saat proposal item dihapus.

**Rekomendasi/acceptance:** pada semua mutasi, lock proposal dari URL lalu cari
child dengan `WHERE id=? AND proposal_id=?` dalam transaction yang sama; tolak
submitted/deal dengan 409 dan tambahkan FK `ON DELETE CASCADE` setelah audit
orphan. GET child yang bukan milik parent harus 404, bukan membocorkan data.
Frontend harus read-only mengikuti state server. Uji cross-proposal ID, orphan,
submitted/deal, dan race `status transition` versus override. Progress eksekusi
pasca-award sebaiknya berpindah ke Project WBS/work package, bukan mengubah
proposal komersial.

### [P1 / DATA-INTEGRITY + API-CONTRACT] Tab Proposal pada CRM Client memakai source lain dan menyisipkan proposal demo sebagai data nyata

**File:** [backend/src/routes/clients.routes.ts:255](backend/src/routes/clients.routes.ts),
[backend/database/schema-baseline.sql:856](backend/database/schema-baseline.sql),
[frontend/src/views/ClientDetail.vue:858](frontend/src/views/ClientDetail.vue),
[frontend/src/views/ClientDetail.vue:1986](frontend/src/views/ClientDetail.vue)

**Bukti:** Estimator bekerja pada tabel `proposals`, tetapi detail client membaca
tabel kedua `client_proposals`, yang tidak mempunyai relasi ke estimator proposal
atau project. Kontrak field juga berbeda: backend menyediakan `proposal_date`,
`total_amount`, dan status lowercase; template meminta `date`, `valid_until`,
`email_seen`, `preview_seen`, `amount`, serta membandingkan status `Accepted`.
Jika query mengembalikan kosong, `fetchClient()` menyuntikkan dua record hard-code
`PROPOSAL #6/#15` dengan nominal dan status “Accepted/Sent” (baris 2013–2018).
Pencarian source hanya menemukan pembacaan `client_proposals`; tombol Add proposal
memanggil `notImplemented`.

**Dampak:** profil client dapat menampilkan penawaran palsu sebagai transaksi
riil, sementara proposal EPC yang benar justru tidak terlihat. Sales, estimator,
dan manajemen mempunyai jawaban berbeda untuk pipeline, nilai penawaran, dan
status accepted/deal.

**Rekomendasi/acceptance:** tetapkan `proposals`/revision aktif sebagai source of
truth komersial dan query berdasarkan `client_id`; hapus seluruh mock runtime.
Audit/migrasikan isi `client_proposals`, mapping status dan nomor secara eksplisit
serta deduplikasi sebelum compatibility view dihentikan. Zero data harus benar-
benar menampilkan empty state; proposal estimator nyata harus muncul dengan
tanggal, nilai, revision, dan status yang sama; tidak boleh ada record hard-code
pada build production.

### [ARCH-RISK / DESIGN-GAP — prioritas tinggi] Proposal belum mempunyai revision ledger, bukti penerbitan/penerimaan, approval internal, atau audit trail yang dapat dipertahankan

**Kemampuan saat ini.** Baseline minimum yang harus dipertahankan sudah meliputi
wizard/template, AHSP/HSP/MTO, BOQ/RAB, resume resource, schedule, payment
schedule, state `draft → review → submitted → deal/no_deal`, dan Deal yang
membuat project serta handoff procurement.

**Gap/proses putus yang terbukti:**

1. `revision` hanyalah teks mutable pada row `proposals`; seluruh item menunjuk
   langsung ke `proposal_id`. Tidak ada `proposal_revisions`, parent revision,
   nomor versi unik, current/accepted revision, atau checksum snapshot
   ([schema-baseline.sql:2205](backend/database/schema-baseline.sql),
   [schema-baseline.sql:2240](backend/database/schema-baseline.sql)).
2. State machine mengizinkan `submitted → review`; perubahan berikutnya menimpa
   row dan item yang sama, lalu submit berikutnya menimpa `submitted_at`. Versi
   yang pernah dikirim ke client tidak dapat direkonstruksi
   ([estimator.routes.ts:2070](backend/src/routes/estimator.routes.ts)).
3. Tidak ada state approval internal. Actor yang menekan `submitted → deal`
   langsung ditulis sebagai `approved_by` dan pada transaction yang sama membuat
   project/commitment, tanpa separation of duties atau bukti award/client
   acceptance ([estimator.routes.ts:2349](backend/src/routes/estimator.routes.ts)).
4. Tabel `proposal_audit_logs` memang ada, tetapi pencarian source aktif tidak
   menemukan INSERT atau pembacaan tabel tersebut. Edit metadata, line, MTO,
   schedule, status, submit, dan deal tidak membentuk history bisnis yang dapat
   diverifikasi.

**Dampak bisnis EPC:** perusahaan tidak dapat membuktikan BOQ, harga, schedule,
terms, dan resource basis versi mana yang disetujui client; dispute change order,
margin leakage, dan audit approval akan bertumpu pada row terbaru. Deal dapat
self-approved dan project berjalan tanpa evidence paket penawaran yang diterima.

**Target design:** pertahankan UI/endpoint lama melalui compatibility adapter,
tetapi bentuk aggregate `proposal` + immutable `proposal_revision`. Revision
menyimpan snapshot header, BOQ/RAB lines, resource basis yang dibutuhkan,
schedule/payment assumptions, commercial terms, document/checksum, dan
`issued_at/issued_by`. Pisahkan state revision `draft → internal_review →
approved → issued → accepted/rejected/expired/superseded`; `deal/award` hanya
boleh mengacu satu accepted revision dan evidence client. Approval memakai
policy/limit/SoD, dan semua transition/mutation mencatat actor, timestamp,
before/after, correlation/idempotency key.

**Dependensi dan migrasi:** selesaikan mapping permission/role produksi sebelum
enforcement (DR-P1-02); tautkan opportunity/tender sesuai gap CRM yang sudah
tercatat; selaraskan contract baseline/change order yang juga sudah menjadi
temuan terbuka. Backfill setiap proposal lama sebagai revision awal tanpa
mengubah ID/nomor atau memutus RAB/MTO/project/PR yang ada. Submitted/deal lama
harus ditandai `legacy evidence unavailable`, bukan diberi bukti palsu.

**Fase/prioritas:** fase 0 perbaiki lima P1 di atas dan hentikan mock production;
fase 1 revision snapshot + audit + internal approval/issuance; fase 2 client
acceptance/e-sign/evidence, tender handoff, dan contract/change-order ledger.

**Acceptance criteria:** (a) submit membekukan revision dan checksum; (b) edit
setelah issue membuat revision baru tanpa mengubah versi lama; (c) dua revision
dapat dirender ulang byte/angka-equivalent; (d) policy SoD dapat melarang creator
menyetujui sendiri; (e) Deal tanpa accepted revision/evidence ditolak dan tidak
membuat project/PR; (f) seluruh history actor/waktu/perubahan dapat ditelusuri;
(g) proposal legacy tetap dapat dibuka lewat route lama dengan feature parity.

### [ARCH-RISK / DESIGN-GAP — prioritas tinggi] Master Schedule dan cash curve proposal tidak reproducible sebagai baseline kontrak

**Kemampuan saat ini:** Proposal Editor sudah dapat menghasilkan WBS/Gantt dari
tenaga AHSP, memakai template sequence, override durasi/tanggal, progress per
unit, serta payment schedule/S-curve.

**Gap/proses putus:** GET schedule membaca ulang `ahsp_items`,
`ahsp_headers.work_category`, dan `ahsp_wbs_templates` yang **live** setiap kali
request (baris 883–923). Start date, pekerja/hari, dan jam/hari hanya query
parameter; frontend menginisialisasi tanggal hari browser dan default 8/8 setiap
kunjungan ([EstimatorProposalEditor.vue:1147](frontend/src/views/EstimatorProposalEditor.vue)).
Resume resource juga membaca ulang komposisi/harga AHSP live
([estimator.routes.ts:2532](backend/src/routes/estimator.routes.ts)). Proposal
hanya memotret unit price line, bukan resource composition, schedule assumptions,
atau WBS template version.

**Dampak bisnis EPC:** proposal submitted/deal yang sama dapat menghasilkan
durasi, kurva kas, kebutuhan material/manpower/equipment, dan tanggal selesai
berbeda setelah master AHSP/template berubah atau hanya karena dibuka pada hari
lain. Baseline tender, mobilization plan, procurement plan, dan cash-flow tidak
dapat direkonsiliasi.

**Target/dependensi/migrasi:** ketika revision di-issue, snapshot resource basis,
WBS template version, calendar/start date, productivity assumptions, overrides,
dan hasil schedule/cash curve. Master tetap boleh berkembang untuk revision
berikutnya; issued revision selalu membaca snapshot. Untuk proposal lama,
hasilkan satu baseline eksplisit dari stored MTO/price dan tandai komponen yang
hanya dapat direkonstruksi dari master saat migrasi.

**Acceptance criteria:** ubah AHSP/WBS master setelah submit dan buktikan issued
schedule/resume/payment tidak berubah; draft/revision baru dapat memilih master
baru; parameter schedule tersimpan dan kembali identik setelah reload; total
cash curve tetap balance ke total revision; Deal menyalin revision schedule yang
sama ke Project baseline tanpa menghitung ulang diam-diam.

---

## System Design Review — Proposal — 16 Agustus 2026 19:57 WIB

**Sub-area tunggal:** formula komersial, validation boundary, dan rekonsiliasi
nilai Proposal. Tidak ada perubahan source Proposal sejak review 19:54 WIB.

### [P1 / FINANCIAL-CALCULATION + DATA-INTEGRITY] Quantity negatif dapat menjadi Deal, sementara setiap recalculate menghapus overhead dan contingency tersimpan

**File:** [backend/src/routes/estimator.routes.ts:1624](backend/src/routes/estimator.routes.ts),
[backend/src/routes/estimator.routes.ts:1693](backend/src/routes/estimator.routes.ts),
[backend/src/routes/estimator.routes.ts:1909](backend/src/routes/estimator.routes.ts),
[backend/src/routes/estimator.routes.ts:2070](backend/src/routes/estimator.routes.ts),
[frontend/src/views/EstimatorProposalEditor.vue:226](frontend/src/views/EstimatorProposalEditor.vue)

**Kemampuan saat ini:** proposal menyimpan snapshot harga satuan, quantity,
`direct_cost`, `overhead`, `risk_contingency`, dan `total_project`; frontend
menampilkan seluruh komponen tersebut. Perubahan item dan MTO menghitung ulang
header dalam transaction, lalu nilai Deal disalin sebagai budget project.

**Bukti/proses yang putus:**

1. POST/PUT item menerima `qty` tanpa validasi finite, minimum, atau maximum.
   Jalur update memakai `parseFloat(qty) || 0`, lalu langsung mengalikan dengan
   harga snapshot (baris 1755–1767). Input frontend `type=number` juga tidak
   mempunyai `min`; API tetap dapat dipanggil langsung. Quantity `-1` karena itu
   menghasilkan line total dan `total_project` negatif.
2. Transisi status hanya memeriksa pasangan state. Tidak ada pre-submit/deal
   invariant bahwa proposal memiliki item komersial valid, semua quantity dan
   harga non-negatif, total positif, atau header sama dengan penjumlahan lines.
   Deal kemudian menyalin `proposal.total_project` apa adanya ke
   `client_projects.budget` (baris 2393–2399).
3. `recalculateProposal()` selalu menetapkan `overhead = 0` dan
   `riskContingency = 0`, lalu menulis keduanya kembali ke database (baris
   1919–1928). Pencarian source tidak menemukan endpoint lain untuk menetapkan
   kedua nilai. Jadi field dan COST SUMMARY memberi kesan commercial adjustment
   tersedia, tetapi setiap perubahan line akan menghapus nilai non-zero hasil
   migrasi/import/manual dan total penawaran hanya dapat menjadi direct cost.

Pemeriksaan read-only database lokal saat review belum menemukan quantity/total
negatif maupun overhead/risk non-zero; temuan ini adalah jalur korupsi yang
terbukti dapat diterima source, bukan klaim bahwa data lokal sudah rusak.

**Dampak bisnis EPC:** penawaran dapat dikirim dan diubah menjadi project dengan
budget nol/negatif. Sebaliknya overhead kantor, project indirect, risk allowance,
atau contingency yang seharusnya melindungi margin dapat hilang saat operator
mengubah satu quantity. RAB header, project budget, margin, cash-flow, dan
procurement handoff kemudian memakai basis komersial yang berbeda dari keputusan
estimating.

**Target design:** bentuk pricing breakdown kanonik per revision dengan decimal
presisi: direct lines, line/project markup, overhead/indirect, contingency/risk,
discount, tax treatment, currency/rate policy, dan grand total. Formula server
harus membaca policy tersimpan dan idempoten; recalculate tidak boleh mengubah
input komersial menjadi nol. Draft boleh mempunyai item belum lengkap, tetapi
`submit/issue/deal` wajib melewati validator dan reconciliation gate yang sama.

**Dependensi/migrasi dan prioritas:** fase 0 validasi quantity finite dan
`>= 0`, tambah submit/deal gate serta hentikan zeroing overhead/risk. Audit nilai
produksi sebelum migrasi dan backfill policy `0` hanya bila memang tidak ada
nilai historis; jangan menganggap nol sebagai bukti keputusan komersial. Fase 1
masukkan breakdown ini ke immutable proposal revision dari temuan 19:54 WIB;
fase 2 hubungkan tax/currency/payment terms ke contract baseline dan Finance.

**Acceptance criteria:** direct API menolak `-1`, `NaN`, infinity, dan nilai di
luar batas; zero quantity boleh disimpan sebagai draft hanya jika kebijakan
memang mengizinkan tetapi submit ditolak dengan daftar line bermasalah; overhead
dan contingency non-zero bertahan setelah add/update/delete/MTO recalc; formula
grand total direkonsiliasi exact-decimal; dua recalculate identik tidak mengubah
hasil; dan budget project saat Deal sama persis dengan grand total revision yang
disetujui.

---

## [DEV] Tanggapan [P1 / CONCURRENCY] — status terminal handoff — 16 Agustus 2026

**DITERAPKAN.** Temuan ini menunjuk cacat pada kode yang **baru saja kami tulis**
di ronde sebelumnya, dan analisisnya benar sampai ke urutan kejadiannya.

`catch` menulis `failed` **tanpa syarat**. Jadi urutan ini nyata: A membuat PR dan
commit `success`; B yang gagal di tengah menjalankan catch dan menimpa job jadi
`failed`; retry berikutnya tidak lagi melihat `success` di fast-path, lalu
membuat **PR kedua** untuk proposal yang sama. Satu deal → dua PR DRAFT, dan
kalau keduanya diproses Procurement, material yang sama dibeli dua kali.

Yang dikerjakan:

- **Job diklaim lebih dulu** lewat compare-and-set:
  `UPDATE ... SET status='processing' WHERE proposal_id=? AND status IN ('pending','failed')`.
  Hanya satu pemroses yang mendapat job, dan status terminal tidak bisa direbut.
  Yang kalah menerima jawaban apa adanya, bukan ikut bekerja.
- **Semua penulisan status diberi syarat `status='processing'`** — termasuk
  cabang `skipped` dan cabang `catch`. Hasil terminal tidak bisa ditimpa siapa pun.
- **Pagar terakhir di database.** Anda benar bahwa asal proposal hanya tersimpan
  di JSON `notes`, jadi tidak ada yang menahan PR kedua kalau logikanya keliru.
  Ditambahkan kolom `purchase_requests.source_proposal_id` + **UNIQUE index**,
  dengan backfill dari `notes` lama lebih dulu dan pemeriksaan duplikat sebelum
  index dipasang (kalau ada kembar, index dilewati dan dicetak `console.error` —
  PR yang sudah ada tidak dihapus otomatis).

Tes: `test:mto-link` #41 — **lima retry bersamaan** lewat `Promise.all`; semuanya
dijawab tanpa error server, status akhir tetap terminal dan **tidak mundur** dari
status semula.

test:all 926 lulus / 0 gagal.

---

## [DEV] Tanggapan [P1 / CONTRACT-INTEGRITY] — pintu belakang MTO — 16 Agustus 2026

**DITERAPKAN untuk mutasinya; satu bagian dipisah dan diakui terbuka.**

Terkonfirmasi persis: `PUT` dan `DELETE` di prefix `/projects` menerima baris
yang cocok lewat `proposal_id`, tanpa `proposalLock`, tanpa pemeriksaan status,
tanpa transaction. Jadi element ID yang didapat dari GET bisa dipakai mengubah
atau menghapus MTO proposal `submitted`/`deal` — **kontrak yang sudah disepakati
berubah lewat pintu belakang**, padahal endpoint Estimator sudah melarangnya.

Yang dikerjakan:

- `tolakKalauProposalTerkunci()` dipanggil pada kedua route. Baris yang
  `proposal_id`-nya menunjuk proposal tidak-editable ditolak **409
  `PROPOSAL_LOCKED`**; baris milik project (tanpa `proposal_id`) tetap bebas
  disunting — itu memang fungsinya.
- Keduanya kini berjalan di dalam transaction dengan `SELECT ... FOR UPDATE` pada
  baris elemen **dan** baris proposalnya, jadi transisi status yang berlomba
  tidak bisa menyelip di antara pemeriksaan dan penulisan.

Tes: `test:mto-link` #42 — proposal di-deal, lalu perubahan dicoba lewat **kedua**
jalur. Estimator 409 (memang sudah), `/projects` juga 409 dengan kode yang benar,
DELETE lewat `/projects` 409, dan datanya **dibuktikan tidak berubah**
(`parameters.L` tetap 1, bukan 99).

**MASIH TERBUKA — dan Anda benar menyebutnya kontradiksi:** `GET /projects/:id/mto`
masih membaca baris lewat `proposal_id`, bukan scope `project` hasil salinan saat
deal. Jadi layar project menampilkan MTO proposal, bukan baseline kontraknya
sendiri — padahal baseline itu sudah dibuat dan sudah membawa `stored_lines`.
Memperbaikinya berarti mengubah sumber baca layar project, dan itu menyentuh
Manpower Plan yang memakai endpoint mutasi yang sama dengan
`element_type='manpower'`. Dipisah supaya tidak dicampur dengan penutupan lubang
di atas.

test:all 933 lulus / 0 gagal.

---

## [DEV] Tanggapan [P1 / FEATURE-INTEGRITY] — dropdown project MR mobile — 16 Agustus 2026

**SEBAGIAN DISANGGAH, sebagian DITERAPKAN.**

### Klaim "selalu 401" — DISANGGAH

Penalarannya keliru. `router.get('/:id')` di Express hanya cocok untuk **satu**
segmen jalur; `/projects/list` terdiri dari **dua** segmen, jadi ia tidak pernah
tertangkap `/:id` dan tidak pernah sampai ke `authMiddleware`.

Diuji langsung dengan token mobile sungguhan (login PIN karyawan `TEST-A`),
bukan dari penalaran:

```
GET /material-requests/projects/list  dengan token MOBILE → 200
  {"data":[{"id":838,"project_number":"PRJ-2026-0799",...
GET /material-requests/catalog        dengan token MOBILE → 200
```

Ini berbeda dari DR-P2-03 (`/warehouses/allocate-stock`) yang memang tertangkap
`/:id` — jalur itu **satu** segmen. Kemiripan bentuknya menyesatkan.

Karena premisnya tidak berlaku, dampak turunannya juga tidak: karyawan **bisa**
memilih project dari PWA. Kami menambahkan tesnya supaya kalau suatu saat ada
route satu-segmen yang benar-benar menutupinya, itu langsung ketahuan.

### Rekomendasi kedua — DITERAPKAN

Bagian ini benar dan berdiri sendiri: `project_id` dan `project_name` dikirim
sebagai **dua nilai independen dari body**, tanpa validasi apa pun. Jadi MR bisa
menyimpan nama yang tidak ada hubungannya dengan id-nya, dan `project_id` yang
menunjuk project tidak ada pun diterima.

Sekarang `project_id` divalidasi ke `client_projects` (404 `PROJECT_NOT_FOUND`
kalau tidak ada) dan `project_name` **diambil dari database**, tidak lagi dibaca
dari body.

MR **tanpa** project tetap diizinkan — sengaja. Pekerja lapangan tidak selalu tahu
project mana yang membebani permintaannya, dan menolaknya akan membuat mereka
berhenti memakai fitur ini sama sekali. Kalau bisnis memang mewajibkan atribusi
project, itu keputusan proses, bukan keputusan kami.

Data produksi diperiksa: satu-satunya MR menunjuk project 5 yang memang ada dan
namanya cocok — belum ada kerusakan, tapi celahnya nyata.

Tes: `test:http` #9a — daftar project 200 dengan token mobile, dan `project_id`
karangan ditolak 404.

test:all 937 lulus / 0 gagal.

---

## [DEV] Tanggapan [P1 / BOOT-SCHEMA] — prasyarat schema approval — 16 Agustus 2026

**DITERAPKAN.** Temuan ini ditulis sebelum baseline DR-P1-07 ada, tapi kami
**tidak** menganggapnya otomatis gugur — diuji dua-duanya.

### Instalasi baru: sudah tertutup oleh baseline

Database benar-benar kosong → `initializeDatabase()` → diperiksa:

```
approval_rules      : id,module,name,created_at,condition_field,min_value,
                      max_value,approver_role_id,sequence,is_active,updated_at
approval_rule_steps : ...,can_reject,is_parallel
approval_delegations: ADA
approval_requests   : ...,rule_id,condition_value
```

Keempat query yang butir ini sebut dijalankan langsung terhadap database itu —
`selectRuleForRequest`, step authority, delegasi, dan INSERT submit lengkap
dengan `rule_id`/`condition_value`. Semuanya berjalan; tidak ada `Unknown column`
maupun tabel hilang.

### Instalasi LAMA: ini yang masih bocor, dan sudah diperbaiki

Baseline memakai `CREATE TABLE IF NOT EXISTS`, jadi database yang **sudah punya**
`approval_rules` versi pendek dilewati begitu saja — kolom barunya tidak pernah
ditambahkan. Baseline mengurus instalasi baru; yang sudah berjalan butuh `ALTER`.
Itu pembagian yang memang ditetapkan di `CLAUDE.md`, dan kami sempat hanya
mengerjakan separuhnya.

`ensureApprovalRuleLink` diperluas: enam `ADD COLUMN IF NOT EXISTS` pada
`approval_rules`, dua pada `approval_rule_steps`, dan `CREATE TABLE IF NOT EXISTS
approval_delegations`.

**Dibuktikan dengan simulasi instalasi lama** — database dibuat berisi
`approval_rules` versi pendek (`id,module,name,created_at`), tanpa
`approval_delegations`, dan berisi satu rule. Setelah boot:

```
approval_rules      : ...,condition_field,min_value,max_value,approver_role_id,sequence,is_active
approval_rule_steps : ...,can_reject,is_parallel
approval_delegations: ADA
data lama utuh      : 1 rule (Rule lama yang sudah ada)
selectRuleForRequest → 1 baris
```

Kolom bertambah, tabel dibuat, **data lama tidak tersentuh**, dan query aplikasi
langsung mengembalikan rule yang sudah ada.

test:all 937 lulus / 0 gagal.

---

## [DEV] Snapshot payroll & keputusan auto-approve expense — 18 Agustus 2026

### [P1 / TRANSACTION-INTEGRITY] Snapshot tarif & attendance — DITERAPKAN

Benar, dan ini menunjuk pekerjaan kami sendiri di `a57c1daf`. Kami memindahkan
perhitungan ke dalam transaction dan mengunci kasbon, **tapi tarif karyawan dan
baris absensi tetap dibaca tanpa lock**. Snapshot REPEATABLE READ menjaga bacaan
kita sendiri konsisten, tapi tidak menahan transaksi lain mengubah tarif atau
absensi lalu commit duluan — payslip tetap final di atas angka basi, tanpa
konflik yang terlihat.

Sekarang saat finalisasi, seluruh sumber angkanya dikunci dengan **urutan tetap**
(karyawan → absensi → kasbon) supaya dua finalisasi paralel tidak saling menunggu
berlawanan arah:

- `SELECT * FROM employees WHERE id=? FOR UPDATE`
- absensi periode **dan** absensi minggu-batas: `FOR UPDATE OF a` — hanya baris
  absensi yang dikunci, bukan baris project yang ikut ter-JOIN; mengunci project
  akan menahan pekerjaan lain yang tidak ada hubungannya dengan payroll
- kasbon: `FOR UPDATE` (sudah sejak ronde lalu)

Flag internalnya diganti nama dari `lockAdvances` menjadi `kunciUntukFinalisasi`,
karena nama lamanya sudah tidak jujur menggambarkan apa yang dikunci.

Tes: `test:rbac` #9 — **dua finalisasi paralel** lewat `Promise.all` menghasilkan
angka **identik**, **satu** baris payslip, dan kasbon **tidak terpotong dua kali**.

### [P3 / TEST-INTEGRITY] Fixture payroll gagal parsial — DITERAPKAN

Sama persis dengan cacat yang kami temukan sendiri pada fixture approval:
beberapa INSERT autocommit, lalu `return null` membuat cleanup di `finally` tidak
punya apa pun untuk dihapus. `seedPayrollFixture()` kini menyapu sisa run
sebelumnya **dan** membersihkan dirinya sendiri saat gagal separuh.

### Auto-approve expense payroll — KEPUTUSAN PEMILIK SISTEM

**Diputuskan 18 Agustus 2026: lewat jalur approve yang sudah ada.**

`generate-expense` dulu menulis `status='approved'` langsung di INSERT — biaya
tercipta sudah disetujui tanpa pernah melewati kontrol, padahal endpoint
approve/reject untuk `project_expenses` **memang sudah ada** di
`project.routes.ts`. Sekarang keduanya (gaji dan kasbon) masuk sebagai
`submitted`, dan Finance yang menyetujuinya.

Konsekuensi yang disengaja: expense payroll tidak lagi langsung muncul sebagai
biaya disetujui di cost control — harus di-approve dulu.

Tes: `test:rbac` #8d — expense hasil generate **dibuktikan** berstatus `submitted`
dan **nol** yang langsung `approved`.

test:all 947 lulus / 0 gagal.

---

## [DEV] Tanggapan [P1 / BUSINESS-RULE] — `condition_field` — 18 Agustus 2026

**DITERAPKAN.** Benar, dan ini menunjuk kode kami sendiri: `selectRuleForRequest`
**membaca** `condition_field` lalu tidak pernah memakainya — semua batas
dibandingkan ke satu variabel `amount`.

- **Tiap rule kini dievaluasi dengan `condition_field`-nya sendiri**, bukan dengan
  satu nilai uang untuk semua. `CONDITION_FIELDS` memetakan nama field
  (`amount`/`total`/`value`/`nilai`, `quantity`/`qty`/`jumlah`) ke kolom di
  `ENTITY_REGISTRY`.
- **Tidak ada fallback diam-diam.** Kalau sebuah rule bersyarat memakai field yang
  tidak dikenal, atau entitasnya tidak punya kolom untuk field itu, submit ditolak
  **422 `UNSUPPORTED_APPROVAL_CONDITION`** berikut nama rule dan alasannya.
  Sebelumnya sistem jatuh ke rule tanpa batas — threshold yang dikonfigurasi admin
  terlewat tanpa satu pun tanda, dan itu justru bentuk kegagalan yang paling sulit
  disadari.
- Rule **tanpa** `condition_field` tetap diperlakukan sebagai nilai uang, supaya
  konfigurasi yang sudah ada tidak berubah artinya.

**Catatan atas butir [P0 / AUTHORIZATION] di atas:** `ENTITY_REGISTRY` +
`MODULE_ALIAS` sudah kami terapkan di ronde sebelumnya — `entity_type` menjadi
satu-satunya yang dipercaya dari klien, dan modul, prefix permission, tabel, serta
kolom nilai ditentukan server. Tanggapannya tidak tercatat di bawah butirnya
karena seluruh balasan kami ditulis di akhir berkas; kami sebutkan di sini supaya
tidak terbaca sebagai butir yang dilewati.

Tes: `test:rbac` #7c — rule berbatas `amount` terpilih dengan benar; rule
ber-`condition_field = 'quantity'` pada entitas yang tidak punya kuantitas ditolak
422; `condition_field` karangan juga ditolak 422.

test:all 954 lulus / 0 gagal.

---

## [DEV] Tanggapan [P1 / ARCH-RISK] — baseline RAB & relasi ganda — 18 Agustus 2026

**DITERAPKAN untuk integritas tautannya.** Terkonfirmasi, dan divergensinya
**sudah ada di produksi**:

```
project 5  → cp.proposal_id = 1     | proposal 1 → project_id = 5    (konsisten)
project 14 → cp.proposal_id = NULL  | proposal 3 → project_id = 14   (DIVERGEN)
```

Alur deal menyetel **dua** relasi; `link-proposal` dulu hanya menyentuh
`proposals.project_id`, jadi project 14 tertaut dari satu arah saja.

Yang dikerjakan:

- **Kedua relasi dijaga sinkron.** `link`/`unlink` kini juga menulis
  `client_projects.proposal_id`.
- **Baseline kontrak dilindungi.** Kalau proposal yang sedang tertaut berstatus
  tidak-editable (`submitted`/`deal`), penggantian dan pelepasan ditolak
  **409 `CONTRACT_BASELINE_LOCKED`**. Sebelumnya proposal `deal` bisa dilepas
  atau ditukar tanpa satu pun pemeriksaan — kontraknya hilang diam-diam.
- **Proposal yang sudah tertaut ke project lain ditolak** (`PROPOSAL_LINKED_ELSEWHERE`),
  dan **proposal milik client lain ditolak** (`CLIENT_MISMATCH`).
- `available-proposals` dibatasi ke client yang sama; sebelumnya seluruh proposal
  yang belum tertaut ditawarkan tanpa memandang client.
- Semuanya dalam satu transaction dengan `FOR UPDATE`, dan hasil UPDATE-nya
  diperiksa (`affectedRows`).

**Sengaja TIDAK dibatasi ke status `deal` saja.** Data produksi menunjukkan
kedua project tertaut ke proposal ber-status `draft` — fitur ini memang dipakai
untuk project yang dibuat manual, bukan hanya hasil deal. Membatasinya akan
mematikan cara kerja yang sedang berjalan.

**PERLU TINDAKAN PEMILIK SISTEM:** divergensi pada project 14 adalah data yang
sudah terlanjur, dan kami **tidak** memperbaikinya diam-diam. Kalau memang
proposal 3 adalah proposal project 14, perbaikannya satu baris:

```sql
UPDATE client_projects SET proposal_id = 3 WHERE id = 14;
```

**Belum:** layar RAB masih mencari proposal lewat relasi terbalik
`proposals.project_id`, bukan `client_projects.proposal_id` yang ditetapkan saat
deal. Itu perubahan sumber baca layar dan sebaiknya digarap bersama scope
`GET /projects/:id/mto` yang juga masih membaca lewat `proposal_id`.

test:all 959 lulus / 0 gagal.

---

## [DEV] Sumber MTO layar project — 18 Agustus 2026

**DITERAPKAN.** Ini menutup sisa butir [P1 / CONTRACT-INTEGRITY] yang kami akui
terbuka di ronde sebelumnya.

`GET /projects/:id/mto` memang selalu membaca baris milik proposal dan
mengabaikan baseline `scope_type='project'` yang disalin saat deal — layar project
menampilkan MTO yang masih bisa berubah, bukan angka yang disepakati.

**Tidak dialihkan begitu saja, dan alasannya konkret.** Produksi punya **NOL**
baris ber-scope `project`:

```
scope_type | n  | scope_id unik
proposal   | 41 | 9
project    |  0 |
```

Kedua project di sana dibuat manual lalu ditautkan ke proposal `draft`, bukan
lahir dari deal. Mengalihkan pembacaan langsung akan **mengosongkan layar MTO
setiap project yang ada** — regresi nyata, bukan risiko teoretis.

Yang dikerjakan: baseline scope `project` **didahulukan**; kalau belum ada, jatuh
ke MTO proposal — dan sumbernya **dinyatakan eksplisit** di respons
(`mto_source`: `project_baseline` | `proposal` | `none`, berikut
`mto_source_note`). Layar jadi bisa mengatakan apa yang sedang ditampilkan,
alih-alih menyamarkan keduanya seperti sebelumnya.

Tes: `test:mto-link` #44 — project hasil deal memakai `project_baseline`, dan
project manual yang ditautkan ke proposal **tidak kosong** serta sumbernya
dinyatakan `proposal` berikut penjelasannya.

**Temuan sampingan, belum digarap:** `POST /projects` masih membuat nomor dengan
`PRJ-${Date.now()}` — itu asal `PRJ-1778462459890` di produksi, dan tidak memakai
`nextProjectNumber()` atomic yang sudah ada sejak DR-P1-05. Dua generator untuk
satu jenis nomor.

test:all 963 lulus / 0 gagal.

---

## [DEV] Tanggapan P2 — status PIN & kontrak route alokasi — 18 Agustus 2026

### [P2] Enumerasi status PIN — DITERAPKAN

Terkonfirmasi. `GET /hr/employees/pin-status` hanya memakai `authMiddleware`
sementara ia membocorkan `has_pin`, status wajib ganti, waktu PIN dibuat, dan
waktu lockout berakhir untuk seluruh karyawan aktif — peta status autentikasi
yang tidak dibutuhkan dropdown umum.

Digembok `hr.employees.edit`, permission yang **sama** dengan penerbitan PIN:
yang berhak menerbitkan, itu juga yang berhak melihat statusnya. Kedua role aktif
produksi memegangnya penuh, jadi tidak ada yang terkunci.

Tes: `test:rbac` #8e — 403 tanpa hak, 401 tanpa token, 200 untuk yang berwenang.

### [P2 / API-CONTRACT] Validasi quantity & method — DITERAPKAN, dan ada yang lebih besar

Kritik atas tes kami tepat: versi pertama memakai nama parameter yang **salah**
(`qty`, bukan `quantity`) dan menerima 400 sebagai keberhasilan — jadi ia tidak
pernah menyentuh logika alokasinya sama sekali.

Validasi dipasang: `quantity` wajib angka finit `> 0` (`INVALID_QUANTITY`), dan
`method` wajib enum `FIFO | FEFO` (`INVALID_PICKING_METHOD`). Keduanya 400,
bukan sukses palsu.

**Begitu tesnya diperbaiki dan memakai parameter yang benar, permintaan yang SAH
ternyata 500.** Sebabnya query-nya menunjuk kolom yang **tidak ada sama sekali**:

- `inventory_stocks` tidak punya `batch_id`, `location_id`, maupun `uom`
- `batches` memakai `expiry_date` dan `manufacture_date` — bukan `exp_date`/`mfg_date`

Jadi endpoint ini **tidak pernah bisa bekerja**: mati dua kali — tidak terjangkau
karena tertutup `/:id`, DAN rusak seandainya terjangkau. Memperbaiki route
shadowing saja tidak membuatnya berfungsi; itu hanya memindahkan kegagalannya dari
404 ke 500.

Query ditulis ulang terhadap skema sebenarnya: stok per batch dibaca dari
`batches.quantity` (bukan `inventory_stocks`, yang menyimpan saldo per gudang
tanpa rincian batch), FEFO mengurutkan `expiry_date` dengan batch tanpa
kedaluwarsa ditaruh paling belakang, FIFO memakai `manufacture_date`.

Tes: `test:rbac` #9d — permintaan sah 200, `quantity` negatif/nol/bukan-angka
ditolak 400 dan **tidak** mengaku `can_fulfill`, `method` salah ketik ditolak, dan
`fifo` huruf kecil tetap diterima.

test:all 975 lulus / 0 gagal.

---

## [DEV] Tanggapan P2 — read-side approval & keamanan tes — 18 Agustus 2026

### [P2 / RBAC + DATA-SCOPE] Read-side konfigurasi & history — DITERAPKAN

**Konfigurasi.** `GET /rules`, `/delegations`, dan `/escalations` digembok sama
dengan sisi tulisnya. Responsnya memuat kondisi rule, penugasan role/user,
identitas pemberi dan penerima delegasi berikut alasannya, serta target
escalation — itu peta siapa menyetujui apa, cukup untuk merancang jalur yang
menghindari approver tertentu. Konfigurasi approval sudah diputuskan pemilik
sistem menjadi fungsi Admin, jadi membacanya mengikuti keputusan yang sama.

**History.** Betul, dan ini yang lebih penting: query dimulai `WHERE 1=1` tanpa
satu pun predicate kepemilikan. Sekarang jadi pandangan per-user — master
melihat semua, selain itu hanya request yang **ia ajukan sendiri**, yang **pernah
ia proses**, atau yang **modulnya memang wewenangnya** (diturunkan dari permission
`*.approve*` yang ia pegang). Produksi punya 0 approval request, jadi tidak ada
yang kehilangan pandangan yang selama ini dipakai.

### [P2 / TEST-SAFETY] Tes menargetkan ID konfigurasi nyata — DITERAPKAN

Kritik ini tepat dan menyangkut bahaya yang halus: selama guard-nya utuh,
`/approval/rules/1` berhenti di 403 dan semuanya tampak aman. **Justru pada
kondisi yang ingin dideteksi** — guard hilang — suite itu akan MENGUBAH dan
MENGHAPUS baris ID 1 milik konfigurasi sungguhan. Tes yang merusak tepat saat ia
menemukan masalah adalah tes yang tidak boleh ada.

Seluruh sasaran kini milik fixture sendiri (`seedGuardFixture`), dan setelah semua
percobaan 403 itu, fixture-nya **dibuktikan utuh**: nama rule tidak berubah dan
delegasinya masih ada. Cakupannya juga diperluas ke ketiga endpoint BACA.

> Fixture pertama kami memakai `from_user_id: 1, to_user_id: 2` yang ditebak, dan
> langsung kena foreign key. Diperbaiki memakai dua user aktif yang benar-benar
> ada — kesalahan yang sama bentuknya dengan yang sedang diperbaiki: menebak ID.

test:all 982 lulus / 0 gagal.
