import PDFDocument from 'pdfkit';
import { DokumenPenawaran, rupiah, volume, tanggalPanjang } from './dokumen';

/**
 * Render dokumen penawaran menjadi PDF di SERVER.
 *
 * Kenapa bukan `window.print()` seperti sebelumnya: hasil print browser
 * bergantung pada mesin, versi browser, ukuran kertas, dan pengaturan margin
 * pengguna. Dokumen yang menjadi dasar harga kontrak tidak boleh berbeda
 * antarperangkat, dan tidak boleh berubah diam-diam saat browser pengguna
 * diperbarui.
 *
 * Keluarannya DETERMINISTIK: `CreationDate`/`ModDate` diisi tetap, bukan waktu
 * sekarang. Proposal yang sama menghasilkan byte yang sama — jadi checksum-nya
 * bisa dipakai membuktikan bahwa yang diterima klien memang yang dikirim.
 */

const MARGIN = 40;
const A4 = { lebar: 595.28, tinggi: 841.89 };

const LEBAR_ISI = A4.lebar - MARGIN * 2;   // 515.28 pt

// Lebar kolom tetap, dan JUMLAHNYA harus sama dengan lebar isi.
//
// Versi pertama menjumlah 595 pt untuk ruang 515 pt, sehingga kolom Jumlah —
// justru angka yang paling penting di dokumen ini — terpotong keluar halaman.
// Konstanta di bawah dijaga oleh pemeriksaan di bawahnya, supaya penyesuaian
// berikutnya tidak bisa diam-diam melewati batas lagi.
const KOL = {
  no: 30,
  uraian: 195,
  satuan: 32,
  qty: 55,
  harga: 95,
  jumlah: 108,
};
const TOTAL_KOL = Object.values(KOL).reduce((a, b) => a + b, 0);
if (Math.abs(TOTAL_KOL - LEBAR_ISI) > 1) {
  throw new Error(`Lebar kolom penawaran ${TOTAL_KOL}pt tidak sama dengan lebar isi ${LEBAR_ISI}pt`);
}

export function renderPenawaran(dok: DokumenPenawaran): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: MARGIN, bottom: 56, left: MARGIN, right: MARGIN },
      info: {
        Title: `Penawaran ${dok.nomor}`,
        Author: 'BlackBox EPC',
        Subject: dok.proyek,
        Keywords: dok.checksum,
        // Tetap, bukan `new Date()` — inilah yang membuat byte-nya stabil.
        CreationDate: new Date(0),
        ModDate: new Date(0),
      },
      autoFirstPage: false,
    });

    const potongan: Buffer[] = [];
    doc.on('data', (c: Buffer) => potongan.push(c));
    doc.on('end', () => resolve(Buffer.concat(potongan)));
    doc.on('error', reject);

    let halaman = 0;
    const mulaiHalaman = () => {
      doc.addPage();
      halaman++;
      kaki(doc, dok, halaman);
    };

    doc.on('pageAdded', () => { /* nomor halaman digambar manual di `kaki` */ });

    mulaiHalaman();
    kepala(doc, dok);
    let y = doc.y + 8;

    y = judulTabel(doc, y);

    for (const s of dok.seksi) {
      if (y > A4.tinggi - 110) { mulaiHalaman(); y = MARGIN; y = judulTabel(doc, y); }
      y = barisSeksi(doc, s.label, y);

      for (const b of s.baris) {
        const tinggi = tinggiBaris(doc, b.uraian, !!b.kode);
        if (y + tinggi > A4.tinggi - 90) { mulaiHalaman(); y = MARGIN; y = judulTabel(doc, y); }
        y = barisItem(doc, b, y, tinggi);
      }

      if (y > A4.tinggi - 100) { mulaiHalaman(); y = MARGIN; y = judulTabel(doc, y); }
      y = barisSubtotal(doc, s.subtotal, y);
      y += 6;
    }

    if (y > A4.tinggi - 200) { mulaiHalaman(); y = MARGIN; }
    y = ringkasan(doc, dok, y + 8);
    syaratKetentuan(doc, y + 18);

    doc.end();
  });
}

