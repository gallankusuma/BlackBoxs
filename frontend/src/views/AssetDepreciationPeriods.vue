<template>
  <div class="p-6 max-w-4xl mx-auto">
    <button @click="$router.push('/assets')" class="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1">
      ← Kembali ke Asset Register
    </button>

    <div class="mb-5">
      <h1 class="text-xl font-bold text-gray-800">🔒 Periode Depresiasi</h1>
      <p class="text-sm text-gray-500">
        Menutup periode akan mengunci nilai penyusutan bulan tersebut. Setelah dikunci,
        mengubah harga perolehan atau umur ekonomis tidak lagi mengubah laporan bulan itu.
      </p>
    </div>

    <!-- Penjelasan kondisi awal -->
    <div v-if="!hasClosedPeriod" class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-5 text-sm text-blue-900">
      <div class="font-semibold mb-1">Belum ada periode yang ditutup</div>
      Selama belum ada periode yang dikunci, nilai penyusutan dihitung ulang setiap kali halaman dibuka —
      persis seperti selama ini. Mulailah mengunci dari bulan paling awal yang laporannya sudah final.
    </div>

    <!-- Form tutup periode -->
    <div class="bg-white border rounded-xl p-5 mb-5">
      <h2 class="font-semibold text-gray-700 mb-3">Tutup Periode</h2>
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label class="block text-xs text-gray-500 mb-1">Tahun</label>
          <input v-model.number="form.period_year" type="number" class="border rounded-lg px-3 py-2 text-sm w-28">
        </div>
        <div>
          <label class="block text-xs text-gray-500 mb-1">Bulan</label>
          <select v-model.number="form.period_month" class="border rounded-lg px-3 py-2 text-sm">
            <option v-for="(m, i) in monthNames" :key="i" :value="i + 1">{{ m }}</option>
          </select>
        </div>
        <div class="flex-1 min-w-[180px]">
          <label class="block text-xs text-gray-500 mb-1">Catatan (opsional)</label>
          <input v-model="form.notes" type="text" class="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="mis. Tutup buku Q1">
        </div>
        <button @click="closePeriod" :disabled="busy"
          class="px-5 py-2 bg-amber-600 text-white rounded-lg text-sm font-semibold hover:bg-amber-700 disabled:opacity-50">
          {{ busy ? 'Memproses...' : '🔒 Tutup Periode' }}
        </button>
      </div>
      <p v-if="nextSuggestion" class="text-xs text-gray-500 mt-2">
        Periode berikutnya yang perlu ditutup: <strong>{{ nextSuggestion }}</strong>
      </p>
      <div v-if="message" :class="messageType === 'error' ? 'text-red-600' : 'text-green-700'"
        class="text-sm mt-3">{{ message }}</div>
    </div>

    <!-- Riwayat periode -->
    <div class="bg-white border rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b"><tr class="text-left text-gray-600">
          <th class="px-4 py-2">Periode</th>
          <th class="px-4 py-2">Status</th>
          <th class="px-4 py-2 text-right">Aset Diposting</th>
          <th class="px-4 py-2">Ditutup</th>
          <th class="px-4 py-2">Oleh</th>
          <th class="px-4 py-2"></th>
        </tr></thead>
        <tbody>
          <tr v-if="!periods.length">
            <td colspan="6" class="text-center py-8 text-gray-400">Belum ada periode yang pernah ditutup.</td>
          </tr>
          <tr v-for="p in periods" :key="`${p.period_year}-${p.period_month}`" class="border-b">
            <td class="px-4 py-2 font-medium">{{ monthNames[p.period_month - 1] }} {{ p.period_year }}</td>
            <td class="px-4 py-2">
              <span :class="p.status === 'closed' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'"
                class="px-2 py-0.5 rounded text-xs font-medium">
                {{ p.status === 'closed' ? 'Terkunci' : 'Terbuka' }}
              </span>
            </td>
            <td class="px-4 py-2 text-right text-gray-600">{{ p.entry_count || 0 }}</td>
            <td class="px-4 py-2 text-gray-500">{{ p.closed_at ? formatDate(p.closed_at) : '-' }}</td>
            <td class="px-4 py-2 text-gray-500">{{ p.closed_by_name || '-' }}</td>
            <td class="px-4 py-2 text-right">
              <button v-if="p.status === 'closed' && isLastClosed(p)" @click="reopenPeriod(p)"
                class="text-xs text-gray-500 hover:text-red-600">Buka kembali</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="text-xs text-gray-400 mt-3">
      Periode harus ditutup berurutan, dan hanya periode terakhir yang bisa dibuka kembali.
    </p>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useApi } from '../lib/api';

