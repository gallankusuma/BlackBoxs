<template>
  <div class="p-6 max-w-5xl mx-auto" v-if="pnid">
    <button @click="$router.push(`/assets/production-lines/${pnid.production_line_id}`)" class="text-sm text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1">
      ← Kembali ke {{ pnid.production_line_name }}
    </button>

    <div class="mb-5">
      <div class="text-xs text-gray-400 font-mono">{{ pnid.production_line_code }} / {{ pnid.code }}</div>
      <h1 class="text-xl font-bold text-gray-800">📐 {{ pnid.code }} <span v-if="pnid.title" class="text-gray-400 font-normal">— {{ pnid.title }}</span></h1>
      <p class="text-sm text-gray-500 mt-0.5">{{ pnid.description || 'Tidak ada deskripsi' }} · Line: {{ pnid.production_line_name }}</p>
    </div>

    <!-- Quick add asset -->
    <div class="bg-gray-50 border rounded-xl p-4 mb-5">
      <h3 class="text-sm font-semibold text-gray-700 mb-3">+ Tambah Aset ke P&amp;ID Ini</h3>
      <div class="grid grid-cols-4 gap-2 mb-2">
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Kategori</label>
          <select v-model.number="form.category_id" class="w-full border rounded px-2 py-1.5 text-xs">
            <option v-for="c in lineCategories" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
        </div>
        <div class="col-span-2">
          <label class="block text-[10px] text-gray-500 mb-1">Nama Aset</label>
          <input v-model="form.name" type="text" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="mis. Pompa Transfer">
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Tag Equipment</label>
          <input v-model="form.pnid_tag" type="text" class="w-full border rounded px-2 py-1.5 text-xs" placeholder="P-101">
        </div>
      </div>
      <div class="grid grid-cols-4 gap-2 mb-3">
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Tgl. Beli</label>
          <input v-model="form.purchase_date" type="date" class="w-full border rounded px-2 py-1.5 text-xs">
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Harga Beli (Rp)</label>
          <input v-model.number="form.purchase_price" type="number" class="w-full border rounded px-2 py-1.5 text-xs">
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Umur Ekonomis (thn)</label>
          <input v-model.number="form.useful_life_years" type="number" min="1" class="w-full border rounded px-2 py-1.5 text-xs">
        </div>
        <div>
          <label class="block text-[10px] text-gray-500 mb-1">Vendor</label>
          <input v-model="form.vendor" type="text" class="w-full border rounded px-2 py-1.5 text-xs">
        </div>
      </div>
      <div class="flex justify-end">
        <button @click="addAsset" :disabled="saving" class="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
          {{ saving ? 'Menyimpan...' : '+ Tambah Aset' }}
        </button>
      </div>
    </div>

    <!-- Asset list for this P&ID -->
    <div class="bg-white border rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b"><tr class="text-left text-gray-600">
          <th class="px-4 py-2.5">Kode</th><th class="px-4 py-2.5">Kategori</th><th class="px-4 py-2.5">Tag</th>
          <th class="px-4 py-2.5">Nama</th><th class="px-4 py-2.5 text-right">Nilai Buku</th><th class="px-4 py-2.5">Status</th><th></th>
        </tr></thead>
        <tbody>
          <tr v-if="loading"><td colspan="7" class="text-center py-8 text-gray-400">Memuat...</td></tr>
          <tr v-else-if="!assets.length"><td colspan="7" class="text-center py-8 text-gray-400">Belum ada aset di P&amp;ID ini.</td></tr>
          <tr v-for="a in assets" :key="a.id" @click="$router.push(`/assets/${a.id}`)" class="border-b hover:bg-blue-50/50 cursor-pointer">
            <td class="px-4 py-2.5 font-medium text-gray-700">{{ a.asset_code }}</td>
            <td class="px-4 py-2.5"><span class="px-2 py-0.5 bg-gray-100 rounded text-xs">{{ a.category_name }}</span></td>
            <td class="px-4 py-2.5 text-purple-700">{{ a.pnid_tag || '-' }}</td>
            <td class="px-4 py-2.5">{{ a.name }}</td>
            <td class="px-4 py-2.5 text-right font-semibold text-green-700">{{ formatCurrency(a.book_value) }}</td>
            <td class="px-4 py-2.5"><span :class="statusBadge(a.status)" class="px-2 py-0.5 rounded text-xs font-medium">{{ statusLabel(a.status) }}</span></td>
            <td class="px-4 py-2.5 text-right"><button @click.stop="deleteAsset(a)" class="text-gray-400 hover:text-red-600">🗑</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else class="p-10 text-center text-gray-400">Memuat...</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

const route = useRoute();
const pnidId = Array.isArray(route.params.id) ? route.params.id[0] : route.params.id;

const pnid = ref<any>(null);
const assets = ref<any[]>([]);
const categories = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);

const lineCategories = computed(() => categories.value.filter(c => c.requires_production_line));

const defaultForm = () => ({
  category_id: null as number | null,
  name: '',
  pnid_tag: '',
  purchase_date: '',
  purchase_price: 0,
  useful_life_years: 10,
  vendor: '',
});
const form = ref(defaultForm());

const statusLabel = (s: string) => ({ active: 'Aktif', disposed: 'Dilepas', under_maintenance: 'Perbaikan', idle: 'Idle' }[s] || s);
const statusBadge = (s: string) => ({
  active: 'bg-green-100 text-green-700',
  disposed: 'bg-gray-200 text-gray-600',
  under_maintenance: 'bg-amber-100 text-amber-700',
  idle: 'bg-blue-100 text-blue-700',
}[s] || 'bg-gray-100 text-gray-600');

async function loadAssets() {
  const { data } = await api.get('/assets', { params: { pnid_id: pnidId } });
  assets.value = data.data || [];
}

async function loadAll() {
  loading.value = true;
  try {
    const [pnidRes, catRes] = await Promise.all([
      api.get(`/assets/pnids/${pnidId}`),
      api.get('/assets/categories'),
    ]);
    pnid.value = pnidRes.data.data;
    categories.value = catRes.data.data || [];
    if (lineCategories.value.length) form.value.category_id = lineCategories.value[0].id;
    await loadAssets();
  } finally {
    loading.value = false;
  }
}

async function addAsset() {
  if (!form.value.category_id || !form.value.name) {
    alert('Kategori dan Nama Aset wajib diisi');
    return;
  }
  saving.value = true;
  try {
    await api.post('/assets', { ...form.value, pnid_id: Number(pnidId) });
    const keepCategory = form.value.category_id;
    form.value = defaultForm();
    form.value.category_id = keepCategory;
    await loadAssets();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menyimpan aset');
  } finally {
    saving.value = false;
  }
}

async function deleteAsset(a: any) {
  if (!confirm(`Hapus aset "${a.name}"?`)) return;
  await api.delete(`/assets/${a.id}`);
  await loadAssets();
}

onMounted(loadAll);
</script>
