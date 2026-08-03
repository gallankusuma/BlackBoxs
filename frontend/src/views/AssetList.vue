<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h1 class="text-xl font-bold text-gray-800">🏭 Asset Management</h1>
        <p class="text-sm text-gray-500">Pengelolaan aset pabrik — tanah, bangunan, piping, electrical, instrumen, mesin, dll</p>
      </div>
      <div class="flex gap-2">
        <router-link to="/assets/production-lines" class="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          ⚙️ Kelola Line Produksi
        </router-link>
        <button @click="openCreate" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700">
          + Tambah Aset
        </button>
      </div>
    </div>

    <!-- KPI summary -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <div class="bg-white border rounded-xl p-4">
        <div class="text-xs text-gray-500">Jumlah Aset</div>
        <div class="text-xl font-bold text-gray-800">{{ summary.totals?.count || 0 }}</div>
      </div>
      <div class="bg-white border rounded-xl p-4">
        <div class="text-xs text-gray-500">Total Nilai Perolehan</div>
        <div class="text-xl font-bold text-gray-800">{{ formatCurrency(summary.totals?.purchase_total) }}</div>
      </div>
      <div class="bg-white border rounded-xl p-4">
        <div class="text-xs text-gray-500">Akumulasi Penyusutan</div>
        <div class="text-xl font-bold text-red-600">{{ formatCurrency(summary.totals?.accumulated_depreciation_total) }}</div>
      </div>
      <div class="bg-white border rounded-xl p-4">
        <div class="text-xs text-gray-500">Nilai Buku Saat Ini</div>
        <div class="text-xl font-bold text-green-700">{{ formatCurrency(summary.totals?.book_value_total) }}</div>
      </div>
    </div>

    <!-- Category filter tabs -->
    <div class="flex gap-1 mb-4 bg-gray-100 p-1 rounded-xl w-fit flex-wrap">
      <button @click="activeCategory = null"
        :class="activeCategory === null ? 'bg-white text-blue-600 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'"
        class="px-4 py-1.5 rounded-lg text-sm transition-all">
        Semua
      </button>
      <button v-for="c in categories" :key="c.id" @click="activeCategory = c.code"
        :class="activeCategory === c.code ? 'bg-white text-blue-600 shadow font-semibold' : 'text-gray-500 hover:text-gray-700'"
        class="px-4 py-1.5 rounded-lg text-sm transition-all">
        {{ c.name }}
      </button>
    </div>

    <!-- Assets table -->
    <div class="bg-white border rounded-xl overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr class="text-left text-gray-600">
            <th class="px-4 py-2.5">Kode Aset</th>
            <th class="px-4 py-2.5">Nama</th>
            <th class="px-4 py-2.5">Kategori</th>
            <th class="px-4 py-2.5">Lokasi / Line</th>
            <th class="px-4 py-2.5 text-right">Harga Beli</th>
            <th class="px-4 py-2.5 text-right">Nilai Buku</th>
            <th class="px-4 py-2.5 text-right">Depresiasi</th>
            <th class="px-4 py-2.5">Status</th>
            <th class="px-4 py-2.5"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading"><td colspan="9" class="text-center py-8 text-gray-400">Memuat...</td></tr>
          <tr v-else-if="!filteredAssets.length"><td colspan="9" class="text-center py-8 text-gray-400">Belum ada aset di kategori ini.</td></tr>
          <tr v-for="a in filteredAssets" :key="a.id" @click="$router.push(`/assets/${a.id}`)"
            class="border-b hover:bg-blue-50/50 cursor-pointer">
            <td class="px-4 py-2.5 font-medium text-gray-700">{{ a.asset_code }}</td>
            <td class="px-4 py-2.5">{{ a.name }}</td>
            <td class="px-4 py-2.5">
              <span class="px-2 py-0.5 bg-gray-100 rounded text-xs">{{ a.category_name }}</span>
            </td>
            <td class="px-4 py-2.5 text-gray-500">{{ a.production_line_name || a.location || '-' }}</td>
            <td class="px-4 py-2.5 text-right">{{ formatCurrency(a.purchase_price) }}</td>
            <td class="px-4 py-2.5 text-right font-semibold text-green-700">{{ formatCurrency(a.book_value) }}</td>
            <td class="px-4 py-2.5 text-right text-red-600">{{ a.percent_depreciated }}%</td>
            <td class="px-4 py-2.5">
              <span :class="statusBadge(a.status)" class="px-2 py-0.5 rounded text-xs font-medium">{{ statusLabel(a.status) }}</span>
            </td>
            <td class="px-4 py-2.5 text-right">
              <button @click.stop="deleteAsset(a)" class="text-gray-400 hover:text-red-600">🗑</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create modal -->
    <div v-if="showCreateModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" @click.self="showCreateModal = false">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h3 class="font-bold text-gray-800">+ Tambah Aset</h3>
          <button @click="showCreateModal = false" class="text-gray-400 hover:text-gray-700 text-2xl leading-none">&times;</button>
        </div>
        <div class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Kategori</label>
              <select v-model.number="form.category_id" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Nama Aset</label>
              <input v-model="form.name" type="text" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="mis. Tangki Reaktor 5000L">
            </div>
          </div>

          <div v-if="selectedCategoryRequiresLine" class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Line Produksi</label>
              <select v-model.number="form.production_line_id" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option :value="null">— Pilih Line —</option>
                <option v-for="p in productionLines" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Tag P&amp;ID</label>
              <input v-model="form.pnid_tag" type="text" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="mis. P-101">
            </div>
          </div>
          <div v-else>
            <label class="block text-xs font-medium text-gray-600 mb-1">Lokasi</label>
            <input v-model="form.location" type="text" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="mis. Blok A, Cilegon">
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Tgl. Beli</label>
              <input v-model="form.purchase_date" type="date" class="w-full border rounded-lg px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Harga Beli (Rp)</label>
              <input v-model.number="form.purchase_price" type="number" class="w-full border rounded-lg px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Vendor</label>
              <input v-model="form.vendor" type="text" class="w-full border rounded-lg px-3 py-2 text-sm">
            </div>
          </div>

          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Umur Ekonomis (thn)</label>
              <input v-model.number="form.useful_life_years" type="number" min="1" class="w-full border rounded-lg px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Nilai Residu (Rp)</label>
              <input v-model.number="form.salvage_value" type="number" class="w-full border rounded-lg px-3 py-2 text-sm">
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">Metode Depresiasi</label>
              <select v-model="form.depreciation_method" class="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="straight_line">Garis Lurus</option>
                <option value="declining_balance">Saldo Menurun</option>
              </select>
            </div>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Catatan</label>
            <textarea v-model="form.notes" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm"></textarea>
          </div>
        </div>
        <div class="px-6 py-4 border-t flex justify-end gap-3">
          <button @click="showCreateModal = false" class="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">Batal</button>
          <button @click="createAsset" :disabled="saving" class="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {{ saving ? 'Menyimpan...' : 'Simpan Aset' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

