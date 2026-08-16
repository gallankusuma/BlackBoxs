/**
 * Tanggal & jam menurut ZONA WAKTU BISNIS, bukan zona server (DR-P0-06).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * Server produksi berjalan UTC. Kode absensi memakai
 * `new Date().toISOString().slice(0, 10)`, yang menghasilkan tanggal UTC.
 *
 * WIB = UTC+7, jadi antara 00:00–06:59 WIB tanggal UTC-nya masih HARI KEMARIN.
 * Absen shift pagi jam 06:30 WIB tercatat di tanggal sebelumnya — masuk ke
 * periode payroll yang salah, dan pemeriksaan "sudah check-in hari ini" melihat
 * hari yang keliru sehingga check-in ganda bisa lolos.
 *
 * Hal yang sama berlaku untuk penolakan "tanggal di masa depan": pada pagi WIB,
 * tanggal hari ini dianggap masa depan dan input absensi yang sah ditolak.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const BUSINESS_TIMEZONE = process.env.BUSINESS_TIMEZONE || 'Asia/Jakarta';

/** `YYYY-MM-DD` menurut zona waktu bisnis. */
export const businessDate = (d: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

/** `HH:MM` 24 jam menurut zona waktu bisnis. */
export const businessTime = (d: Date = new Date()): string =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIMEZONE,
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);

/** `YYYYMMDD` — dipakai untuk nomor dokumen. */
export const businessDatePart = (d: Date = new Date()): string =>
  businessDate(d).replace(/-/g, '');
