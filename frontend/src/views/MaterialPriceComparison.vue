<template>
  <div class="min-h-screen bg-gray-50 p-6">
    <div class="max-w-7xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Material Price Comparison</h2>
          <p class="text-sm text-gray-500 mt-1">Bandingkan harga material dari berbagai vendor (min. 3 vendor per item)</p>
        </div>
      </div>

      <!-- Stats Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-blue-500">
          <p class="text-sm text-gray-500">Total Material</p>
          <p class="text-2xl font-bold text-gray-900">{{ stats.total_materials || 0 }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-green-500 cursor-pointer" @click="activeFilter = 'complete'">
          <p class="text-sm text-gray-500">Lengkap (≥3 Vendor)</p>
          <p class="text-2xl font-bold text-green-600">{{ stats.complete_materials || 0 }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-yellow-500 cursor-pointer" @click="activeFilter = 'incomplete'">
          <p class="text-sm text-gray-500">Belum Lengkap (&lt;3)</p>
          <p class="text-2xl font-bold text-yellow-600">{{ stats.incomplete_materials || 0 }}</p>
        </div>
        <div class="bg-white rounded-lg shadow-sm p-4 border-l-4 border-red-500 cursor-pointer" @click="activeFilter = 'empty'">
          <p class="text-sm text-gray-500">Belum Ada Harga</p>
          <p class="text-2xl font-bold text-red-600">{{ stats.empty_materials || 0 }}</p>
        </div>
      </div>

      <!-- Search & Filters -->
      <div class="bg-white shadow-sm rounded-lg p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div class="flex-1 min-w-[250px]">
          <label class="block text-sm font-medium text-gray-700 mb-1">Cari Material</label>
          <input v-model="searchQuery" @input="debouncedSearch" type="text" placeholder="Nama atau kode material..." 
            class="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Filter</label>
          <select v-model="activeFilter" @change="loadComparison" class="border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="all">Semua Material</option>
            <option value="complete">Lengkap (≥3 Vendor)</option>
            <option value="incomplete">Belum Lengkap</option>
            <option value="empty">Belum Ada Harga</option>
          </select>
        </div>
        <button @click="activeFilter = 'all'; searchQuery = ''; loadComparison()" 
          class="px-3 py-2 text-sm bg-gray-200 rounded-md hover:bg-gray-300">Reset</button>
      </div>

      <!-- Material List View (default) -->
      <div v-if="!selectedMaterial" class="bg-white shadow-sm rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Kode</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nama Material</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Satuan</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Harga Dasar</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Vendor</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Termurah</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Termahal</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Sumber</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-if="loading" >
              <td colspan="9" class="px-4 py-8 text-center text-gray-500">Loading...</td>
            </tr>
            <tr v-else-if="materials.length === 0">
              <td colspan="9" class="px-4 py-8 text-center text-gray-500">Tidak ada data</td>
            </tr>
            <tr v-for="m in materials" :key="m.id" class="hover:bg-gray-50 cursor-pointer" @click="openMaterial(m)">
              <td class="px-4 py-3 text-sm text-gray-500 font-mono">{{ m.code }}</td>
              <td class="px-4 py-3 text-sm text-gray-900 font-medium">{{ m.name }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ m.satuan }}</td>
              <td class="px-4 py-3 text-sm text-right">{{ formatPrice(m.base_price) }}</td>
              <td class="px-4 py-3 text-center">
                <span :class="vendorCountClass(m.vendor_count)" class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium">
                  {{ m.vendor_count }} vendor
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-right text-green-600 font-medium">{{ m.cheapest_price ? formatPrice(m.cheapest_price) : '-' }}</td>
              <td class="px-4 py-3 text-sm text-right text-red-500">{{ m.highest_price ? formatPrice(m.highest_price) : '-' }}</td>
              <td class="px-4 py-3 text-center">
                <div class="flex gap-1 justify-center">
                  <span v-for="src in parseSources(m.sources)" :key="src" :class="sourceClass(src)" class="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium uppercase">{{ src }}</span>
                </div>
              </td>
              <td class="px-4 py-3 text-right">
                <button @click.stop="openMaterial(m)" class="text-blue-600 hover:text-blue-800 text-sm font-medium">Detail</button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
          <span class="text-sm text-gray-500">Halaman {{ currentPage }} dari {{ totalPages }} ({{ totalCount }} material)</span>
          <div class="flex gap-2">
            <button @click="currentPage--; loadComparison()" :disabled="currentPage <= 1" class="px-3 py-1 text-sm border rounded-md disabled:opacity-50">Prev</button>
            <button @click="currentPage++; loadComparison()" :disabled="currentPage >= totalPages" class="px-3 py-1 text-sm border rounded-md disabled:opacity-50">Next</button>
          </div>
        </div>
      </div>

      <!-- Material Detail View (vendor prices) -->
      <div v-if="selectedMaterial" class="space-y-4">
        <div class="flex items-center gap-4">
          <button @click="selectedMaterial = null; selectedPrices = []" class="text-blue-600 hover:text-blue-800 text-sm">&larr; Kembali</button>
          <h3 class="text-lg font-semibold text-gray-900">{{ selectedMaterial.name }}</h3>
          <span class="text-sm text-gray-500">({{ selectedMaterial.code }} &middot; {{ selectedMaterial.satuan }})</span>
          <span class="text-sm text-gray-500 ml-auto">Harga Dasar: <strong>{{ formatPrice(selectedMaterial.base_price) }}</strong></span>
        </div>

        <!-- Add Price Button -->
        <div class="flex justify-end">
          <button @click="openAddForm()" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm">+ Tambah Vendor</button>
        </div>

        <!-- Vendor Prices Table -->
        <div class="bg-white shadow-sm rounded-lg overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor / Toko</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sumber</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Harga</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Rating</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lokasi</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">URL / Kontak</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tgl Kutip</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-if="selectedPrices.length === 0">
                <td colspan="9" class="px-4 py-8 text-center text-gray-400">Belum ada data harga vendor. Klik "+ Tambah Vendor" untuk menambahkan.</td>
              </tr>
              <tr v-for="(p, idx) in selectedPrices" :key="p.id" :class="{'bg-green-50': p.is_selected, 'bg-yellow-50': idx === 0 && !p.is_selected}">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ p.vendor_name }}</td>
                <td class="px-4 py-3">
                  <span :class="sourceClass(p.source)" class="inline-block px-2 py-0.5 rounded text-xs font-medium uppercase">{{ p.source }}</span>
                </td>
                <td class="px-4 py-3 text-sm text-right font-semibold" :class="idx === 0 ? 'text-green-600' : 'text-gray-900'">{{ formatPrice(p.price) }}</td>
                <td class="px-4 py-3 text-sm text-center">
                  <span v-if="p.rating" class="text-yellow-500">★ {{ p.rating }}</span>
                  <span v-else class="text-gray-300">-</span>
                </td>
                <td class="px-4 py-3 text-sm text-gray-500">{{ p.location || '-' }}</td>
                <td class="px-4 py-3 text-sm">
                  <a v-if="p.url" :href="p.url" target="_blank" class="text-blue-600 hover:underline truncate block max-w-[200px]">🔗 Link</a>
                  <span v-else-if="p.contact" class="text-gray-600">{{ p.contact }}</span>
                  <span v-else class="text-gray-300">-</span>
                </td>
                <td class="px-4 py-3 text-sm text-center text-gray-500">{{ p.quoted_at ? formatDate(p.quoted_at) : '-' }}</td>
                <td class="px-4 py-3 text-center">
                  <span v-if="p.is_selected" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">✓ Dipilih</span>
                </td>
                <td class="px-4 py-3 text-right space-x-1">
                  <button v-if="!p.is_selected" @click="selectPrice(p.id)" class="text-green-600 hover:text-green-800 text-xs font-medium">Pilih</button>
                  <button @click="editPrice(p)" class="text-blue-600 hover:text-blue-800 text-xs font-medium">Edit</button>
                  <button @click="deletePrice(p.id)" class="text-red-600 hover:text-red-800 text-xs font-medium">Hapus</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Price comparison note -->
        <div v-if="selectedPrices.length > 0 && selectedPrices.length < 3" class="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p class="text-sm text-yellow-800">⚠️ Minimal 3 vendor diperlukan untuk perbandingan procurement. Saat ini baru {{ selectedPrices.length }} vendor.</p>
        </div>
        <div v-if="selectedPrices.length >= 3" class="bg-green-50 border border-green-200 rounded-lg p-3">
          <p class="text-sm text-green-800">✓ Syarat perbandingan 3 vendor terpenuhi. Selisih harga: {{ formatPrice(selectedPrices[selectedPrices.length - 1].price - selectedPrices[0].price) }}</p>
        </div>
      </div>

      <!-- Add/Edit Price Modal -->
      <div v-if="showForm" class="fixed inset-0 bg-black/40 flex items-start justify-center z-50 overflow-y-auto">
        <div class="bg-white rounded-lg shadow-lg w-full max-w-2xl mt-10 mb-10 p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">{{ editMode ? 'Edit' : 'Tambah' }} Harga Vendor</h3>
            <button @click="closeForm" class="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
          </div>

          <form @submit.prevent="submitForm">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div class="md:col-span-2" v-if="!selectedMaterial">
                <label class="block text-sm font-medium text-gray-700">Material *</label>
                <select v-model.number="form.material_id" required class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option :value="0">Pilih Material</option>
                  <option v-for="m in allMaterials" :key="m.id" :value="m.id">{{ m.code }} - {{ m.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Nama Vendor / Toko *</label>
                <input v-model="form.vendor_name" required class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Nama toko atau vendor" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Sumber</label>
                <select v-model="form.source" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
                  <option value="tokopedia">Tokopedia</option>
                  <option value="shopee">Shopee</option>
                  <option value="bukalapak">Bukalapak</option>
                  <option value="offline">Offline / Langsung</option>
                  <option value="other">Lainnya</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Harga *</label>
                <input type="number" step="0.01" min="0" v-model.number="form.price" required class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Satuan</label>
                <input v-model="form.unit" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="kg, Buah, m3..." />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Rating Toko</label>
                <input type="number" step="0.1" min="0" max="5" v-model.number="form.rating" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="4.8" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Lokasi</label>
                <input v-model="form.location" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Jakarta, Surabaya..." />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700">URL Marketplace</label>
                <input v-model="form.url" type="url" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="https://tokopedia.com/..." />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Kontak</label>
                <input v-model="form.contact" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="No HP / Email" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">MOQ (Min Order)</label>
                <input type="number" step="0.01" min="0" v-model.number="form.min_order_qty" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Tanggal Kutip</label>
                <input type="date" v-model="form.quoted_at" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Berlaku Sampai</label>
                <input type="date" v-model="form.valid_until" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium text-gray-700">Catatan</label>
                <textarea v-model="form.notes" rows="2" class="mt-1 w-full border border-gray-300 rounded-md px-3 py-2 text-sm" placeholder="Catatan tambahan..."></textarea>
              </div>
            </div>

            <div class="mt-6 flex justify-end gap-3">
              <button type="button" @click="closeForm" class="px-4 py-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 text-sm">Batal</button>
              <button type="submit" :disabled="submitting" class="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 text-sm disabled:opacity-50">
                {{ submitting ? 'Menyimpan...' : (editMode ? 'Update' : 'Simpan') }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { api } from '@/lib/api';

interface Material {
  id: number; code: string; name: string; satuan: string; base_price: number; jenis: string;
  vendor_count: number; cheapest_price: number | null; highest_price: number | null; sources: string | null;
}

interface VendorPrice {
  id: number; material_id: number; vendor_id: number | null; vendor_name: string;
  source: string; price: number; currency: string; unit: string; url: string | null;
  rating: number | null; contact: string | null; location: string | null;
  min_order_qty: number | null; lead_time_days: number | null; notes: string | null;
  is_selected: number; quoted_at: string | null; valid_until: string | null;
}

const materials = ref<Material[]>([]);
const selectedMaterial = ref<Material | null>(null);
const selectedPrices = ref<VendorPrice[]>([]);
const allMaterials = ref<any[]>([]);
const stats = ref<any>({});
const loading = ref(false);
const submitting = ref(false);
const showForm = ref(false);
const editMode = ref(false);
const searchQuery = ref('');
const activeFilter = ref('all');
const currentPage = ref(1);
const totalCount = ref(0);
const pageSize = 50;

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize));

const form = ref({
  id: 0, material_id: 0, vendor_name: '', source: 'offline', price: 0,
  unit: '', url: '', rating: null as number | null, contact: '', location: '',
  min_order_qty: null as number | null, lead_time_days: null as number | null,
  notes: '', quoted_at: '', valid_until: '',
});

let searchTimeout: ReturnType<typeof setTimeout>;
const debouncedSearch = () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { currentPage.value = 1; loadComparison(); }, 300);
};