function kepala(doc: PDFKit.PDFDocument, dok: DokumenPenawaran) {
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a')
    .text('SURAT PENAWARAN HARGA', MARGIN, MARGIN, { width: LEBAR_ISI, align: 'center' });
  doc.font('Helvetica').fontSize(9).fillColor('#475569')
    .text('BlackBox EPC', { width: LEBAR_ISI, align: 'center' });

  // Proposal yang belum dikirim TIDAK boleh terlihat seperti dokumen final.
  // Tanpa penanda ini, draft yang tercetak tidak bisa dibedakan dari penawaran
  // yang benar-benar berlaku — dan itu perbedaan yang mengikat secara komersial.
  if (dok.status !== 'submitted' && dok.status !== 'deal') {
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#b45309')
      .text(`DRAF — BELUM DITERBITKAN (status: ${dok.status})`,
        MARGIN, doc.y, { width: LEBAR_ISI, align: 'center' });
  }

  doc.moveDown(0.9);
  const y0 = doc.y;
  const kiri = [
    ['Nomor', dok.nomor + (dok.revisi ? `  (Rev. ${dok.revisi})` : '')],
    ['Tanggal', tanggalPanjang(dok.tanggal)],
  ];
  const kanan = [
    ['Kepada', dok.klien],
    ['Proyek', dok.proyek],
    ['Lokasi', dok.lokasi || '-'],
  ];

  doc.fontSize(9).fillColor('#0f172a');
  let yk = y0;
  for (const [l, v] of kiri) {
    doc.font('Helvetica').fillColor('#64748b').text(l, MARGIN, yk, { width: 52 });
    doc.font('Helvetica-Bold').fillColor('#0f172a').text(String(v), MARGIN + 56, yk, { width: 190 });
    yk = doc.y + 2;
  }
  let yn = y0;
  const xk = MARGIN + 270;
  for (const [l, v] of kanan) {
    doc.font('Helvetica').fillColor('#64748b').text(l, xk, yn, { width: 46 });
    doc.font('Helvetica-Bold').fillColor('#0f172a').text(String(v), xk + 50, yn, { width: 195 });
    yn = doc.y + 2;
  }
  doc.y = Math.max(yk, yn) + 6;
  doc.moveTo(MARGIN, doc.y).lineTo(MARGIN + LEBAR_ISI, doc.y).lineWidth(0.8).strokeColor('#cbd5e1').stroke();
  doc.y += 2;
}

function judulTabel(doc: PDFKit.PDFDocument, y: number): number {
  const h = 18;
  doc.rect(MARGIN, y, LEBAR_ISI, h).fill('#f1f5f9');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155');
  let x = MARGIN;
  const sel = (t: string, w: number, align: 'left' | 'right' | 'center' = 'left') => {
    doc.text(t, x + 4, y + 5, { width: w - 8, align });
    x += w;
  };
  sel('No', KOL.no);
  sel('Uraian Pekerjaan', KOL.uraian);
  sel('Sat', KOL.satuan, 'center');
  sel('Volume', KOL.qty, 'right');
  sel('Harga Satuan', KOL.harga, 'right');
  sel('Jumlah', KOL.jumlah, 'right');
  return y + h + 2;
}

function tinggiBaris(doc: PDFKit.PDFDocument, uraian: string, adaKode: boolean): number {
  doc.font('Helvetica').fontSize(8);
  const h = doc.heightOfString(uraian, { width: KOL.uraian - 8 });
  // Baris kode dicetak di bawah uraian, jadi tingginya ikut diperhitungkan —
  // tanpa ini kode menabrak baris berikutnya.
  return Math.max(15, h + (adaKode ? 8 : 0) + 6);
}