const route = useRoute();
const categories = ref<any[]>([]);
const productionLines = ref<any[]>([]);
const assets = ref<any[]>([]);
const summary = ref<any>({ totals: {}, by_category: [] });
const loading = ref(true);
const activeCategory = ref<string | null>((route.query.category as string) || null);
watch(() => route.query.category, (c) => { activeCategory.value = (c as string) || null; });
const showCreateModal = ref(false);
const saving = ref(false);

const defaultForm = () => ({
  category_id: null as number | null,
  production_line_id: null as number | null,
  pnid_tag: '',
  name: '',
  location: '',
  purchase_date: '',
  purchase_price: 0,
  vendor: '',
  useful_life_years: 10,
  salvage_value: 0,
  depreciation_method: 'straight_line',
  status: 'active',
  notes: '',
});
const form = ref(defaultForm());

const filteredAssets = computed(() => {
  if (!activeCategory.value) return assets.value;
  return assets.value.filter(a => a.category_code === activeCategory.value);
});

const selectedCategoryRequiresLine = computed(() => {
  const cat = categories.value.find(c => c.id === form.value.category_id);
  return !!cat?.requires_production_line;
});

const statusLabel = (s: string) => ({ active: 'Aktif', disposed: 'Dilepas', under_maintenance: 'Perbaikan', idle: 'Idle' }[s] || s);
const statusBadge = (s: string) => ({
  active: 'bg-green-100 text-green-700',
  disposed: 'bg-gray-200 text-gray-600',
  under_maintenance: 'bg-amber-100 text-amber-700',
  idle: 'bg-blue-100 text-blue-700',
}[s] || 'bg-gray-100 text-gray-600');

async function loadAll() {
  loading.value = true;
  try {
    const [catRes, lineRes, assetRes, summaryRes] = await Promise.all([
      api.get('/assets/categories'),
      api.get('/assets/production-lines'),
      api.get('/assets'),
      api.get('/assets/summary'),
    ]);
    categories.value = catRes.data.data || [];
    productionLines.value = lineRes.data.data || [];
    assets.value = assetRes.data.data || [];
    summary.value = summaryRes.data || { totals: {}, by_category: [] };
  } catch (e) {
    console.error('Failed to load assets', e);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  form.value = defaultForm();
  if (categories.value.length) form.value.category_id = categories.value[0].id;
  showCreateModal.value = true;
}

async function createAsset() {
  if (!form.value.category_id || !form.value.name) {
    alert('Kategori dan Nama Aset wajib diisi');
    return;
  }
  saving.value = true;
  try {
    await api.post('/assets', form.value);
    showCreateModal.value = false;
    await loadAll();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menyimpan aset');
  } finally {
    saving.value = false;
  }
}

async function deleteAsset(a: any) {
  if (!confirm(`Hapus aset "${a.name}"? Data dokumen, riwayat perbaikan & pembelian ikut terhapus.`)) return;
  try {
    await api.delete(`/assets/${a.id}`);
    await loadAll();
  } catch (e: any) {
    alert(e?.response?.data?.error || 'Gagal menghapus aset');
  }
}

onMounted(loadAll);
</script>
