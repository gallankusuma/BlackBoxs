<template>
  <div class="p-6">
    <div class="mb-6 text-center">
      <h1 class="text-2xl font-bold text-gray-800">HARGA SATUAN PEKERJAAN (HSP) KONSTRUKSI</h1>
      <p class="text-sm text-gray-600">Bidang Cipta Karya dan Perumahan • Edisi Ke-2 (Draft) Tahun 2025</p>
    </div>

    <div class="bg-white rounded-lg shadow p-4 mb-4">
      <div class="flex flex-wrap gap-3 items-center justify-between">
        <div class="flex items-center gap-3">
          <button class="px-4 py-2 rounded bg-blue-600 text-white">Penjelasan</button>
          <select class="border border-gray-300 rounded px-3 py-2 text-sm">
            <option>Kab. Cilacap</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-600">Search:</label>
          <input v-model="search" type="text" class="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Cari kode/nama..." />
        </div>
      </div>
    </div>

    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full text-sm">
        <thead class="bg-blue-600 text-white">
          <tr>
            <th class="px-4 py-3 text-left w-16">No.</th>
            <th class="px-4 py-3 text-left w-28">Kode</th>
            <th class="px-4 py-3 text-left">Uraian Pekerjaan</th>
            <th class="px-4 py-3 text-center w-20">Satuan</th>
            <th class="px-4 py-3 text-right w-40">Harga Satuan (Rp)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="(item, index) in filteredHsp" :key="item.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-center text-gray-600">{{ index + 1 }}</td>
            <td class="px-4 py-3 font-mono text-xs text-gray-900">{{ item.kode }}</td>
            <td class="px-4 py-3">
              <button class="text-blue-600 hover:underline text-left" @click="openDetail(item)">
                {{ item.name }}
              </button>
            </td>
            <td class="px-4 py-3 text-center text-gray-600">{{ item.satuan }}</td>
            <td class="px-4 py-3 text-right font-semibold text-gray-900">{{ formatCurrency(item.harga_satuan) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="filteredHsp.length === 0" class="p-8 text-center text-gray-500">
        Tidak ada data HSP.
      </div>
    </div>

    <!-- Detail Modal -->
    <div v-if="showDetail" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="closeDetail">
      <div class="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[85vh] overflow-auto">
        <div class="p-4 border-b flex items-center justify-between">
          <div>
            <h2 class="text-lg font-bold">Analisa Harga Satuan Pekerjaan</h2>
            <p class="text-sm text-gray-600">{{ selectedHsp?.kode }} - {{ selectedHsp?.name }}</p>
          </div>
          <button class="text-gray-500 hover:text-gray-800" @click="closeDetail">✕</button>
        </div>

        <div class="p-4">
          <table class="min-w-full text-sm">
            <thead class="bg-blue-600 text-white">
              <tr>
                <th class="px-3 py-2 text-left w-14">No.</th>
                <th class="px-3 py-2 text-left">Uraian</th>
                <th class="px-3 py-2 text-left w-20">Kode</th>
                <th class="px-3 py-2 text-center w-20">Satuan</th>
                <th class="px-3 py-2 text-right w-20">Koef.</th>
                <th class="px-3 py-2 text-right w-28">Harga</th>
                <th class="px-3 py-2 text-right w-28">Jumlah</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">A</td>
                <td class="px-3 py-2 font-bold" colspan="6">Tenaga Kerja</td>
              </tr>
              <tr v-for="(row, idx) in sectionA" :key="`A-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">B</td>
                <td class="px-3 py-2 font-bold" colspan="6">Bahan</td>
              </tr>
              <tr v-for="(row, idx) in sectionB" :key="`B-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-50">
                <td class="px-3 py-2 font-bold">C</td>
                <td class="px-3 py-2 font-bold" colspan="6">Peralatan</td>
              </tr>
              <tr v-for="(row, idx) in sectionC" :key="`C-${idx}`">
                <td class="px-3 py-2 text-center text-gray-600">{{ idx + 1 }}</td>
                <td class="px-3 py-2">{{ row.resource_name }}</td>
                <td class="px-3 py-2 text-xs font-mono">{{ row.resource_code || '-' }}</td>
                <td class="px-3 py-2 text-center">{{ row.resource_satuan }}</td>
                <td class="px-3 py-2 text-right">{{ formatNumber(row.koefisien) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.resource_harga) }}</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(row.jumlah_harga) }}</td>
              </tr>
              <tr class="bg-gray-100 font-semibold">
                <td class="px-3 py-2">D</td>
                <td class="px-3 py-2" colspan="5">Jumlah Harga Tenaga, Bahan dan Peralatan (A+B+C)</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(selectedHsp?.harga_langsung || 0) }}</td>
              </tr>
              <tr class="bg-gray-100 font-semibold">
                <td class="px-3 py-2">E</td>
                <td class="px-3 py-2" colspan="5">Overhead + profit (10%)</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(selectedHsp?.overhead_profit || 0) }}</td>
              </tr>
              <tr class="bg-gray-200 font-bold">
                <td class="px-3 py-2">F</td>
                <td class="px-3 py-2" colspan="5">Harga Satuan Pekerjaan (D+E)</td>
                <td class="px-3 py-2 text-right">{{ formatCurrency(selectedHsp?.harga_satuan || 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="p-4 border-t flex justify-end">
          <button class="px-4 py-2 bg-gray-700 text-white rounded" @click="closeDetail">Tutup</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

interface HspItem {
  id: number;
  kode: string;
  name: string;
  satuan: string;
  harga_satuan: number;
  harga_langsung?: number;
  overhead_profit?: number;
}

interface HspDetailItem {
  section: string;
  koefisien: number;
  resource_name: string;
  resource_satuan: string;
  resource_harga: number;
  jumlah_harga: number;
  resource_code?: string;
}

const search = ref('');
const hspList = ref<HspItem[]>([]);
const showDetail = ref(false);
const selectedHsp = ref<any>(null);
const detailItems = ref<HspDetailItem[]>([]);

const filteredHsp = computed(() => {
  const q = search.value.toLowerCase();
  if (!q) return hspList.value;
  return hspList.value.filter(item =>
    item.kode.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
  );
});

const sectionA = computed(() => detailItems.value.filter(i => i.section === 'A'));
const sectionB = computed(() => detailItems.value.filter(i => i.section === 'B'));
const sectionC = computed(() => detailItems.value.filter(i => i.section === 'C'));

const loadHsp = async () => {
  const { data } = await api.get('/estimator/ahsp');
  hspList.value = data || [];
};

const openDetail = async (item: HspItem) => {
  const { data } = await api.get(`/estimator/ahsp/${item.id}`);
  selectedHsp.value = data;
  detailItems.value = (data.items || []).map((row: any) => ({
    ...row,
    jumlah_harga: row.jumlah_harga ?? (parseFloat(row.koefisien) * parseFloat(row.resource_harga))
  }));
  showDetail.value = true;
};

const closeDetail = () => {
  showDetail.value = false;
  selectedHsp.value = null;
  detailItems.value = [];
};



const formatNumber = (value: number) => {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value || 0);
};

onMounted(() => {
  loadHsp();
});
</script>