function barisItem(doc: PDFKit.PDFDocument, b: any, y: number, h: number): number {
  // Setiap kolom digambar pada koordinat X-nya sendiri yang dihitung dari lebar
  // kolom — tidak ada kolom yang posisinya bergantung pada di mana kolom
  // sebelumnya kebetulan berakhir.
  const x0 = MARGIN;
  const xUraian = x0 + KOL.no;
  const xSat = xUraian + KOL.uraian;
  const xQty = xSat + KOL.satuan;
  const xHarga = xQty + KOL.qty;
  const xJumlah = xHarga + KOL.harga;

  doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
  doc.text(b.no, x0 + 3, y + 3, { width: KOL.no - 6, lineBreak: false });
  doc.text(b.uraian, xUraian + 3, y + 3, { width: KOL.uraian - 6 });
  const yKode = doc.y;
  if (b.kode) {
    doc.fontSize(6.5).fillColor('#94a3b8')
      .text(b.kode, xUraian + 3, yKode, { width: KOL.uraian - 6, lineBreak: false });
  }
  doc.font('Helvetica').fontSize(8).fillColor('#0f172a');
  doc.text(b.satuan, xSat + 3, y + 3, { width: KOL.satuan - 6, align: 'center', lineBreak: false });
  doc.text(volume(b.qty), xQty + 3, y + 3, { width: KOL.qty - 6, align: 'right', lineBreak: false });
  doc.text(rupiah(b.harga_satuan), xHarga + 3, y + 3, { width: KOL.harga - 6, align: 'right', lineBreak: false });
  doc.font('Helvetica-Bold')
    .text(rupiah(b.jumlah), xJumlah + 3, y + 3, { width: KOL.jumlah - 6, align: 'right', lineBreak: false });

  const bawah = y + h;
  doc.moveTo(MARGIN, bawah).lineTo(MARGIN + LEBAR_ISI, bawah)
    .lineWidth(0.4).strokeColor('#e2e8f0').stroke();
  return bawah + 1;
}

function barisSeksi(doc: PDFKit.PDFDocument, label: string, y: number): number {
  const h = 16;
  doc.rect(MARGIN, y, LEBAR_ISI, h).fill('#e2e8f0');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#0f172a')
    .text(label, MARGIN + 6, y + 4, { width: LEBAR_ISI - 12 });
  return y + h + 1;
}

function barisSubtotal(doc: PDFKit.PDFDocument, subtotal: number, y: number): number {
  const h = 16;
  const xJumlah = MARGIN + LEBAR_ISI - KOL.jumlah;
  doc.rect(MARGIN, y, LEBAR_ISI, h).fill('#f8fafc');
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155')
    // Label berhenti tepat sebelum kolom Jumlah — versi pertama memakai lebar
    // yang tumpang tindih, sehingga label dan angkanya tercetak bertumpuk.
    .text('Subtotal', MARGIN + 4, y + 4,
      { width: LEBAR_ISI - KOL.jumlah - 12, align: 'right', lineBreak: false });
  doc.fillColor('#0f172a')
    .text(rupiah(subtotal), xJumlah + 3, y + 4,
      { width: KOL.jumlah - 6, align: 'right', lineBreak: false });
  doc.moveTo(MARGIN, y + h).lineTo(MARGIN + LEBAR_ISI, y + h)
    .lineWidth(0.8).strokeColor('#94a3b8').stroke();
  return y + h + 2;
}

function ringkasan(doc: PDFKit.PDFDocument, dok: DokumenPenawaran, y: number): number {
  const lebar = 250;
  const x = MARGIN + LEBAR_ISI - lebar;
  const r = dok.ringkasan;
  const baris: Array<[string, number, boolean]> = [
    ['Biaya Langsung', r.direct_cost, false],
  ];
  if (r.overhead) baris.push(['Overhead & Profit', r.overhead, false]);
  if (r.risk_contingency) baris.push(['Kontinjensi Risiko', r.risk_contingency, false]);
  baris.push(['TOTAL PENAWARAN', r.total, true]);

  let yy = y;
  for (const [label, nilai, tebal] of baris) {
    if (tebal) {
      doc.rect(x, yy, lebar, 20).fill('#0f172a');
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff')
        .text(label, x + 8, yy + 6, { width: 120 });
      doc.text(`Rp ${rupiah(nilai)}`, x + 128, yy + 6, { width: lebar - 136, align: 'right' });
      yy += 20;
    } else {
      doc.font('Helvetica').fontSize(8.5).fillColor('#334155')
        .text(label, x + 8, yy + 4, { width: 130 });
      doc.text(`Rp ${rupiah(nilai)}`, x + 138, yy + 4, { width: lebar - 146, align: 'right' });
      yy += 16;
    }
  }
  return yy;
}

