<template>
  <div class="p-6 max-w-7xl mx-auto space-y-5">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">Anggaran Tahunan CAPEX / OPEX</h1>
        <p class="text-sm text-gray-500">Pagu yang disetujui, rencana yang disusun, dan berapa yang sudah benar-benar terikat.</p>
      </div>
      <div class="flex items-center gap-2">
        <select v-model="tahunId" @change="muatTahun"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
          <option v-for="t in tahun" :key="t.id" :value="t.id">{{ t.year }} — {{ t.status }}</option>
        </select>
        <button @click="showTahun = true"
          class="px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold hover:bg-gray-50">+ Tahun</button>
        <button v-if="aktif && aktif.status !== 'closed'" @click="showBaris = true"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">+ Pekerjaan</button>
      </div>
    </div>

    <div v-if="galat" class="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
      {{ galat }}
      <button @click="muat" class="ml-3 underline font-semibold">Coba lagi</button>
    </div>

    <div v-if="!tahun.length && !galat" class="bg-white rounded-xl border border-gray-200 p-10 text-center">
      <p class="text-gray-600">Belum ada tahun anggaran. Mulai dengan menetapkan pagu CAPEX dan OPEX untuk satu tahun.</p>
      <button @click="showTahun = true" class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold">Buat tahun anggaran</button>
    </div>

    <template v-if="serapan">
      <!-- Empat angka yang berbeda. Menggabungkannya adalah cara paling umum
           sebuah laporan anggaran menyesatkan pembacanya di pertengahan tahun. -->
      <div class="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        <span class="font-semibold">Cara membaca:</span>
        <b>Pagu</b> = batas yang disetujui manajemen ·
        <b>Rencana</b> = jumlah pekerjaan yang sudah disetujui (bisa di bawah pagu) ·
        <b>Terikat</b> = sudah ada kontrak/deal, uangnya secara komersial sudah pergi ·
        <b>Realisasi</b> = sudah jadi tagihan atau biaya nyata.
        Sisa pagu dihitung dari <b>terikat</b> — kalau memakai realisasi, pagu terlihat longgar sepanjang tahun lalu habis mendadak di akhir.
      </div>

      <div class="grid md:grid-cols-2 gap-4">
        <div v-for="j in (['capex','opex'] as const)" :key="j"
          class="bg-white rounded-xl border p-5"
          :class="serapan[j].melebihi_pagu ? 'border-red-300' : 'border-gray-200'">
          <div class="flex items-baseline justify-between">
            <h2 class="text-sm font-bold uppercase tracking-wide text-gray-700">{{ j }}</h2>
            <span v-if="serapan[j].melebihi_pagu"
              class="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">Melebihi pagu</span>
          </div>
          <p class="mt-1 text-2xl font-bold text-gray-900">{{ rp(serapan[j].terikat) }}</p>
          <p class="text-xs text-gray-500">terikat dari pagu {{ rp(serapan[j].pagu) }}</p>

          <div class="mt-3 h-3 rounded-full bg-gray-100 overflow-hidden flex">
            <div class="h-full bg-blue-600" :style="{ width: bar(serapan[j].realisasi, serapan[j].pagu) }" title="Realisasi"></div>
            <div class="h-full bg-blue-300" :style="{ width: bar(serapan[j].terikat - serapan[j].realisasi, serapan[j].pagu) }" title="Terikat belum jadi tagihan"></div>
            <div class="h-full bg-amber-200" :style="{ width: bar(serapan[j].pipeline, serapan[j].pagu) }" title="Pipeline (belum deal)"></div>
          </div>

          <dl class="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div class="flex justify-between"><dt class="text-gray-500">Rencana disetujui</dt><dd class="font-semibold">{{ rp(serapan[j].rencana) }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Belum dialokasikan</dt><dd class="font-semibold">{{ rp(serapan[j].belum_dialokasikan) }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Realisasi</dt><dd class="font-semibold">{{ rp(serapan[j].realisasi) }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Pipeline</dt><dd class="font-semibold text-amber-700">{{ rp(serapan[j].pipeline) }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Sisa pagu</dt>
              <dd class="font-bold" :class="serapan[j].sisa_pagu < 0 ? 'text-red-700' : 'text-emerald-700'">{{ rp(serapan[j].sisa_pagu) }}</dd></div>
            <div class="flex justify-between"><dt class="text-gray-500">Porsi unplanned</dt>
              <dd class="font-semibold" :class="serapan[j].porsi_unplanned_pct >= 30 ? 'text-amber-700' : 'text-gray-700'">{{ serapan[j].porsi_unplanned_pct }}%</dd></div>
          </dl>

          <p v-if="serapan[j].rencana_usulan > 0" class="mt-3 text-xs text-gray-500">
            Masih ada {{ rp(serapan[j].rencana_usulan) }} usulan yang belum diputuskan.
          </p>
          <p v-if="serapan[j].jml_belum_ada_proposal > 0" class="mt-1 text-xs text-gray-500">
            {{ serapan[j].jml_belum_ada_proposal }} pekerjaan sudah disetujui tapi belum punya proposal.
          </p>
        </div>
      </div>
    </template>

    <!-- Baris anggaran -->
    <div v-if="tahunId" class="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div class="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
        <h2 class="font-semibold text-gray-900">Daftar pekerjaan</h2>
        <div class="flex items-center gap-2 text-sm">
          <select v-model="filterJenis" class="px-2 py-1 border border-gray-300 rounded">
            <option value="">Semua jenis</option><option value="capex">CAPEX</option><option value="opex">OPEX</option>
          </select>
          <input v-model="cari" placeholder="Cari judul / departemen…"
            class="px-2 py-1 border border-gray-300 rounded w-56" />
        </div>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th class="px-4 py-2 text-left">Kode / Pekerjaan</th>
              <th class="px-4 py-2 text-left">Pemohon</th>
              <th class="px-4 py-2 text-right">Rencana</th>
              <th class="px-4 py-2 text-right">Terikat</th>
              <th class="px-4 py-2 text-right">Realisasi</th>
              <th class="px-4 py-2 text-right">Sisa</th>
              <th class="px-4 py-2 text-left">Status</th>
              <th class="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100">
            <tr v-for="l in tersaring" :key="l.id" class="hover:bg-gray-50">
              <td class="px-4 py-2">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-mono text-gray-500">{{ l.code }}</span>
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    :class="l.type === 'capex' ? 'bg-indigo-100 text-indigo-700' : 'bg-teal-100 text-teal-700'">
                    {{ l.type.toUpperCase() }}
                  </span>
                  <span v-if="l.is_unplanned" class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800"
                    :title="l.unplanned_reason">unplanned</span>
                </div>
                <div class="font-medium text-gray-900">{{ l.title }}</div>
                <div v-if="l.jml_proposal" class="text-xs text-gray-500">
                  {{ l.jml_proposal }} proposal, {{ l.jml_deal }} deal
                </div>
              </td>
              <td class="px-4 py-2 text-gray-600">{{ l.requesting_department || '—' }}</td>
              <td class="px-4 py-2 text-right">{{ rp(l.planned_amount) }}</td>
              <td class="px-4 py-2 text-right font-semibold">{{ rp(l.terikat) }}</td>
              <td class="px-4 py-2 text-right text-gray-600">{{ rp(l.realisasi) }}</td>
              <td class="px-4 py-2 text-right font-semibold"
                :class="l.sisa_rencana < 0 ? 'text-red-700' : 'text-gray-700'">{{ rp(l.sisa_rencana) }}</td>
              <td class="px-4 py-2">
                <span class="text-xs font-semibold px-2 py-0.5 rounded" :class="warnaStatus(l.status)">{{ l.status }}</span>
                <div v-if="l.rejected_reason" class="text-xs text-red-600 mt-0.5">{{ l.rejected_reason }}</div>
              </td>
              <td class="px-4 py-2 text-right whitespace-nowrap">
                <button v-if="l.status === 'usulan'" @click="ubahStatus(l, 'disetujui')"
                  class="text-xs font-semibold text-emerald-700 hover:underline">Setujui</button>
                <button v-if="l.status === 'usulan'" @click="tolak(l)"
                  class="ml-2 text-xs font-semibold text-red-700 hover:underline">Tolak</button>
              </td>
            </tr>
            <tr v-if="!tersaring.length">
              <td colspan="8" class="px-4 py-8 text-center text-gray-500">Belum ada pekerjaan yang terdaftar di tahun ini.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Dialog tahun -->
    <div v-if="showTahun" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="showTahun = false">
      <div class="bg-white rounded-xl w-full max-w-md p-5 space-y-3">
        <h3 class="font-bold text-lg">Tahun anggaran baru</h3>
        <label class="block text-sm">Tahun
          <input v-model.number="fTahun.year" type="number" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
        <label class="block text-sm">Pagu CAPEX
          <input v-model.number="fTahun.capex_ceiling" type="number" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
        <label class="block text-sm">Pagu OPEX
          <input v-model.number="fTahun.opex_ceiling" type="number" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
        <div class="flex justify-end gap-2 pt-2">
          <button @click="showTahun = false" class="px-4 py-2 text-sm">Batal</button>
          <button @click="simpanTahun" :disabled="sibuk"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Simpan</button>
        </div>
      </div>
    </div>

    <!-- Dialog baris -->
    <div v-if="showBaris" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="showBaris = false">
      <div class="bg-white rounded-xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <h3 class="font-bold text-lg">Pekerjaan baru — {{ aktif?.year }}</h3>
        <!-- Tahun yang sudah berjalan hanya menerima pekerjaan di luar rencana.
             Formulirnya mengatakan itu di depan, bukan menunggu server menolak. -->
        <div v-if="wajibUnplanned" class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">
          Tahun {{ aktif?.year }} sudah <b>{{ aktif?.status }}</b>. Pekerjaan yang masuk sekarang tercatat sebagai
          <b>di luar rencana</b> dan alasannya wajib diisi.
        </div>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">Jenis
            <select v-model="fBaris.type" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value="capex">CAPEX</option><option value="opex">OPEX</option></select></label>
          <label class="block text-sm">Kode <span class="text-gray-400">(opsional)</span>
            <input v-model="fBaris.code" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
        </div>
        <label class="block text-sm">Judul pekerjaan
          <input v-model="fBaris.title" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
        <div class="grid grid-cols-2 gap-3">
          <label class="block text-sm">Departemen pemohon
            <input v-model="fBaris.requesting_department" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
          <label class="block text-sm">Prioritas
            <select v-model="fBaris.priority" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value="tinggi">Tinggi</option><option value="normal">Normal</option><option value="rendah">Rendah</option></select></label>
        </div>
        <label class="block text-sm">Nilai rencana (Rp)
          <input v-model.number="fBaris.planned_amount" type="number" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg" /></label>
        <label class="block text-sm">Justifikasi
          <textarea v-model="fBaris.justification" rows="2" class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"></textarea></label>
        <label v-if="wajibUnplanned" class="block text-sm">Alasan di luar rencana <span class="text-red-600">*</span>
          <textarea v-model="fBaris.unplanned_reason" rows="2"
            placeholder="Mis. kebocoran terdeteksi saat shutdown, tidak masuk rencana awal tahun"
            class="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg"></textarea></label>
        <p v-if="galatForm" class="text-sm text-red-700">{{ galatForm }}</p>
        <div class="flex justify-end gap-2 pt-2">
          <button @click="showBaris = false" class="px-4 py-2 text-sm">Batal</button>
          <button @click="simpanBaris" :disabled="sibuk"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">Simpan</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '@/lib/api';

