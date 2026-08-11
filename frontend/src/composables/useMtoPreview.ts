import { ref, watch, type Ref } from 'vue';
import { api } from '@/lib/api';

export interface MtoLine {
  code: string;
  label: string;
  net_quantity: number;
  waste_percent: number;
  gross_quantity: number;
  unit: string;
}

/**
 * Ambil hasil hitungan MTO dari backend (EST-MTO-001).
 *
 * Komponen input MTO dulu menghitung sendiri di `computed`, dengan rumus yang
 * berbeda dari backend — termasuk pendekatan kasar seperti "besi = volume beton
 * × 160 kg/m³" dan faktor waste `× 1.05` yang tertanam diam-diam. Akibatnya
 * angka di layar bukan angka yang dipakai RAB maupun penawaran.
 *
 * Sekarang komponen hanya mengirim parameter dan menampilkan apa yang dijawab
 * kalkulator. Tidak ada lagi rumus bisnis di frontend.
 *
 * Panggilannya di-debounce karena user mengetik di input angka; tanpa itu satu
 * ketikan bisa memicu puluhan request.
 */
export function useMtoPreview(elementType: string, params: Ref<any> | (() => any)) {
  const lines = ref<MtoLine[]>([]);
  const notes = ref<string[]>([]);
  const variant = ref('');
  const loading = ref(false);
  const error = ref<string | null>(null);

  const read = () => (typeof params === 'function' ? params() : params.value);

  let timer: any = null;
  let seq = 0;

  const fetchPreview = async () => {
    const mySeq = ++seq;
    loading.value = true;
    error.value = null;
    try {
      const res = await api.post('/estimator/mto/preview', {
        element_type: elementType,
        parameters: read(),
      });
      // Balasan yang datang terlambat tidak boleh menimpa yang lebih baru
      if (mySeq !== seq) return;
      lines.value = res.data?.lines || [];
      notes.value = res.data?.notes || [];
      variant.value = res.data?.variant || '';
    } catch (e: any) {
      if (mySeq !== seq) return;
      error.value = e?.response?.data?.error || 'Gagal menghitung MTO';
      lines.value = [];
    } finally {
      if (mySeq === seq) loading.value = false;
    }
  };

  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fetchPreview, 250);
  };

  watch(() => JSON.stringify(read()), schedule, { immediate: true });

  return { lines, notes, variant, loading, error, refresh: fetchPreview };
}

const UNIT_ICON: Record<string, string> = {
  m3: '🏛', m2: '🪵', kg: '🔩', m: '📏', bh: '🔩', lbr: '📄',
};

/**
 * Ubah baris kalkulator jadi bentuk yang dipakai kartu ringkasan di layar.
 * Yang ditampilkan `gross_quantity` — jumlah yang benar-benar perlu dibeli.
 */
export function toDisplay(lines: MtoLine[]) {
  return lines.map(l => ({
    icon: UNIT_ICON[l.unit] || '📦',
    l: l.label,
    v: l.gross_quantity.toLocaleString('id-ID', { maximumFractionDigits: 2 }),
    u: l.unit === 'm3' ? 'm³' : l.unit === 'm2' ? 'm²' : l.unit,
    net: l.net_quantity,
    waste: l.waste_percent,
    code: l.code,
  }));
}
