<template>
  <div class="p-6 max-w-7xl mx-auto space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Opportunity Register</h1>
        <p class="text-sm text-gray-500">Dari lead sampai menang/kalah — dan nilainya dari penawaran yang benar-benar dikirim.</p>
      </div>
      <button @click="showBuat = true"
        class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
        + Opportunity
      </button>
    </div>

    <div v-if="galat" class="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      {{ galat }}
      <button @click="muat" class="ml-3 underline font-semibold">Coba lagi</button>
    </div>

    <!-- Ringkasan pipeline -->
    <div v-if="ring" class="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <p class="text-xs text-gray-500">Pipeline terbuka</p>
        <p class="text-lg font-bold text-gray-900">{{ rp(ring.terbuka.nilai) }}</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <p class="text-xs text-gray-500">Tertimbang probabilitas</p>
        <p class="text-lg font-bold text-gray-900">{{ rp(ring.terbuka.tertimbang) }}</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <p class="text-xs text-gray-500">Menang</p>
        <p class="text-lg font-bold text-emerald-700">{{ rp(ring.menang.nilai) }}</p>
        <p class="text-xs text-gray-500">{{ ring.menang.jml }} opportunity</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <p class="text-xs text-gray-500">Kalah</p>
        <p class="text-lg font-bold text-red-700">{{ rp(ring.kalah.nilai) }}</p>
        <p class="text-xs text-gray-500">{{ ring.kalah.jml }} opportunity</p>
      </div>
      <div class="bg-white rounded-xl border border-gray-200 p-4">
        <p class="text-xs text-gray-500">Win rate</p>
        <!-- null berarti belum ada yang diputuskan — bukan "belum pernah menang". -->
        <p class="text-lg font-bold" :class="ring.win_rate.pct === null ? 'text-gray-400' : 'text-blue-700'">
          {{ ring.win_rate.pct === null ? '—' : ring.win_rate.pct + '%' }}
        </p>
        <p class="text-xs text-gray-500">dari {{ ring.win_rate.penyebut }} yang diputuskan</p>
      </div>
    </div>

    <!-- Penyebutnya dinyatakan supaya angkanya tidak dibaca lebih percaya diri
         daripada seharusnya. -->
    <p v-if="ring" class="text-xs text-gray-500">{{ ring.win_rate.catatan }}</p>
    <p v-if="ring && ring.keterandalan.nilai_dari_taksiran"
       class="text-xs rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
      {{ ring.keterandalan.catatan }}
    </p>

    <div class="flex flex-wrap gap-2">
      <button v-for="t in ['', ...TAHAP]" :key="t || 'all'" @click="filter = t; muat()"
        class="px-3 py-1 rounded-full text-xs font-semibold border"
        :class="filter === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300'">
        {{ t || 'Semua' }}
      </button>
    </div>

    <div class="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-600">
          <tr>
            <th class="text-left px-4 py-2 font-medium">Kode</th>
            <th class="text-left px-4 py-2 font-medium">Judul</th>
            <th class="text-left px-4 py-2 font-medium">Client</th>
            <th class="text-left px-4 py-2 font-medium">Tahap</th>
            <th class="text-right px-4 py-2 font-medium">Nilai</th>
            <th class="text-left px-4 py-2 font-medium">Sumber nilai</th>
            <th class="text-right px-4 py-2 font-medium">Tertimbang</th>
            <th class="text-left px-4 py-2 font-medium">Tindakan</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="o in daftar" :key="o.id" class="border-t">
            <td class="px-4 py-2 whitespace-nowrap text-gray-500">{{ o.code }}</td>
            <td class="px-4 py-2">{{ o.title }}</td>
            <td class="px-4 py-2 text-gray-600">{{ o.client_terdaftar || o.client_name || '—' }}</td>
            <td class="px-4 py-2">
              <span class="text-xs px-2 py-0.5 rounded-full" :class="warnaTahap(o.stage)">{{ o.stage }}</span>
            </td>
            <td class="px-4 py-2 text-right">{{ o.nilai === null ? '—' : rp(o.nilai) }}</td>
            <td class="px-4 py-2">
              <!-- Taksiran dan nilai penawaran dibedakan: menyamakannya membuat
                   pipeline terlihat presisi padahal separuhnya masih tebakan. -->
              <span class="text-[10px] px-1.5 py-0.5 rounded-full"
                    :class="o.nilai_sumber === 'revisi_penawaran' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'">
                {{ o.nilai_sumber === 'revisi_penawaran' ? 'penawaran #' + o.revision_no : 'taksiran' }}
              </span>
            </td>
            <td class="px-4 py-2 text-right text-gray-600">
              {{ o.nilai_tertimbang === null ? '—' : rp(o.nilai_tertimbang) }}
            </td>
            <td class="px-4 py-2">
              <select v-if="!TERMINAL.includes(o.stage)" @change="ubahTahap(o, ($event.target as HTMLSelectElement).value)"
                class="border border-gray-300 rounded px-2 py-1 text-xs">
                <option value="">ubah tahap…</option>
                <option v-for="t in lanjutan(o.stage)" :key="t" :value="t">{{ t }}</option>
              </select>
              <span v-else class="text-xs text-gray-400">
                {{ o.stage === 'lost' ? (o.lost_reason_code || 'kalah') : o.stage }}
              </span>
            </td>
          </tr>
          <tr v-if="!daftar.length">
            <td colspan="8" class="px-4 py-8 text-center text-gray-400">Belum ada opportunity.</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal buat -->
    <div v-if="showBuat" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
         @click.self="showBuat = false">
      <div class="bg-white rounded-xl w-full max-w-lg p-5 space-y-3">
        <h3 class="font-bold text-gray-900">Opportunity baru</h3>
        <input v-model="baru.title" placeholder="Judul pekerjaan"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <input v-model="baru.client_name" placeholder="Pemilik pekerjaan"
          class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
        <div class="grid grid-cols-2 gap-3">
          <input v-model.number="baru.estimated_value" type="number" placeholder="Taksiran nilai"
            class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <input v-model.number="baru.probability" type="number" min="0" max="100" placeholder="Probability %"
            class="border border-gray-300 rounded-lg px-3 py-2 text-sm">
        </div>
        <p class="text-xs text-gray-500">
          Taksiran hanya dipakai selama belum ada penawaran. Begitu ada revisi terbit,
          nilai revisi itu yang dipakai.
        </p>
        <div class="flex justify-end gap-2 pt-2">
          <button @click="showBuat = false" class="px-4 py-2 border border-gray-300 rounded-lg text-sm">Batal</button>
          <button @click="simpanBaru" :disabled="!baru.title || sibuk"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
            {{ sibuk ? 'Menyimpan…' : 'Buat' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, reactive } from 'vue';
import { api } from '@/lib/api';

const TAHAP = ['lead', 'qualified', 'bidding', 'submitted', 'won', 'lost', 'cancelled'];
const TERMINAL = ['won', 'lost', 'cancelled'];
const LANJUT: Record<string, string[]> = {
  lead: ['qualified', 'cancelled', 'lost'],
  qualified: ['bidding', 'cancelled', 'lost'],
  bidding: ['submitted', 'cancelled', 'lost'],
  submitted: ['won', 'lost', 'cancelled'],
};

const daftar = ref<any[]>([]);
const ring = ref<any>(null);
const galat = ref('');
const filter = ref('');
const showBuat = ref(false);
const sibuk = ref(false);
const baru = reactive({ title: '', client_name: '', estimated_value: null as any, probability: null as any });

const rp = (v: any) => 'Rp ' + Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const lanjutan = (s: string) => LANJUT[s] || [];
const warnaTahap = (s: string) =>
  s === 'won' ? 'bg-emerald-100 text-emerald-700'
  : s === 'lost' ? 'bg-red-100 text-red-700'
  : s === 'cancelled' ? 'bg-gray-200 text-gray-600'
  : 'bg-blue-100 text-blue-700';

async function muat() {
  galat.value = '';
  try {
    const [d, r] = await Promise.all([
      api.get('/opportunities', { params: filter.value ? { stage: filter.value } : {} }),
      api.get('/opportunities/ringkasan/pipeline'),
    ]);
    daftar.value = d.data?.data || [];
    ring.value = r.data;
  } catch (e: any) {
    daftar.value = []; ring.value = null;
    galat.value = e?.response?.data?.error || 'Gagal memuat opportunity.';
  }
}

async function simpanBaru() {
  if (sibuk.value) return;
  sibuk.value = true;
  try {
    await api.post('/opportunities', { ...baru });
    showBuat.value = false;
    Object.assign(baru, { title: '', client_name: '', estimated_value: null, probability: null });
    await muat();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal membuat opportunity.');
  } finally { sibuk.value = false; }
}

async function ubahTahap(o: any, tujuan: string) {
  if (!tujuan) return;
  const body: any = { stage: tujuan };
  // Kalah wajib beralasan — ditanyakan di sini supaya server tidak perlu
  // menolak permintaan yang sudah pasti kurang.
  if (tujuan === 'lost') {
    const alasan = prompt('Alasan kalah (mis. HARGA / SPEK / RELASI / TIDAK_IKUT):');
    if (!alasan) { await muat(); return; }
    body.lost_reason_code = alasan;
    body.lost_reason_note = prompt('Catatan tambahan (boleh kosong):') || '';
  }
  try {
    await api.put(`/opportunities/${o.id}/stage`, body);
    await muat();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal mengubah tahap.');
    await muat();
  }
}

onMounted(muat);
</script>
