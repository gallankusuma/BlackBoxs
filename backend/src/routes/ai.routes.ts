import { Router, Request, Response } from 'express';
import { dbAll } from '../config/database';
import { authMiddleware } from '../middleware/auth';
import https from 'https';

const router = Router();

// ─── AI helper (supports Gemini + OpenAI fallback) ────────────────────────────
async function callAI(prompt: string): Promise<string> {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  // Try Gemini first (free tier available), then OpenAI as fallback
  if (geminiKey && geminiKey !== 'your-gemini-api-key-here') {
    try {
      return await callGemini(prompt, geminiKey);
    } catch (geminiErr: any) {
      console.error('[AI] Gemini failed, trying OpenAI fallback:', geminiErr.message);
      if (openaiKey && !openaiKey.startsWith('your-')) {
        return callOpenAI(prompt, openaiKey);
      }
      throw geminiErr;
    }
  }
  if (openaiKey && !openaiKey.startsWith('your-')) {
    return callOpenAI(prompt, openaiKey);
  }
  throw new Error('No AI API key configured. Set GEMINI_API_KEY or OPENAI_API_KEY.');
}

async function callOpenAI(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are a procurement assistant for an Indonesian manufacturing company. Always respond in valid JSON only.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3,
    max_tokens: 1024,
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.openai.com',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message || 'OpenAI API error'));
            return;
          }
          const text = parsed?.choices?.[0]?.message?.content || '';
          resolve(text);
        } catch (e) {
          reject(new Error('Failed to parse OpenAI response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          // gemini-2.5-flash may have multiple parts (thinking + response)
          const parts = parsed?.candidates?.[0]?.content?.parts || [];
          // Concatenate all text parts (skip thinking parts if any)
          const text = parts
            .filter((p: any) => p.text !== undefined)
            .map((p: any) => p.text)
            .join('');
          console.log('[Gemini] Parts count:', parts.length, '| Total text length:', text.length);
          if (!text) {
            console.error('[Gemini] Empty response. Full structure:', JSON.stringify(parsed).substring(0, 500));
          }
          resolve(text);
        } catch (e) {
          console.error('[Gemini] Parse error. Raw data (first 500):', data.substring(0, 500));
          reject(new Error('Failed to parse Gemini response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Gemini dengan gambar (vision) — dipakai membaca gambar teknik.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * `callGemini` di atas hanya mengirim teks. Untuk membaca gambar kerja, gambarnya
 * dikirim sebagai `inline_data` base64 di bagian yang sama.
 *
 * `temperature: 0` disengaja: yang diminta adalah pembacaan angka dari gambar,
 * bukan karangan. Untuk pekerjaan ini variasi jawaban bukan fitur — ia cacat.
 *
 * `responseMimeType: application/json` memaksa keluarannya JSON, jadi tidak
 * perlu menebak-nebak memotong teks pembungkus.
 * ─────────────────────────────────────────────────────────────────────────────
 */
/**
 * Panggilan teks-saja untuk giliran diskusi lanjutan.
 *
 * Tidak memakai `callGeminiVision` dengan gambar kosong: giliran lanjutan
 * memang tidak membaca gambar lagi, dan mengirim ulang berkas 8 MB tiap kali
 * pengguna mengetik satu kalimat itu pemborosan yang terasa lambat di layar.
 * Yang direvisi adalah parameter yang sudah terbaca, bukan gambarnya.
 */
export async function callGeminiText(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 8192,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed?.error) return reject(new Error(parsed.error.message || 'Gemini menolak permintaan'));
          const parts = parsed?.candidates?.[0]?.content?.parts || [];
          // Bagian penalaran dibuang di sini juga — jalur ini belum
          // menyalakannya, tapi menyamakan perlakuannya mencegahnya menjadi
          // jebakan yang sama kalau suatu saat dinyalakan.
          const text = parts
            .filter((p: any) => p.text !== undefined && p.thought !== true)
            .map((p: any) => p.text).join('');
          if (!text) {
            console.error('[Gemini Text] Balasan kosong:', JSON.stringify(parsed).substring(0, 400));
            return reject(new Error('Gemini tidak mengembalikan teks'));
          }
          resolve(text);
        } catch (e: any) {
          reject(new Error(`Balasan Gemini tidak bisa dibaca: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * EST-MTO-R56: pembacaan gambar bisa memakai OpenAI, bukan hanya Gemini.
 *
 * Alasannya praktis dan terukur: kuota free tier Gemini (20 permintaan/menit)
 * berkali-kali habis selama pengembangan fitur ini, dan sejak penalaran
 * dinyalakan tiap pembacaan memakan token jauh lebih banyak. Satu penyedia
 * berarti satu titik gagal yang menghentikan seluruh fitur.
 *
 * Yang TIDAK berubah, dan tidak boleh berubah: AI hanya mengeluarkan
 * PARAMETER. Kuantitasnya tetap dihitung `calculateMto()` — kalkulator yang
 * sama dengan input manual. Aturan itu berlaku untuk penyedia mana pun, dan
 * itulah sebabnya berganti penyedia tidak mengubah angka yang tersimpan.
 *
 * Memakai Responses API (`/v1/responses`), bukan Chat Completions: hanya yang
 * pertama menerima PDF lewat `input_file`. Chat Completions hanya menerima
 * gambar, dan gambar kerja beredar sebagai PDF.
 */
export async function callOpenAiVision(
  prompt: string, berkas: BerkasVisi[], apiKey: string,
): Promise<string> {
  const isi: any[] = [{ type: 'input_text', text: prompt }];
  for (const [i, b] of berkas.entries()) {
    if (b.mimeType === 'application/pdf') {
      isi.push({
        type: 'input_file',
        filename: `lembar-${i + 1}.pdf`,
        file_data: `data:application/pdf;base64,${b.base64}`,
      });
    } else {
      isi.push({ type: 'input_image', image_url: `data:${b.mimeType};base64,${b.base64}` });
    }
  }

  const body = JSON.stringify({
    model: process.env.OPENAI_VISION_MODEL || 'gpt-4.1',
    input: [{ role: 'user', content: isi }],
    // Keluarannya dipaksa JSON, sama seperti jalur Gemini — supaya tidak perlu
    // menebak-nebak memotong teks pembungkus.
    text: { format: { type: 'json_object' } },
    temperature: 0,
    max_output_tokens: 32768,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.openai.com',
      path: '/v1/responses',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed?.error) {
            return reject(new Error(parsed.error.message || 'OpenAI menolak permintaan'));
          }
          // Responses API menaruh teksnya di `output[].content[].text`.
          // `output_text` disediakan sebagai jalan pintas, tapi tidak selalu ada.
          let teks = String(parsed?.output_text || '');
          if (!teks) {
            for (const o of parsed?.output || []) {
              for (const c of o?.content || []) {
                if (typeof c?.text === 'string') teks += c.text;
              }
            }
          }
          if (!teks) {
            console.error('[OpenAI Vision] Balasan kosong:', JSON.stringify(parsed).slice(0, 400));
            const sebab = parsed?.incomplete_details?.reason;
            return reject(new Error(
              sebab === 'max_output_tokens'
                ? 'OpenAI kehabisan jatah keluaran sebelum menjawab — gambarnya terlalu banyak sekaligus. Coba kirim lebih sedikit lembar.'
                : 'OpenAI tidak mengembalikan jawaban'));
          }
          resolve(teks);
        } catch (e: any) {
          console.error('[OpenAI Vision] Parse error:', data.slice(0, 400));
          reject(new Error('Balasan OpenAI tidak bisa dibaca'));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Kuota/rate limit dari sisi penyedia — bukan cacat sistem, dan bisa dicoba lagi. */
export function galatKuota(err: any): boolean {
  return /quota|rate limit|RESOURCE_EXHAUSTED|429|insufficient_quota/i.test(String(err?.message || ''));
}

/**
 * Baca gambar lewat penyedia yang tersedia, dengan cadangan otomatis.
 *
 * Urutannya diatur `AI_VISION_PROVIDER`: `gemini` (default), `openai`, atau
 * `auto`. Apa pun urutannya, **kehabisan kuota pada yang pertama otomatis
 * mencoba yang kedua** — itu justru alasan utama lapisan ini ada.
 *
 * Kegagalan selain kuota TIDAK di-fallback: kalau gambarnya memang tidak
 * terbaca, mencoba penyedia kedua hanya menghabiskan kuota kedua untuk
 * mendapat jawaban yang sama.
 */
export async function bacaGambarAi(
  prompt: string, berkas: BerkasVisi[],
): Promise<{ teks: string; penyedia: string; dicoba: string[] }> {
  const gemini = process.env.GEMINI_API_KEY;
  const openai = process.env.OPENAI_API_KEY;
  const siap = (k?: string) => !!k && !k.startsWith('your-');

  const urutan: Array<'gemini' | 'openai'> =
    String(process.env.AI_VISION_PROVIDER || 'gemini').toLowerCase() === 'openai'
      ? ['openai', 'gemini'] : ['gemini', 'openai'];

  const dicoba: string[] = [];
  let terakhir: any = null;

  for (const p of urutan) {
    const kunci = p === 'gemini' ? gemini : openai;
    if (!siap(kunci)) continue;
    dicoba.push(p);
    try {
      const teks = p === 'gemini'
        ? await callGeminiVision(prompt, berkas, kunci as string)
        : await callOpenAiVision(prompt, berkas, kunci as string);
      return { teks, penyedia: p, dicoba };
    } catch (e: any) {
      // Penyedia yang gagal DITEMPELKAN ke errornya.
      //
      // Tanpa ini pesan akhirnya menyesatkan: saat Gemini kehabisan kuota lalu
      // cadangan OpenAI menolak kunci, yang sampai ke pengguna adalah "kunci
      // ditolak Google" — padahal kunci Google baik-baik saja dan yang perlu
      // diperbaiki kunci OpenAI. Terjadi sungguhan saat menguji.
      e.penyediaGagal = p;
      terakhir = e;
      if (!galatKuota(e)) throw e;   // bukan soal kuota — jangan buang kuota kedua
      console.error(`[AI Visi] ${p} kehabisan kuota, mencoba penyedia berikutnya:`, e.message?.slice(0, 100));
    }
  }

  if (!dicoba.length) {
    throw Object.assign(new Error('Tidak ada penyedia AI yang siap — GEMINI_API_KEY maupun OPENAI_API_KEY belum disetel.'),
      { kodeAi: 'AI_BELUM_SIAP' });
  }
  throw terakhir || new Error('Semua penyedia AI gagal');
}

export interface BerkasVisi {
  base64: string;
  mimeType: string;
}

/**
 * EST-MTO-R55: baca BANYAK berkas sekaligus, dan biarkan model BERPIKIR.
 *
 * Dua batasan yang sebelumnya dipasang tanpa alasan kuat, dan keduanya
 * menentukan kualitas pembacaan gambar teknik:
 *
 * 1. **Satu berkas gambar saja.** Gambar kerja sungguhan datang sebagai PDF
 *    berlembar-lembar — denah pondasi di satu lembar, tabel schedule di lembar
 *    lain, potongan di lembar ketiga. Membacanya satu per satu berarti model
 *    tidak pernah bisa menyilangkan denah dengan tabelnya, dan itu justru
 *    pekerjaan intinya.
 * 2. **`thinkingBudget: 0`** — penalaran dimatikan. Untuk mengekstrak satu
 *    angka dari teks itu wajar dan hemat. Untuk membaca gambar teknik —
 *    mencocokkan tanda P1 di denah dengan barisnya di tabel, lalu mengonversi
 *    2200 mm menjadi 2.2 m — penalaran itu justru pekerjaannya. Mematikannya
 *    menghemat token dengan menukar hal yang paling ingin kita dapatkan.
 */
export async function callGeminiVision(
  prompt: string,
  berkas: BerkasVisi[] | string,
  mimeTypeAtauApiKey: string,
  apiKeyOpsional?: string,
): Promise<string> {
  // Bentuk lama `(prompt, base64, mimeType, apiKey)` tetap diterima supaya
  // pemanggil yang belum diperbarui tidak patah.
  const daftar: BerkasVisi[] = Array.isArray(berkas)
    ? berkas
    : [{ base64: berkas, mimeType: mimeTypeAtauApiKey }];
  const apiKey = Array.isArray(berkas) ? mimeTypeAtauApiKey : (apiKeyOpsional as string);

  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        ...daftar.map(b => ({ inline_data: { mime_type: b.mimeType, data: b.base64 } })),
      ],
    }],
    generationConfig: {
      temperature: 0,
      // Dinaikkan: satu set gambar kerja bisa memuat puluhan elemen, dan
      // keluaran yang terpotong menghasilkan JSON rusak — bukan daftar pendek.
      maxOutputTokens: 32768,
      responseMimeType: 'application/json',
      // Penalaran DINYALAKAN untuk pembacaan gambar. Angkanya bukan tak
      // terbatas: dibatasi supaya biayanya tetap terduga.
      thinkingConfig: { thinkingBudget: 8192 },
    },
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed?.error) {
            return reject(new Error(parsed.error.message || 'Gemini menolak permintaan'));
          }
          const kandidat = parsed?.candidates?.[0];
          const parts = kandidat?.content?.parts || [];

          // Bagian PENALARAN dibuang.
          //
          // Sejak `thinkingBudget` dinyalakan, balasan memuat dua macam part:
          // hasil penalaran (`thought: true`) dan jawaban sebenarnya. Keduanya
          // sama-sama punya `.text`, jadi filter lama menggabungkan keduanya —
          // dan teks penalaran yang menempel di depan JSON membuatnya gagal
          // di-parse. Terlihat langsung saat smoke AI dijalankan: HTTP 502
          // "jawaban tidak bisa dibaca" pada berkas yang sebelumnya terbaca
          // baik-baik saja.
          const text = parts
            .filter((p: any) => p.text !== undefined && p.thought !== true)
            .map((p: any) => p.text).join('');

          if (!text) {
            console.error('[Gemini Vision] Balasan kosong:', JSON.stringify(parsed).substring(0, 400));
            const sebab = kandidat?.finishReason;
            return reject(new Error(
              sebab === 'MAX_TOKENS'
                // Penalaran ikut memakan jatah keluaran. Kalau habis di sana,
                // jawabannya tidak pernah sempat ditulis.
                ? 'Gemini kehabisan jatah keluaran sebelum menjawab — gambarnya terlalu banyak sekaligus. Coba kirim lebih sedikit lembar.'
                : `Gemini tidak mengembalikan jawaban${sebab ? ` (${sebab})` : ''}`));
          }
          resolve(text);
        } catch (e) {
          console.error('[Gemini Vision] Parse error:', data.substring(0, 400));
          reject(new Error('Balasan Gemini tidak bisa dibaca'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Gemini with Google Search grounding — for real-time marketplace price lookup
async function callGeminiWithSearch(prompt: string, apiKey: string): Promise<{ text: string; sources: any[] }> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const candidate = parsed?.candidates?.[0];
          const parts = candidate?.content?.parts || [];
          const text = parts
            .filter((p: any) => p.text !== undefined)
            .map((p: any) => p.text)
            .join('');
          
          // Extract grounding sources (marketplace URLs, titles, snippets)
          const groundingMeta = candidate?.groundingMetadata || {};
          const chunks = groundingMeta?.groundingChunks || [];
          const sources = chunks
            .filter((c: any) => c.web)
            .map((c: any) => ({
              title: c.web.title || '',
              url: c.web.uri || '',
            }));
          
          const searchQueries = groundingMeta?.webSearchQueries || [];
          
          console.log('[Gemini+Search] Parts:', parts.length, '| Sources:', sources.length, '| Queries:', searchQueries);
          if (!text) {
            console.error('[Gemini+Search] Empty response:', JSON.stringify(parsed).substring(0, 500));
          }
          resolve({ text, sources });
        } catch (e) {
          console.error('[Gemini+Search] Parse error:', data.substring(0, 500));
          reject(new Error('Failed to parse Gemini search response'));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── POST /api/ai/price-check ─────────────────────────────────────────────────
// Body: { product_id, product_name, quantity, uom, currency }
router.post('/price-check', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { product_id, product_name, quantity, uom, currency = 'IDR', search_query } = req.body;

    if (!product_name && !search_query) {
      return res.status(400).json({ error: 'product_name or search_query is required' });
    }

    // ── 1. Pull PO history from DB ────────────────────────────────────────────
    let history: any[] = [];
    if (product_id) {
      history = await dbAll(
        `SELECT
           poi.unit_price,
           poi.quantity,
           po.currency,
           po.po_date,
           v.name  AS vendor_name,
           po.type AS po_type
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.purchase_order_id = po.id
         JOIN vendors v          ON po.vendor_id          = v.id
         WHERE poi.product_id = ?
         ORDER BY po.po_date DESC
         LIMIT 20`,
        [product_id]
      ) as any[];
    }

    // ── 2. Pull vendor price list (if table exists) ───────────────────────────
    let vendorPrices: any[] = [];
    try {
      if (product_id) {
        vendorPrices = await dbAll(
          `SELECT vp.price, vp.min_qty, vp.lead_time_days, v.name AS vendor_name
           FROM vendor_prices vp
           JOIN vendors v ON vp.vendor_id = v.id
           WHERE vp.product_id = ?
           ORDER BY vp.price ASC`,
          [product_id]
        ) as any[];
      }
    } catch {
      // vendor_prices table may not exist; silently skip
    }

    // ── 3. Compute stats from history ─────────────────────────────────────────
    const prices = history.map((h) => Number(h.unit_price)).filter((p) => p > 0);
    const stats =
      prices.length > 0
        ? {
            count: prices.length,
            avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
            min: Math.min(...prices),
            max: Math.max(...prices),
            latest: prices[0],
          }
        : null;

    // ── 4. Build Gemini prompt ────────────────────────────────────────────────
    const historyText =
      history.length > 0
        ? history
            .slice(0, 10)
            .map(
              (h) =>
                `- ${h.vendor_name}: ${Number(h.unit_price).toLocaleString('id-ID')} ${h.currency} × ${h.quantity} ${uom || ''} (${h.po_date?.slice(0, 10) || '-'})`
            )
            .join('\n')
        : 'Belum ada histori pembelian.';

    const vendorText =
      vendorPrices.length > 0
        ? vendorPrices
            .map(
              (vp) =>
                `- ${vp.vendor_name}: ${Number(vp.price).toLocaleString('id-ID')} ${currency} (min qty: ${vp.min_qty || 1}, lead: ${vp.lead_time_days || '-'} hari)`
            )
            .join('\n')
        : 'Tidak ada data harga vendor.';

    // User search query for additional context
    const searchContext = search_query
      ? `\nUser juga meminta pencarian tambahan dengan kata kunci: "${search_query}"\nGunakan pengetahuanmu untuk mencari harga pasar terkini berdasarkan keyword tersebut.\n`
      : '';

    const itemName = product_name || search_query;

    const prompt = `Kamu adalah asisten pengadaan (procurement) untuk perusahaan EPC/konstruksi di Indonesia.

TUGAS UTAMA: Cari harga terkini untuk item berikut di marketplace online Indonesia (Tokopedia, Shopee, Bukalapak, Blibli, dll) lalu bandingkan dengan data internal.

Item yang ingin dibeli:
- Nama: ${itemName}
- Qty: ${quantity || '?'} ${uom || ''}
- Mata Uang: ${currency}
${searchContext}

═══ DATA INTERNAL ═══
Histori pembelian sebelumnya:
${historyText}

Daftar harga vendor (dari master data):
${vendorText}

${
  stats
    ? `Statistik harga historis:
- Jumlah transaksi: ${stats.count}
- Rata-rata: Rp ${stats.avg.toLocaleString('id-ID')}
- Terendah: Rp ${stats.min.toLocaleString('id-ID')}
- Tertinggi: Rp ${stats.max.toLocaleString('id-ID')}
- Harga terakhir: Rp ${stats.latest.toLocaleString('id-ID')}`
    : 'Belum ada data historis internal.'
}

═══ INSTRUKSI ═══
1. CARI harga "${itemName}" di marketplace Indonesia (Tokopedia, Shopee, Bukalapak, dll) menggunakan Google Search.
2. KUMPULKAN minimal 3-5 referensi harga dari marketplace yang berbeda.
3. BANDINGKAN dengan data internal di atas (jika ada).
4. BERIKAN rekomendasi harga yang realistis.

Format jawaban HANYA JSON (tanpa markdown/backtick):
{
  "recommended_price": <ANGKA_HARGA_REKOMENDASI>,
  "price_range": { "min": <BATAS_BAWAH>, "max": <BATAS_ATAS> },
  "analysis": "<analisis 2-3 kalimat tentang harga, tren, dan perbandingan marketplace vs internal>",
  "marketplace_prices": [
    { "source": "<nama marketplace/toko>", "price": <HARGA> }
  ],
  "negotiation_tips": ["<tip 1>", "<tip 2>"],
  "confidence": "high|medium|low"
}

PENTING:
- Harga marketplace HARUS berdasarkan hasil pencarian nyata, bukan karangan.
- JANGAN masukkan field "url" di marketplace_prices, URL akan di-generate otomatis oleh sistem.
- Jika item ini adalah material konstruksi/industri, cari juga di toko material online.
- Semua angka harga berupa number murni (contoh: 150000 bukan "150.000").
- Field "marketplace_prices" WAJIB diisi minimal 1 entry dari hasil pencarian.`;

    // ── 5. Call Gemini with Google Search grounding ──────────────────────────
    let aiResult: any = null;
    let aiError: string | null = null;
    let rawText = '';
    let searchSources: any[] = [];

    try {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (geminiKey && geminiKey !== 'your-gemini-api-key-here') {
        // Use search-grounded Gemini for marketplace price lookup
        const searchResult = await callGeminiWithSearch(prompt, geminiKey);
        rawText = searchResult.text;
        searchSources = searchResult.sources;
        console.log('[AI Price Check] Search sources:', searchSources.length);
      } else {
        rawText = await callAI(prompt);
      }
      console.log('[AI Price Check] Raw response (first 500 chars):', rawText.substring(0, 500));
      
      // Strip markdown code block wrapping (```json ... ```)
      let cleanText = rawText;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        cleanText = codeBlockMatch[1].trim();
      }
      
      // Extract JSON from the response
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResult = JSON.parse(jsonMatch[0]);
        console.log('[AI Price Check] Parsed AI result:', JSON.stringify(aiResult).substring(0, 300));
      } else {
        console.error('[AI Price Check] No JSON found in AI response');
      }
    } catch (e: any) {
      aiError = e.message || 'AI call failed';
      console.error('[AI Price Check] AI error:', e.message);
    }

    // ── 6. Generate real marketplace search links ──────────────────────────
    const searchKeyword = encodeURIComponent(itemName);
    const marketplaceLinks = [
      { name: 'Tokopedia', url: `https://www.tokopedia.com/search?q=${searchKeyword}`, color: 'green' },
      { name: 'Shopee', url: `https://shopee.co.id/search?keyword=${searchKeyword}`, color: 'orange' },
      { name: 'Bukalapak', url: `https://www.bukalapak.com/products?search%5Bkeywords%5D=${searchKeyword}`, color: 'red' },
      { name: 'Blibli', url: `https://www.blibli.com/cari/${searchKeyword}`, color: 'blue' },
      { name: 'Google Shopping', url: `https://www.google.com/search?q=${searchKeyword}+harga&tbm=shop`, color: 'gray' },
    ];

    // ── 7. Respond ────────────────────────────────────────────────────────────
    res.json({
      data: {
        product_id,
        product_name,
        quantity,
        uom,
        currency,
        history: history.slice(0, 10),
        vendor_prices: vendorPrices,
        stats,
        ai: aiResult,
        ai_error: aiError,
        ai_raw: aiResult ? undefined : rawText?.slice(0, 500),
        search_sources: searchSources,
        marketplace_links: marketplaceLinks,
      },
    });
  } catch (error: any) {
    console.error('[AI Price Check] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to check price' });
  }
});

// ─── POST /api/ai/po-advisor ──────────────────────────────────────────────────
// Full PO intelligence: analyze all items, vendor risk, budget vs RAB, anomaly detection
router.post('/po-advisor', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { items, vendor_id, vendor_name, total_amount, currency = 'IDR', project_id, notes } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required' });
    }

    // ── 1. Pull vendor history (past POs with this vendor) ────────────────────
    let vendorHistory: any[] = [];
    if (vendor_id) {
      vendorHistory = await dbAll(
        `SELECT po.id, po.po_number, po.po_date, po.total_amount, po.approval_status,
                COUNT(poi.id) as item_count,
                SUM(poi.quantity * poi.unit_price) as items_total
         FROM purchase_orders po
         JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
         WHERE po.vendor_id = ?
         GROUP BY po.id, po.po_number, po.po_date, po.total_amount, po.approval_status
         ORDER BY po.po_date DESC LIMIT 10`,
        [vendor_id]
      ) as any[];
    }

    // ── 2. Pull price history for each item ────────────────────────────────────
    const itemAnalysis: any[] = [];
    for (const item of items) {
      if (!item.product_id) continue;
      const history = await dbAll(
        `SELECT poi.unit_price, poi.quantity, po.po_date, po.currency, v.name as vendor_name
         FROM purchase_order_items poi
         JOIN purchase_orders po ON poi.purchase_order_id = po.id
         JOIN vendors v ON po.vendor_id = v.id
         WHERE poi.product_id = ?
         ORDER BY po.po_date DESC LIMIT 10`,
        [item.product_id]
      ) as any[];

      const prices = history.map((h: any) => Number(h.unit_price)).filter((p: number) => p > 0);
      const avg = prices.length > 0 ? prices.reduce((a: number, b: number) => a + b, 0) / prices.length : 0;
      const currentPrice = Number(item.unit_price) || 0;
      const deviation = avg > 0 ? ((currentPrice - avg) / avg) * 100 : 0;

      // Pull vendor price list
      let vendorPrices: any[] = [];
      try {
        vendorPrices = await dbAll(
          `SELECT vp.price, v.name as vendor_name FROM vendor_prices vp
           JOIN vendors v ON vp.vendor_id = v.id
           WHERE vp.product_id = ? ORDER BY vp.price ASC LIMIT 5`,
          [item.product_id]
        ) as any[];
      } catch {}

      itemAnalysis.push({
        product_id: item.product_id,
        name: item.name || item.productName,
        qty: item.quantity,
        uom: item.uom,
        current_price: currentPrice,
        line_total: currentPrice * (Number(item.quantity) || 1),
        history_avg: Math.round(avg),
        history_count: prices.length,
        history_min: prices.length > 0 ? Math.min(...prices) : 0,
        history_max: prices.length > 0 ? Math.max(...prices) : 0,
        price_deviation_pct: Math.round(deviation * 10) / 10,
        is_anomaly: Math.abs(deviation) > 20 && prices.length >= 2,
        vendor_prices: vendorPrices.slice(0, 3),
        recent_history: history.slice(0, 5),
      });
    }

    // ── 3. Pull RAB budget if project linked ───────────────────────────────────
    let rabBudget: any[] = [];
    if (project_id) {
      try {
        rabBudget = await dbAll(
          `SELECT pi.uraian, pi.total_price, pi.ahsp_code
           FROM proposal_items pi
           JOIN proposals p ON pi.proposal_id = p.id
           WHERE p.project_id = ? LIMIT 20`,
          [project_id]
        ) as any[];
      } catch {}
    }

    // ── 4. Build comprehensive AI prompt ─────────────────────────────────────
    const itemLines = itemAnalysis.map(it => {
      const anomalyFlag = it.is_anomaly ? `⚠️ ANOMALI ${it.price_deviation_pct > 0 ? '+' : ''}${it.price_deviation_pct}% dari rata-rata` : '✓ Normal';
      return `• ${it.name} | Qty: ${it.qty} ${it.uom} | Harga: Rp ${it.current_price.toLocaleString('id-ID')} | Avg histori: Rp ${it.history_avg.toLocaleString('id-ID')} | ${anomalyFlag}`;
    }).join('\n');

    const vendorHistText = vendorHistory.length > 0
      ? vendorHistory.map((vh: any) => `• ${vh.po_number} (${vh.po_date ? new Date(vh.po_date).toISOString().slice(0,10) : '-'}): Rp ${Number(vh.total_amount||0).toLocaleString('id-ID')} — ${vh.item_count} item`).join('\n')
      : 'Belum ada histori PO dengan vendor ini.';

    const anomalies = itemAnalysis.filter(it => it.is_anomaly);
    const totalPO = Number(total_amount) || itemAnalysis.reduce((s, it) => s + it.line_total, 0);

    const prompt = `Kamu adalah AI Procurement Advisor senior untuk perusahaan EPC (Engineering, Procurement, Construction) di Indonesia.

Analisis Purchase Order berikut secara komprehensif:

═══ INFO PO ═══
Vendor: ${vendor_name || 'Tidak diketahui'}
Total Nilai PO: Rp ${totalPO.toLocaleString('id-ID')} ${currency}
Jumlah Item: ${items.length}
Catatan: ${notes || '-'}

═══ DETAIL ITEM & ANALISIS HARGA ═══
${itemLines}

${anomalies.length > 0 ? `⚠️ ITEM DENGAN HARGA ANOMALI (${anomalies.length} item):
${anomalies.map(it => `• ${it.name}: Rp ${it.current_price.toLocaleString('id-ID')} vs avg Rp ${it.history_avg.toLocaleString('id-ID')} (${it.price_deviation_pct > 0 ? '+' : ''}${it.price_deviation_pct}%)`).join('\n')}` : '✅ Tidak ada anomali harga terdeteksi.'}

═══ HISTORI VENDOR ═══
${vendorHistText}

Berikan analisis dalam JSON format berikut (HANYA JSON, tanpa markdown):
{
  "overall_score": 85,
  "overall_verdict": "DIREKOMENDASIKAN|PERLU REVIEW|DITOLAK",
  "risk_level": "low|medium|high",
  "executive_summary": "Ringkasan eksekutif 2-3 kalimat",
  "price_analysis": {
    "verdict": "Wajar|Terlalu Tinggi|Terlalu Rendah",
    "details": "penjelasan analisis harga keseluruhan"
  },
  "anomaly_flags": [
    {"item": "nama item", "issue": "penjelasan masalah", "action": "saran tindakan"}
  ],
  "vendor_assessment": {
    "score": 80,
    "reliability": "high|medium|low",
    "comment": "komentar singkat tentang vendor"
  },
  "negotiation_strategy": {
    "potential_saving_pct": 5,
    "tactics": ["taktik 1", "taktik 2", "taktik 3"],
    "best_approach": "saran pendekatan negosiasi terbaik"
  },
  "recommendations": ["rekomendasi 1", "rekomendasi 2", "rekomendasi 3"],
  "red_flags": ["masalah kritis jika ada — kosong jika tidak ada"],
  "approval_recommendation": "APPROVE|CONDITIONAL|REJECT",
  "approval_notes": "catatan untuk approver"
}`;

    // ── 5. Call AI ─────────────────────────────────────────────────────────────
    let aiResult: any = null;
    let aiError: string | null = null;

    try {
      const rawText = await callAI(prompt);
      let cleanText = rawText;
      const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) cleanText = codeBlockMatch[1].trim();
      const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
      if (jsonMatch) aiResult = JSON.parse(jsonMatch[0]);
    } catch (e: any) {
      aiError = e.message || 'AI call failed';
    }

    res.json({
      data: {
        item_analysis: itemAnalysis,
        vendor_history: vendorHistory,
        total_po: totalPO,
        anomaly_count: anomalies.length,
        ai: aiResult,
        ai_error: aiError,
      }
    });
  } catch (error: any) {
    console.error('[AI PO Advisor] Error:', error);
    res.status(500).json({ error: error.message || 'Failed to analyze PO' });
  }
});

export default router;
