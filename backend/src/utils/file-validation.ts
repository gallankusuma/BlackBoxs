import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';

/**
 * Validasi berkas unggahan (AST-008).
 *
 * Sebelumnya nama berkas di server memakai ekstensi dari `originalname` tanpa
 * filter apa pun, sehingga `.html`, `.svg` beriskrip, atau executable bisa
 * masuk lalu dilayani balik oleh static server. Di sini tipe berkas ditentukan
 * dari MAGIC BYTES isinya, bukan dari nama atau MIME yang dikirim klien —
 * keduanya sepenuhnya di bawah kendali penyerang.
 */

export type AllowedType = 'pdf' | 'jpg' | 'png' | 'docx' | 'xlsx';

interface TypeSpec {
  ext: string;
  mimes: string[];
  /** Cocokkan magic bytes di awal berkas */
  matches: (b: Buffer) => boolean;
}

const startsWith = (b: Buffer, bytes: number[]) =>
  b.length >= bytes.length && bytes.every((v, i) => b[i] === v);

const SPECS: Record<AllowedType, TypeSpec> = {
  pdf: {
    ext: '.pdf',
    mimes: ['application/pdf'],
    matches: b => startsWith(b, [0x25, 0x50, 0x44, 0x46]), // %PDF
  },
  jpg: {
    ext: '.jpg',
    mimes: ['image/jpeg', 'image/jpg'],
    matches: b => startsWith(b, [0xff, 0xd8, 0xff]),
  },
  png: {
    ext: '.png',
    mimes: ['image/png'],
    matches: b => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  // DOCX/XLSX sama-sama arsip ZIP, jadi magic byte-nya identik. Pembedanya
  // ekstensi + MIME yang dikirim; yang penting isinya benar-benar ZIP dan
  // bukan skrip atau HTML.
  docx: {
    ext: '.docx',
    mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    matches: b => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
  xlsx: {
    ext: '.xlsx',
    mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    matches: b => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
};

export const ALLOWED_EXTENSIONS = Object.values(SPECS).map(s => s.ext);

export interface ValidationResult {
  ok: boolean;
  type?: AllowedType;
  ext?: string;
  error?: string;
}

/**
 * Cocokkan nama, MIME, dan isi berkas. Ketiganya harus konsisten.
 */
export function validateUpload(originalname: string, mimetype: string, buffer: Buffer): ValidationResult {
  const ext = path.extname(originalname || '').toLowerCase();
  const normalisedExt = ext === '.jpeg' ? '.jpg' : ext;

  const entry = (Object.entries(SPECS) as [AllowedType, TypeSpec][])
    .find(([, spec]) => spec.ext === normalisedExt);

  if (!entry) {
    return { ok: false, error: `Ekstensi tidak diizinkan. Hanya ${ALLOWED_EXTENSIONS.join(', ')}` };
  }

  const [type, spec] = entry;

  if (!spec.mimes.includes((mimetype || '').toLowerCase())) {
    return { ok: false, error: `Tipe berkas (${mimetype}) tidak cocok dengan ekstensi ${normalisedExt}` };
  }

  if (!spec.matches(buffer)) {
    return { ok: false, error: 'Isi berkas tidak cocok dengan ekstensinya — berkas ditolak' };
  }

  return { ok: true, type, ext: spec.ext };
}

/**
 * Tulis buffer ke disk dengan nama acak. Nama asli TIDAK dipakai supaya tidak
 * ada path traversal maupun ekstensi ganda seperti `laporan.pdf.html`.
 */
export function storeValidatedFile(dir: string, ext: string, buffer: Buffer): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${randomUUID()}${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return filename;
}

/** Hapus berkas yang sudah terlanjur ditulis — dipakai saat insert DB gagal. */
export function removeStoredFile(dir: string, filename: string): void {
  try {
    const target = path.join(dir, filename);
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    /* file sudah tidak ada — abaikan */
  }
}