onMounted(async () => {
  await loadComparison();
});

const loadComparison = async () => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    if (searchQuery.value) params.append('search', searchQuery.value);
    if (activeFilter.value !== 'all') params.append('filter', activeFilter.value);
    params.append('page', String(currentPage.value));
    params.append('limit', String(pageSize));

    const res = await api.get(`/procurement/material-prices/comparison?${params}`);
    materials.value = res.data.data || [];
    totalCount.value = res.data.total || 0;
    stats.value = res.data.stats || {};
  } catch (error) {
    console.error('Failed to load comparison:', error);
  } finally {
    loading.value = false;
  }
};

const openMaterial = async (m: Material) => {
  selectedMaterial.value = m;
  try {
    const res = await api.get(`/procurement/material-prices/material/${m.id}`);
    selectedPrices.value = res.data.data?.prices || [];
    if (res.data.data?.material) {
      selectedMaterial.value = { ...m, ...res.data.data.material };
    }
  } catch (error) {
    console.error('Failed to load material prices:', error);
  }
};

const openAddForm = () => {
  editMode.value = false;
  form.value = {
    id: 0,
    material_id: selectedMaterial.value?.id || 0,
    vendor_name: '', source: 'offline', price: 0,
    unit: selectedMaterial.value?.satuan || '', url: '', rating: null,
    contact: '', location: '', min_order_qty: null, lead_time_days: null,
    notes: '', quoted_at: new Date().toISOString().split('T')[0], valid_until: '',
  };
  showForm.value = true;
};