const { api } = useApi();

const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const periods = ref<any[]>([]);
const busy = ref(false);
const message = ref('');
const messageType = ref<'ok' | 'error'>('ok');

const now = new Date();
const form = ref({
  period_year: now.getFullYear(),
  period_month: now.getMonth() || 12, // default bulan lalu
  notes: '',
});

const closedPeriods = computed(() =>
  periods.value.filter(p => p.status === 'closed')
    .sort((a, b) => (b.period_year - a.period_year) || (b.period_month - a.period_month)));

const hasClosedPeriod = computed(() => closedPeriods.value.length > 0);

// Hanya periode terakhir yang boleh dibuka kembali — sama seperti aturan backend
const isLastClosed = (p: any) => {
  const last = closedPeriods.value[0];
  return last && last.period_year === p.period_year && last.period_month === p.period_month;
};

const nextSuggestion = computed(() => {
  const last = closedPeriods.value[0];
  if (!last) return null;
  const year = last.period_month === 12 ? last.period_year + 1 : last.period_year;
  const month = last.period_month === 12 ? 1 : last.period_month + 1;
  return `${monthNames[month - 1]} ${year}`;
});

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function load() {
  try {
    const { data } = await api.get('/assets/depreciation/periods');
    periods.value = data.data || [];
  } catch {
    periods.value = [];
  }
}

async function closePeriod() {
  const label = `${monthNames[form.value.period_month - 1]} ${form.value.period_year}`;
  const ok = confirm(
    `Tutup periode ${label}?\n\n` +
    'Nilai penyusutan seluruh aset untuk bulan tersebut akan dihitung dan DIKUNCI.\n' +
    'Setelah itu, mengubah harga perolehan atau umur ekonomis tidak lagi mengubah\n' +
    'laporan bulan tersebut — perubahan hanya berlaku untuk periode berikutnya.'
  );
  if (!ok) return;

  busy.value = true;
  message.value = '';
  try {
    const { data } = await api.post('/assets/depreciation/periods/close', form.value);
    messageType.value = 'ok';
    message.value = `${data.message}. ${data.posted_count} aset diposting, total penyusutan ${formatCurrency(data.total_depreciation)}.`;
    form.value.notes = '';
    await load();
  } catch (err: any) {
    messageType.value = 'error';
    message.value = err?.response?.data?.error || 'Gagal menutup periode';
  } finally {
    busy.value = false;
  }
}

async function reopenPeriod(p: any) {
  const label = `${monthNames[p.period_month - 1]} ${p.period_year}`;
  const ok = confirm(
    `Buka kembali periode ${label}?\n\n` +
    'Seluruh catatan penyusutan bulan tersebut akan dihapus dan nilainya kembali\n' +
    'dihitung dinamis. Lakukan hanya bila memang ada koreksi yang harus masuk\n' +
    'ke bulan itu.'
  );
  if (!ok) return;

  busy.value = true;
  message.value = '';
  try {
    const { data } = await api.post('/assets/depreciation/periods/reopen', {
      period_year: p.period_year, period_month: p.period_month,
    });
    messageType.value = 'ok';
    message.value = data.message;
    await load();
  } catch (err: any) {
    messageType.value = 'error';
    message.value = err?.response?.data?.error || 'Gagal membuka periode';
  } finally {
    busy.value = false;
  }
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
    .format(Number(n) || 0);
}

onMounted(load);
</script>
