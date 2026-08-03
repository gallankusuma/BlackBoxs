<template>
  <div class="space-y-6">
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">📋 Standar Gaji per Jabatan</h1>
        <p class="text-gray-500 text-sm mt-1">Master data rate gaji harian/bulanan berdasarkan klasifikasi pekerja</p>
      </div>
      <button @click="openCreate" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2 text-sm">
        + Tambah Jabatan
      </button>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4">
      <div class="bg-white shadow rounded-lg p-4 border-l-4 border-blue-500">
        <p class="text-xs text-gray-500 uppercase">Total Jabatan</p>
        <p class="text-2xl font-bold">{{ rates.length }}</p>
      </div>
      <div class="bg-white shadow rounded-lg p-4 border-l-4 border-green-500">
        <p class="text-xs text-gray-500 uppercase">Harian</p>
        <p class="text-2xl font-bold text-green-700">{{ rates.filter(r => r.salary_type === 'daily').length }}</p>
      </div>
      <div class="bg-white shadow rounded-lg p-4 border-l-4 border-purple-500">
        <p class="text-xs text-gray-500 uppercase">Bulanan</p>
        <p class="text-2xl font-bold text-purple-700">{{ rates.filter(r => r.salary_type === 'monthly').length }}</p>
      </div>
      <div class="bg-white shadow rounded-lg p-4 border-l-4 border-amber-500">
        <p class="text-xs text-gray-500 uppercase">Avg Harian</p>
        <p class="text-lg font-bold text-amber-700">{{ fmtCur(avgDaily) }}</p>
      </div>
    </div>

    <!-- Filter -->
    <div class="flex gap-2 items-center">
      <input v-model="search" type="text" placeholder="Cari jabatan..." class="px-3 py-2 border border-gray-300 rounded-lg text-sm w-64 focus:ring-2 focus:ring-blue-400" />
      <select v-model="filterType" class="px-3 py-2 border border-gray-300 rounded-lg text-sm">
        <option value="">Semua Tipe</option>
        <option value="daily">Harian</option>
        <option value="monthly">Bulanan</option>
      </select>
    </div>

    <!-- Table -->
    <div v-if="loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
    <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Kode</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Jabatan</th>
            <th class="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Kelas</th>
            <th class="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Tipe</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Gaji Pokok</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Tunjangan</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">OT / Jam</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Total / Hari</th>
            <th class="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="r in filtered" :key="r.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-4 py-3 text-sm font-mono font-medium text-gray-900">{{ r.position_code }}</td>
            <td class="px-4 py-3 text-sm font-medium text-gray-800">{{ r.position_name }}</td>
            <td class="px-4 py-3 text-sm text-gray-600">
              <span v-if="r.grade" class="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">{{ r.grade }}</span>
              <span v-else class="text-gray-400">-</span>
            </td>
            <td class="px-4 py-3 text-center">
              <span :class="r.salary_type === 'daily' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'" class="px-2 py-0.5 rounded-full text-xs font-medium">
                {{ r.salary_type === 'daily' ? 'Harian' : 'Bulanan' }}
              </span>
            </td>
            <td class="px-4 py-3 text-sm text-right font-mono">{{ fmtCur(r.basic_rate) }}</td>
            <td class="px-4 py-3 text-sm text-right font-mono">{{ fmtCur(r.tunjangan_rate) }}</td>
            <td class="px-4 py-3 text-sm text-right font-mono">{{ fmtCur(r.ot_rate) }}</td>
            <td class="px-4 py-3 text-sm text-right font-mono font-semibold text-blue-700">
              {{ r.salary_type === 'daily' ? fmtCur(Number(r.basic_rate) + Number(r.tunjangan_rate)) : fmtCur(r.basic_rate) }}
            </td>
            <td class="px-4 py-3 text-right">
              <div class="inline-flex gap-1">
                <button @click="openEdit(r)" class="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200 hover:bg-blue-100">Edit</button>
                <button @click="confirmDelete(r)" class="px-2 py-1 text-xs bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100">Hapus</button>
              </div>
            </td>
          </tr>
          <tr v-if="!filtered.length"><td colspan="9" class="px-4 py-8 text-center text-gray-400">Tidak ada data jabatan</td></tr>
        </tbody>
      </table>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showModal = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div class="px-6 py-4 border-b bg-slate-50 flex items-center justify-between">
          <h2 class="font-bold text-lg text-gray-900">{{ editingId ? '✏️ Edit Jabatan' : '+ Tambah Jabatan' }}</h2>
          <button @click="showModal = false" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <form @submit.prevent="saveRate" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Kode Jabatan *</label>
              <input v-model="form.position_code" type="text" required placeholder="e.g. WLD-1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nama Jabatan *</label>
              <input v-model="form.position_name" type="text" required placeholder="e.g. Welder" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Kelas / Grade</label>
              <input v-model="form.grade" type="text" placeholder="e.g. Kelas 1" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tipe Gaji</label>
              <select v-model="form.salary_type" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="daily">Harian</option>
                <option value="monthly">Bulanan</option>
              </select>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">{{ form.salary_type === 'daily' ? 'Gaji Pokok /hari' : 'Gaji Pokok /bln' }}</label>
              <input v-model.number="form.basic_rate" type="number" step="1000" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Tunjangan /hari</label>
              <input v-model.number="form.tunjangan_rate" type="number" step="1000" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Lembur /jam</label>
              <input v-model.number="form.ot_rate" type="number" step="1000" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-right" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
            <textarea v-model="form.description" rows="2" class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" placeholder="Catatan tambahan..."></textarea>
          </div>
          <div v-if="form.salary_type === 'daily'" class="bg-blue-50 rounded-lg px-4 py-3">
            <p class="text-sm text-blue-800 font-medium">Estimasi Pendapatan</p>
            <p class="text-xs text-blue-600 mt-1">Per hari: <span class="font-mono font-semibold">{{ fmtCur(Number(form.basic_rate || 0) + Number(form.tunjangan_rate || 0)) }}</span></p>
            <p class="text-xs text-blue-600">Per bulan (22 hari): <span class="font-mono font-semibold">{{ fmtCur((Number(form.basic_rate || 0) + Number(form.tunjangan_rate || 0)) * 22) }}</span></p>
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <button type="button" @click="showModal = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm">Batal</button>
            <button type="submit" :disabled="saving" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              {{ saving ? 'Menyimpan...' : 'Simpan' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium"
      :class="toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'">
      {{ toast.message }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { api } from '../lib/api';

interface PositionRate {
  id: number;
  position_code: string;
  position_name: string;
  grade: string | null;
  salary_type: string;
  basic_rate: number;
  tunjangan_rate: number;
  ot_rate: number;
  description: string | null;
  is_active: number;
}

const rates = ref<PositionRate[]>([]);
const loading = ref(true);
const showModal = ref(false);
const editingId = ref<number | null>(null);
const saving = ref(false);
const search = ref('');
const filterType = ref('');
const toast = ref<{ type: string; message: string } | null>(null);

const form = ref({
  position_code: '',
  position_name: '',
  grade: '',
  salary_type: 'daily',
  basic_rate: 0,
  tunjangan_rate: 0,
  ot_rate: 0,
  description: '',
});

const fmtCur = (v: number) => {
  if (!v) return 'Rp 0';
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);
};

const avgDaily = computed(() => {
  const daily = rates.value.filter(r => r.salary_type === 'daily');
  if (!daily.length) return 0;
  return daily.reduce((s, r) => s + Number(r.basic_rate), 0) / daily.length;
});

const filtered = computed(() => {
  let list = rates.value;
  if (filterType.value) list = list.filter(r => r.salary_type === filterType.value);
  if (search.value) {
    const q = search.value.toLowerCase();
    list = list.filter(r =>
      r.position_code.toLowerCase().includes(q) ||
      r.position_name.toLowerCase().includes(q) ||
      (r.grade || '').toLowerCase().includes(q)
    );
  }
  return list;
});

const showToast = (type: string, message: string) => {
  toast.value = { type, message };
  setTimeout(() => { toast.value = null; }, 3000);
};

const fetchRates = async () => {
  loading.value = true;
  try {
    const res = await api.get('/hr/position-rates');
    rates.value = res.data.data || [];
  } catch (e) {
    console.error('Failed to fetch position rates:', e);
  }
  loading.value = false;
};

const resetForm = () => {
  form.value = { position_code: '', position_name: '', grade: '', salary_type: 'daily', basic_rate: 0, tunjangan_rate: 0, ot_rate: 0, description: '' };
  editingId.value = null;
};

const openCreate = () => { resetForm(); showModal.value = true; };

const openEdit = (r: PositionRate) => {
  editingId.value = r.id;
  form.value = {
    position_code: r.position_code,
    position_name: r.position_name,
    grade: r.grade || '',
    salary_type: r.salary_type,
    basic_rate: Number(r.basic_rate),
    tunjangan_rate: Number(r.tunjangan_rate),
    ot_rate: Number(r.ot_rate),
    description: r.description || '',
  };
  showModal.value = true;
};

const saveRate = async () => {
  saving.value = true;
  try {
    if (editingId.value) {
      await api.put(`/hr/position-rates/${editingId.value}`, form.value);
      showToast('success', 'Jabatan berhasil diupdate');
    } else {
      await api.post('/hr/position-rates', form.value);
      showToast('success', 'Jabatan berhasil ditambahkan');
    }
    showModal.value = false;
    resetForm();
    await fetchRates();
  } catch (e: any) {
    showToast('error', e?.response?.data?.error || 'Gagal menyimpan');
  }
  saving.value = false;
};

const confirmDelete = async (r: PositionRate) => {
  if (!confirm(`Hapus "${r.position_name} ${r.grade || ''}"?`)) return;
  try {
    await api.delete(`/hr/position-rates/${r.id}`);
    showToast('success', 'Jabatan berhasil dihapus');
    await fetchRates();
  } catch (e) {
    showToast('error', 'Gagal menghapus');
  }
};

onMounted(fetchRates);
</script>