const tahun = ref<any[]>([]);
const tahunId = ref<number | null>(null);
const lines = ref<any[]>([]);
const serapan = ref<any>(null);
const galat = ref('');
const galatForm = ref('');
const sibuk = ref(false);
const showTahun = ref(false);
const showBaris = ref(false);
const filterJenis = ref('');
const cari = ref('');

const fTahun = reactive({ year: new Date().getFullYear() + 1, capex_ceiling: 0, opex_ceiling: 0 });
const fBaris = reactive({
  code: '', type: 'capex', title: '', requesting_department: '',
  priority: 'normal', planned_amount: 0, justification: '', unplanned_reason: '',
});

const rp = (v: any) => 'Rp ' + Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: 0 });
const aktif = computed(() => tahun.value.find((t) => t.id === tahunId.value) || null);
const wajibUnplanned = computed(() => aktif.value?.status === 'active' || aktif.value?.status === 'approved');
// Bar dipotong di 100% supaya satu baris yang melebihi pagu tidak merusak
// tata letak — angka aslinya tetap ditampilkan apa adanya di sebelahnya.
const bar = (v: number, total: number) =>
  total > 0 ? Math.max(0, Math.min(100, (Number(v) / total) * 100)).toFixed(1) + '%' : '0%';
const warnaStatus = (s: string) =>
  s === 'disetujui' ? 'bg-emerald-100 text-emerald-700'
  : s === 'ditolak' ? 'bg-red-100 text-red-700'
  : s === 'dibatalkan' ? 'bg-gray-200 text-gray-600'
  : 'bg-amber-100 text-amber-800';