const editPrice = (p: VendorPrice) => {
  editMode.value = true;
  form.value = {
    id: p.id, material_id: p.material_id, vendor_name: p.vendor_name,
    source: p.source, price: p.price, unit: p.unit || '',
    url: p.url || '', rating: p.rating, contact: p.contact || '',
    location: p.location || '', min_order_qty: p.min_order_qty,
    lead_time_days: p.lead_time_days, notes: p.notes || '',
    quoted_at: p.quoted_at?.split('T')[0] || '', valid_until: p.valid_until?.split('T')[0] || '',
  };
  showForm.value = true;
};

const closeForm = () => {
  showForm.value = false;
  editMode.value = false;
};

const submitForm = async () => {
  submitting.value = true;
  try {
    if (editMode.value) {
      await api.put(`/procurement/material-prices/${form.value.id}`, form.value);
    } else {
      await api.post('/procurement/material-prices', form.value);
    }
    closeForm();
    if (selectedMaterial.value) {
      await openMaterial(selectedMaterial.value);
    }
    await loadComparison();
  } catch (error: any) {
    alert(error.response?.data?.error || 'Gagal menyimpan');
  } finally {
    submitting.value = false;
  }
};

const deletePrice = async (id: number) => {
  if (!confirm('Hapus data harga ini?')) return;
  try {
    await api.delete(`/procurement/material-prices/${id}`);
    if (selectedMaterial.value) await openMaterial(selectedMaterial.value);
    await loadComparison();
  } catch (error) {
    alert('Gagal menghapus');
  }
};

const selectPrice = async (id: number) => {
  try {
    await api.post(`/procurement/material-prices/${id}/select`);
    if (selectedMaterial.value) await openMaterial(selectedMaterial.value);
  } catch (error) {
    alert('Gagal memilih vendor');
  }
};

const formatPrice = (val: number | null) => {
  if (val === null || val === undefined) return '-';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
};

const formatDate = (d: string) => {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const vendorCountClass = (count: number) => {
  if (count >= 3) return 'bg-green-100 text-green-800';
  if (count > 0) return 'bg-yellow-100 text-yellow-800';
  return 'bg-red-100 text-red-800';
};

const sourceClass = (src: string) => {
  const map: Record<string, string> = {
    tokopedia: 'bg-green-100 text-green-700',
    shopee: 'bg-orange-100 text-orange-700',
    bukalapak: 'bg-red-100 text-red-700',
    offline: 'bg-gray-100 text-gray-700',
    other: 'bg-blue-100 text-blue-700',
  };
  return map[src] || 'bg-gray-100 text-gray-600';
};

const parseSources = (sources: string | null) => {
  if (!sources) return [];
  return sources.split(',').map(s => s.trim());
};
</script>