/**
 * Bagian syarat & ketentuan sengaja BELUM diisi.
 *
 * Model commercial terms — masa berlaku, termin pembayaran, retensi, pajak,
 * inclusions/exclusions — belum diputuskan pemilik sistem. Mengarangnya di sini
 * berarti dokumen ini menjanjikan hal yang tidak pernah disetujui siapa pun,
 * dan itu justru bentuk kerusakan yang paling mahal dari sebuah penawaran.
 *
 * Yang dilakukan: menyatakannya terbuka, sehingga pembaca tahu ada yang menyusul
 * — bukan menghilangkannya diam-diam sehingga pembaca menyimpulkan tidak ada
 * syarat sama sekali.
 */
function syaratKetentuan(doc: PDFKit.PDFDocument, y: number) {
  if (y > A4.tinggi - 130) { doc.addPage(); y = MARGIN; }
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#0f172a')
    .text('Syarat dan Ketentuan', MARGIN, y);
  doc.font('Helvetica').fontSize(8).fillColor('#64748b')
    .text('Masa berlaku penawaran, termin pembayaran, retensi, perlakuan pajak, serta '
      + 'lingkup yang termasuk dan tidak termasuk akan dilampirkan terpisah dan '
      + 'menjadi bagian tidak terpisahkan dari penawaran ini.',
      MARGIN, doc.y + 4, { width: LEBAR_ISI - 200, align: 'justify' });

  const yt = Math.max(doc.y + 24, y + 54);
  doc.font('Helvetica').fontSize(8).fillColor('#334155')
    .text('Hormat kami,', MARGIN + LEBAR_ISI - 180, yt, { width: 180 });
  doc.moveTo(MARGIN + LEBAR_ISI - 180, yt + 44)
    .lineTo(MARGIN + LEBAR_ISI - 40, yt + 44).lineWidth(0.6).strokeColor('#94a3b8').stroke();
  doc.fontSize(7.5).fillColor('#64748b')
    .text('BlackBox EPC', MARGIN + LEBAR_ISI - 180, yt + 48, { width: 180 });
}

function kaki(doc: PDFKit.PDFDocument, dok: DokumenPenawaran, halaman: number) {
  const y = A4.tinggi - 44;
  // Margin bawah dinolkan sementara.
  //
  // pdfkit menambah halaman BARU secara otomatis begitu teks mulai di bawah
  // `height - margins.bottom`. Kaki halaman memang digambar di bawah margin itu
  // — dan tanpa penonaktifan ini, menggambar kaki di awal halaman langsung
  // memicu halaman tambahan, sehingga seluruh isi dokumen terdorong ke halaman
  // berikutnya dan halaman pertama keluar kosong berisi kaki saja.
  const marginBawah = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + LEBAR_ISI, y)
    .lineWidth(0.5).strokeColor('#e2e8f0').stroke();
  doc.font('Helvetica').fontSize(6.5).fillColor('#94a3b8');
  doc.text(`${dok.nomor} — ${dok.proyek}`, MARGIN, y + 6, { width: 300, lineBreak: false });
  // Checksum dicetak supaya dokumen yang diterima bisa dicocokkan dengan yang
  // dikirim tanpa perlu membandingkan angkanya satu per satu.
  doc.text(`Checksum ${dok.checksum.slice(0, 16)}   ·   Halaman ${halaman}`,
    MARGIN + LEBAR_ISI - 260, y + 6, { width: 260, align: 'right', lineBreak: false });
  doc.text('Dokumen dihasilkan sistem BlackBox EPC.', MARGIN, y + 16,
    { width: 400, lineBreak: false });
  doc.page.margins.bottom = marginBawah;
  // `doc.y` dikembalikan ke atas: kaki tidak boleh menentukan di mana isi
  // halaman berikutnya mulai.
  doc.y = MARGIN;
}