const tersaring = computed(() => lines.value.filter((l) => {
  if (filterJenis.value && l.type !== filterJenis.value) return false;
  const q = cari.value.trim().toLowerCase();
  if (!q) return true;
  return `${l.title} ${l.code} ${l.requesting_department || ''}`.toLowerCase().includes(q);
}));

async function muat() {
  galat.value = '';
  try {
    const r = await api.get('/budget/years');
    tahun.value = r.data?.years || [];
    if (tahun.value.length && !tahun.value.some((t) => t.id === tahunId.value)) {
      tahunId.value = tahun.value[0].id;
    }
    if (tahunId.value) await muatTahun();
  } catch (e: any) {
    galat.value = e?.response?.data?.error || 'Gagal memuat anggaran.';
  }
}

async function muatTahun() {
  if (!tahunId.value) return;
  try {
    const [a, b] = await Promise.all([
      api.get(`/budget/years/${tahunId.value}/lines`),
      api.get(`/budget/years/${tahunId.value}/serapan`),
    ]);
    lines.value = a.data?.lines || [];
    serapan.value = b.data;
    fBaris.type = 'capex';
  } catch (e: any) {
    galat.value = e?.response?.data?.error || 'Gagal memuat tahun anggaran.';
  }
}

async function simpanTahun() {
  sibuk.value = true;
  try {
    const r = await api.post('/budget/years', { ...fTahun });
    showTahun.value = false;
    await muat();
    tahunId.value = r.data?.id || tahunId.value;
    await muatTahun();
  } catch (e: any) {
    galat.value = e?.response?.data?.error || 'Gagal menyimpan tahun.';
  } finally { sibuk.value = false; }
}

