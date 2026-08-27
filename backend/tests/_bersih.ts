/**
 * Pembersihan fixture bersama untuk seluruh suite HTTP.
 *
 * Kenapa ini perlu ada, padahal tiap suite sudah punya `finally` yang memanggil
 * `DELETE /estimator/proposals/:id`:
 *
 *   1. Endpoint itu **menolak** proposal `submitted`/`deal` — dan itu memang
 *      benar, penawaran yang sudah dikirim tidak boleh dihapus lewat API. Tapi
 *      hampir setiap suite membuat fixture submitted untuk menguji penguncian,
 *      dan penolakan 409-nya ditelan `catch {}`. Fixture itu menetap selamanya.
 *   2. Suite memanggil `process.exit()` pada kegagalan asersi, sehingga jalur
 *      pembersihan tidak selalu tercapai.
 *
 * Akibatnya database dev bertumbuh monoton — 8.959 proposal, 3.564 elemen MTO,
 * dan 2.354 AHSP fixture terukur pada 27 Agustus 2026. Itu bukan sekadar boros:
 * ia mengaburkan audit yatim, dan membuat tes rekonsiliasi berikutnya bisa
 * memberi hasil palsu karena membaca sisa run sebelumnya.
 *
 * Pembersihan di sini menembak DATABASE langsung, bukan API — justru karena
 * yang perlu dibersihkan termasuk yang API-nya sengaja menolak. Ini sah untuk
 * fixture uji, dan TIDAK boleh dipakai jalur aplikasi mana pun.
 */
import { dbAll, dbRun } from '../src/config/database';

export interface HasilSapu {
  proposal: number;
  elemen: number;
  baris: number;
  ahsp: number;
}

/**
 * Hapus seluruh sisa fixture yang namanya memuat `stamp`.
 *
 * Dipanggil di `finally` tiap suite. Idempoten, dan aman dijalankan walau
 * suite-nya sudah membersihkan sebagian lewat API.
 */