async function simpanBaris() {
  galatForm.value = ''; sibuk.value = true;
  try {
    await api.post(`/budget/years/${tahunId.value}/lines`, {
      ...fBaris,
      is_unplanned: wajibUnplanned.value,
      unplanned_reason: wajibUnplanned.value ? fBaris.unplanned_reason : null,
    });
    showBaris.value = false;
    Object.assign(fBaris, { code: '', title: '', requesting_department: '', planned_amount: 0, justification: '', unplanned_reason: '' });
    await muatTahun();
  } catch (e: any) {
    galatForm.value = e?.response?.data?.error || 'Gagal menyimpan pekerjaan.';
  } finally { sibuk.value = false; }
}

async function ubahStatus(l: any, status: string, reason?: string) {
  try {
    await api.put(`/budget/lines/${l.id}/status`, { status, reason });
    await muatTahun();
  } catch (e: any) {
    galat.value = e?.response?.data?.error || 'Gagal mengubah status.';
  }
}

function tolak(l: any) {
  // Penolakan wajib beralasan — ditanyakan di sini, bukan dibiarkan server tolak.
  const alasan = window.prompt(`Alasan menolak "${l.title}"?`);
  if (!alasan || !alasan.trim()) return;
  ubahStatus(l, 'ditolak', alasan.trim());
}

onMounted(muat);
</script>