export async function sapuFixture(stamp: string | number, kodeAhsp: string[] = []): Promise<HasilSapu> {
  const s = String(stamp);
  const hasil: HasilSapu = { proposal: 0, elemen: 0, baris: 0, ahsp: 0 };

  const proposals: any[] = await dbAll(
    `SELECT id FROM proposals WHERE project_name LIKE ?`, [`%${s}%`]);
  const ids = proposals.map(p => p.id);

  if (ids.length) {
    const tanda = ids.map(() => '?').join(',');
    const elemen: any[] = await dbAll(
      `SELECT id FROM engineering_inputs WHERE scope_type = 'proposal' AND scope_id IN (${tanda})`, ids);
    if (elemen.length) {
      const t2 = elemen.map(() => '?').join(',');
      const r = await dbRun(`DELETE FROM mto_lines WHERE element_id IN (${t2})`, elemen.map(e => e.id));
      hasil.baris = r?.affectedRows ?? 0;
      const r2 = await dbRun(`DELETE FROM engineering_inputs WHERE id IN (${t2})`, elemen.map(e => e.id));
      hasil.elemen = r2?.affectedRows ?? 0;
    }
    await dbRun(`DELETE FROM deal_pr_jobs WHERE proposal_id IN (${tanda})`, ids).catch(() => {});
    await dbRun(`DELETE FROM proposal_items WHERE proposal_id IN (${tanda})`, ids).catch(() => {});
    // `client_projects.proposal_id` ber-FK SET NULL, jadi project uji yang lahir
    // dari fixture Deal tidak ikut terhapus — dibersihkan eksplisit di sini.
    //
    // Urutannya menentukan: MTO milik project harus dihapus SEBELUM projectnya.
    // Versi pertama penyapu ini menghapus `client_projects` lebih dulu, lalu
    // baru mencari project berdasarkan nama — yang saat itu sudah tidak ada.
    // Hasilnya penyapu itu sendiri yang menciptakan elemen yatim; 18 per run,
    // dan justru tes kebersihan yang menangkapnya.
    const proyekDariProposal: any[] = await dbAll(
      `SELECT id FROM client_projects WHERE proposal_id IN (${tanda})`, ids);
    if (proyekDariProposal.length) {
      const tpp = proyekDariProposal.map(() => '?').join(',');
      const pids0 = proyekDariProposal.map(p => p.id);
      const elP0: any[] = await dbAll(
        `SELECT id FROM engineering_inputs WHERE scope_type = 'project' AND scope_id IN (${tpp})`, pids0);
      if (elP0.length) {
        const t4 = elP0.map(() => '?').join(',');
        const rb0 = await dbRun(`DELETE FROM mto_lines WHERE element_id IN (${t4})`, elP0.map(e => e.id));
        hasil.baris += rb0?.affectedRows ?? 0;
        const re0 = await dbRun(`DELETE FROM engineering_inputs WHERE id IN (${t4})`, elP0.map(e => e.id));
        hasil.elemen += re0?.affectedRows ?? 0;
      }
    }
    await dbRun(`DELETE FROM client_projects WHERE proposal_id IN (${tanda})`, ids).catch(() => {});
    const rp = await dbRun(`DELETE FROM proposals WHERE id IN (${tanda})`, ids);
    hasil.proposal = rp?.affectedRows ?? 0;
  }

  // Fixture yang membuat PROJECT (mis. lewat Deal, atau project manual) punya
  // `engineering_inputs` ber-`scope_type='project'`. Jalurnya berbeda dari
  // proposal dan tidak tersentuh penghapusan di atas — 637 elemen project yatim
  // terukur di dev pada 27 Agustus 2026, seluruhnya sisa run lama.
  const projects: any[] = await dbAll(
    `SELECT id FROM client_projects WHERE project_name LIKE ?`, [`%${s}%`]);
  const pids = projects.map(p => p.id);
  if (pids.length) {
    const tp = pids.map(() => '?').join(',');
    const elP: any[] = await dbAll(
      `SELECT id FROM engineering_inputs WHERE scope_type = 'project' AND scope_id IN (${tp})`, pids);
    if (elP.length) {
      const t3 = elP.map(() => '?').join(',');
      const rb = await dbRun(`DELETE FROM mto_lines WHERE element_id IN (${t3})`, elP.map(e => e.id));
      hasil.baris += rb?.affectedRows ?? 0;
      const re = await dbRun(`DELETE FROM engineering_inputs WHERE id IN (${t3})`, elP.map(e => e.id));
      hasil.elemen += re?.affectedRows ?? 0;
    }
    // `contracts` ber-FK CASCADE ke `client_projects`, jadi menghapus project
    // sudah cukup — change order dan baseline ikut lewat cascade berantai.
    await dbRun(`DELETE FROM client_projects WHERE id IN (${tp})`, pids).catch(() => {});
  }

  for (const kode of kodeAhsp) {
    const r = await dbRun('DELETE FROM ahsp_headers WHERE kode = ?', [kode]).catch(() => null);
    hasil.ahsp += r?.affectedRows ?? 0;
  }
  // AHSP fixture yang kodenya memuat stamp — pola `PREFIX.<stamp>` maupun
  // `PREFIX-<stamp>-<nama>` sama-sama tertangkap.
  const ra = await dbRun('DELETE FROM ahsp_headers WHERE kode LIKE ?', [`%${s}%`]).catch(() => null);
  hasil.ahsp += ra?.affectedRows ?? 0;

  return hasil;
}

/** Berapa baris fixture yang masih tersisa untuk `stamp` — untuk diasersi. */
export async function sisaFixture(stamp: string | number): Promise<number> {
  const s = String(stamp);
  const p: any[] = await dbAll(`SELECT id FROM proposals WHERE project_name LIKE ?`, [`%${s}%`]);
  const a: any[] = await dbAll(`SELECT id FROM ahsp_headers WHERE kode LIKE ?`, [`%${s}%`]);
  const e: any[] = await dbAll(
    `SELECT ei.id FROM engineering_inputs ei
     WHERE (ei.scope_type = 'proposal'
              AND NOT EXISTS (SELECT 1 FROM proposals pr WHERE pr.id = ei.scope_id))
        OR (ei.scope_type = 'project'
              AND NOT EXISTS (SELECT 1 FROM client_projects c WHERE c.id = ei.scope_id))`);
  const c: any[] = await dbAll(`SELECT id FROM client_projects WHERE project_name LIKE ?`, [`%${s}%`]);
  return p.length + a.length + e.length + c.length;
}
