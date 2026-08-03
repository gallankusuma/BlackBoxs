<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-800">📊 Satuan Dasar Harga</h1>
      <p class="text-gray-600 mt-1">Master data pembentuk AHSP: Upah, Bahan, dan Alat</p>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept=".xlsx,.xls,.csv"
      class="hidden"
      @change="handleImportFile"
    >

    <!-- Tabs -->
    <div class="bg-white rounded-lg shadow mb-6">
      <div class="border-b flex">
        <button 
          v-for="tab in tabs" 
          :key="tab.id"
          @click="activeTab = tab.id"
          :class="activeTab === tab.id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600 hover:text-gray-800'"
          class="px-6 py-3 font-medium"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- UPAH / LABOR -->
    <div v-if="activeTab === 'labor'" class="bg-white rounded-lg shadow overflow-hidden">
      <div class="p-4 border-b bg-gray-50 flex justify-between items-center">
        <h2 class="text-lg font-bold text-gray-800">Upah / Tenaga Kerja</h2>
        <div class="flex items-center gap-2">
          <div class="relative mr-2">
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="Cari upah..." 
              class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
            >
            <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
          <button @click="downloadTemplate('labor')" class="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">
            Download Template
          </button>
          <button @click="triggerImport('labor')" class="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Import
          </button>
          <button @click="exportCsv('labor')" class="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            Export CSV
          </button>
          <button @click="openCreate('labor')" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Tambah Upah
          </button>
        </div>
      </div>
      
      <table class="min-w-full text-sm">
        <thead class="bg-blue-600 text-white">
          <tr>
            <th class="px-4 py-3 text-left w-16">No</th>
            <th class="px-4 py-3 text-left w-32">Kode</th>
            <th class="px-4 py-3 text-left">Nama</th>
            <th class="px-4 py-3 text-center w-24">Satuan</th>
            <th class="px-4 py-3 text-right w-40">Harga (Rp)</th>
            <th class="px-4 py-3 text-center w-24">Status</th>
            <th class="px-4 py-3 text-center w-32">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="(item, index) in filteredLabor" :key="item.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-center text-gray-600">{{ index + 1 }}</td>
            <td class="px-4 py-3 font-mono text-xs text-gray-900">{{ item.code }}</td>
            <td class="px-4 py-3 text-gray-900">{{ item.name }}</td>
            <td class="px-4 py-3 text-center text-gray-600">{{ item.satuan }}</td>
            <td class="px-4 py-3 text-right font-semibold text-gray-900">{{ formatCurrency(item.harga) }}</td>
            <td class="px-4 py-3 text-center">
              <span v-if="item.is_active" class="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                Active
              </span>
              <span v-else class="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-full">
                Inactive
              </span>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center gap-2">
                <button @click="openEdit('labor', item)" class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm font-medium">
                  Edit
                </button>
                <button @click="deleteMasterItem('labor', item)" class="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium">
                  Delete
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-if="labor.length === 0" class="p-12 text-center text-gray-500">
        <p class="text-lg">No labor data available</p>
      </div>
    </div>

    <!-- BAHAN / MATERIALS -->
    <div v-if="activeTab === 'materials'" class="bg-white rounded-lg shadow overflow-hidden">
      <div class="p-4 border-b bg-gray-50 flex justify-between items-center">
        <h2 class="text-lg font-bold text-gray-800">Bahan / Material</h2>
        <div class="flex items-center gap-2">
          <div class="relative mr-2">
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="Cari bahan..." 
              class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
            >
            <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
          <button @click="downloadTemplate('materials')" class="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">
            Download Template
          </button>
          <button @click="triggerImport('materials')" class="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Import
          </button>
          <button @click="exportCsv('materials')" class="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            Export CSV
          </button>
          <button 
            @click="cleanupMaterials" 
            :disabled="isCleaningUp"
            :class="isCleaningUp ? 'opacity-50 cursor-not-allowed' : 'hover:bg-orange-700'"
            class="px-3 py-2 bg-orange-600 text-white rounded-lg"
          >
            {{ isCleaningUp ? '⏳ Cleaning...' : '🧹 Cleanup & Standardize' }}
          </button>
          <button @click="openCreate('materials')" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Tambah Bahan
          </button>
        </div>
      </div>
      
      <table class="min-w-full text-sm">
        <thead class="bg-blue-600 text-white">
          <tr>
            <th class="px-4 py-3 text-left w-16">No</th>
            <th class="px-4 py-3 text-left w-32">Kode</th>
            <th class="px-4 py-3 text-left w-40">Jenis</th>
            <th class="px-4 py-3 text-left">Nama</th>
            <th class="px-4 py-3 text-center w-24">Satuan</th>
            <th class="px-4 py-3 text-right w-40">Harga (Rp)</th>
            <th class="px-4 py-3 text-left w-40">Vendor</th>
            <th class="px-4 py-3 text-center w-24">Status</th>
            <th class="px-4 py-3 text-center w-32">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="(item, index) in filteredMaterials" :key="item.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-center text-gray-600">{{ index + 1 }}</td>
            <td class="px-4 py-3 font-mono text-xs text-gray-900">{{ item.code || '-' }}</td>
            <td class="px-4 py-3 text-gray-600">{{ item.jenis || '-' }}</td>
            <td class="px-4 py-3 text-gray-900">{{ item.name }}</td>
            <td class="px-4 py-3 text-center text-gray-600">{{ item.satuan }}</td>
            <td class="px-4 py-3 text-right font-semibold text-gray-900">{{ formatCurrency(item.harga) }}</td>
            <td class="px-4 py-3 text-gray-600">{{ item.vendor_name || '-' }}</td>
            <td class="px-4 py-3 text-center">
              <span v-if="item.is_active" class="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                Active
              </span>
              <span v-else class="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-full">
                Inactive
              </span>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center gap-2">
                <button @click="openEdit('materials', item)" class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm font-medium">
                  Edit
                </button>
                <button @click="deleteMasterItem('materials', item)" class="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium">
                  Delete
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-if="materials.length === 0" class="p-12 text-center text-gray-500">
        <p class="text-lg">No material data available</p>
      </div>
    </div>

    <!-- ALAT / EQUIPMENT -->
    <div v-if="activeTab === 'equipment'" class="bg-white rounded-lg shadow overflow-hidden">
      <div class="p-4 border-b bg-gray-50 flex justify-between items-center">
        <h2 class="text-lg font-bold text-gray-800">Alat / Equipment</h2>
        <div class="flex items-center gap-2">
          <div class="relative mr-2">
            <input 
              v-model="searchQuery" 
              type="text" 
              placeholder="Cari alat..." 
              class="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
            >
            <span class="absolute left-3 top-2.5 text-gray-400">🔍</span>
          </div>
          <button @click="downloadTemplate('equipment')" class="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-100">
            Download Template
          </button>
          <button @click="triggerImport('equipment')" class="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
            Import
          </button>
          <button @click="exportCsv('equipment')" class="px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            Export CSV
          </button>
          <button @click="openCreate('equipment')" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            + Tambah Alat
          </button>
        </div>
      </div>
      
      <table class="min-w-full text-sm">
        <thead class="bg-blue-600 text-white">
          <tr>
            <th class="px-4 py-3 text-left w-16">No</th>
            <th class="px-4 py-3 text-left w-32">Kode</th>
            <th class="px-4 py-3 text-left">Nama</th>
            <th class="px-4 py-3 text-center w-24">Satuan</th>
            <th class="px-4 py-3 text-right w-40">Harga (Rp)</th>
            <th class="px-4 py-3 text-left w-40">Vendor</th>
            <th class="px-4 py-3 text-center w-24">Status</th>
            <th class="px-4 py-3 text-center w-32">Action</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="(item, index) in filteredEquipment" :key="item.id" class="hover:bg-gray-50">
            <td class="px-4 py-3 text-center text-gray-600">{{ index + 1 }}</td>
            <td class="px-4 py-3 font-mono text-xs text-gray-900">{{ item.code || '-' }}</td>
            <td class="px-4 py-3 text-gray-900">{{ item.name }}</td>
            <td class="px-4 py-3 text-center text-gray-600">{{ item.satuan }}</td>
            <td class="px-4 py-3 text-right font-semibold text-gray-900">{{ formatCurrency(item.harga) }}</td>
            <td class="px-4 py-3 text-gray-600">{{ item.vendor_name || '-' }}</td>
            <td class="px-4 py-3 text-center">
              <span v-if="item.is_active" class="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">
                Active
              </span>
              <span v-else class="px-2 py-1 bg-gray-100 text-gray-800 text-xs font-semibold rounded-full">
                Inactive
              </span>
            </td>
            <td class="px-4 py-3 text-center">
              <div class="flex items-center justify-center gap-2">
                <button @click="openEdit('equipment', item)" class="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 text-sm font-medium">
                  Edit
                </button>
                <button @click="deleteMasterItem('equipment', item)" class="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium">
                  Delete
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      
      <div v-if="equipment.length === 0" class="p-12 text-center text-gray-500">
        <p class="text-lg">No equipment data available</p>
      </div>
    </div>

    <div v-if="showFormModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="showFormModal = false">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div class="p-5 border-b">
          <h3 class="text-lg font-bold text-gray-800">{{ formTitle }}</h3>
        </div>
        <div class="p-5 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Kode</label>
            <input v-model="form.code" type="text" class="w-full border border-gray-300 rounded px-3 py-2">
          </div>
          <div v-if="formEntity === 'materials'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Jenis</label>
            <input v-model="form.jenis" type="text" class="w-full border border-gray-300 rounded px-3 py-2">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Nama</label>
            <input v-model="form.name" type="text" class="w-full border border-gray-300 rounded px-3 py-2">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Satuan</label>
            <input v-model="form.satuan" type="text" class="w-full border border-gray-300 rounded px-3 py-2">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Harga</label>
            <input v-model.number="form.harga" type="number" step="0.01" class="w-full border border-gray-300 rounded px-3 py-2">
          </div>
          <div v-if="formEntity !== 'labor'">
            <label class="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
            <select v-model="form.vendor_id" class="w-full border border-gray-300 rounded px-3 py-2">
              <option :value="null">-- Pilih Vendor --</option>
              <option v-for="v in vendors" :key="v.id" :value="v.id">
                {{ v.name }}
              </option>
            </select>
          </div>
        </div>
        <div class="p-5 border-t flex justify-end gap-2">
          <button @click="showFormModal = false" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            Batal
          </button>
          <button @click="saveForm" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Simpan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, watch } from 'vue';
import { api } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

interface Vendor {
  id: number;
  name: string;
}

interface Labor {
  id: number;
  code: string;
  name: string;
  satuan: string;
  harga: number;
  is_active: boolean;
}

interface Material {
  id: number;
  code: string;
  jenis: string;
  name: string;
  satuan: string;
  harga: number;
  vendor_id?: number | null;
  vendor_name?: string | null;
  is_active: boolean;
}

interface Equipment {
  id: number;
  code: string;
  name: string;
  satuan: string;
  harga: number;
  vendor_id?: number | null;
  vendor_name?: string | null;
  is_active: boolean;
}

type MasterEntity = 'labor' | 'materials' | 'equipment';

const activeTab = ref('labor');
const searchQuery = ref('');
const labor = ref<Labor[]>([]);
const materials = ref<Material[]>([]);
const equipment = ref<Equipment[]>([]);
const vendors = ref<Vendor[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const importEntity = ref<MasterEntity | null>(null);
const showFormModal = ref(false);
const formMode = ref<'create' | 'edit'>('create');
const formEntity = ref<MasterEntity>('labor');
const form = ref({
  id: null as number | null,
  code: '',
  name: '',
  satuan: '',
  harga: 0,
  jenis: '',
  vendor_id: null as number | null
});

const tabs = [
  { id: 'labor', label: 'Upah / Tenaga Kerja' },
  { id: 'materials', label: 'Bahan / Material' },
  { id: 'equipment', label: 'Alat / Equipment' }
];

// Computed Filtered Data
const filteredLabor = computed(() => {
  if (!searchQuery.value) return labor.value;
  const lowerQuery = searchQuery.value.toLowerCase();
  return labor.value.filter(item => 
    item.name.toLowerCase().includes(lowerQuery) || 
    item.code.toLowerCase().includes(lowerQuery)
  );
});

const filteredMaterials = computed(() => {
  if (!searchQuery.value) return materials.value;
  const lowerQuery = searchQuery.value.toLowerCase();
  return materials.value.filter(item => 
    item.name.toLowerCase().includes(lowerQuery) || 
    item.code.toLowerCase().includes(lowerQuery) ||
    item.jenis?.toLowerCase().includes(lowerQuery) ||
    item.vendor_name?.toLowerCase().includes(lowerQuery)
  );
});

const filteredEquipment = computed(() => {
  if (!searchQuery.value) return equipment.value;
  const lowerQuery = searchQuery.value.toLowerCase();
  return equipment.value.filter(item => 
    item.name.toLowerCase().includes(lowerQuery) || 
    item.code.toLowerCase().includes(lowerQuery) ||
    item.vendor_name?.toLowerCase().includes(lowerQuery)
  );
});

// Watch tab change to clear search
watch(activeTab, () => {
  searchQuery.value = '';
});

const formEntityLabel = computed(() => {
  if (formEntity.value === 'labor') return 'Upah / Tenaga Kerja';
  if (formEntity.value === 'materials') return 'Bahan / Material';
  return 'Alat / Equipment';
});

const formTitle = computed(() => {
  const action = formMode.value === 'create' ? 'Tambah' : 'Edit';
  return `${action} ${formEntityLabel.value}`;
});

const loadVendors = async () => {
  try {
    const { data } = await api.get('/procurement/vendors');
    vendors.value = data.data || [];
  } catch (error) {
    console.error('Failed to load vendors:', error);
  }
};

const loadLabor = async () => {
  try {
    const { data } = await api.get('/estimator/masters/labor');
    labor.value = data;
  } catch (error) {
    console.error('Failed to load labor:', error);
  }
};

const loadMaterials = async () => {
  try {
    const { data } = await api.get('/estimator/masters/materials');
    materials.value = data;
  } catch (error) {
    console.error('Failed to load materials:', error);
  }
};

const loadEquipment = async () => {
  try {
    const { data } = await api.get('/estimator/masters/equipment');
    equipment.value = data;
  } catch (error) {
    console.error('Failed to load equipment:', error);
  }
};

const resetForm = () => {
  form.value = {
    id: null,
    code: '',
    name: '',
    satuan: '',
    harga: 0,
    jenis: '',
    vendor_id: null
  };
};

const openCreate = (entity: MasterEntity) => {
  formMode.value = 'create';
  formEntity.value = entity;
  resetForm();
  showFormModal.value = true;
};

const openEdit = (entity: MasterEntity, item: any) => {
  formMode.value = 'edit';
  formEntity.value = entity;
  form.value = {
    id: item.id,
    code: item.code || '',
    name: item.name || '',
    satuan: item.satuan || '',
    harga: item.harga || 0,
    jenis: entity === 'materials' ? item.jenis || '' : '',
    vendor_id: item.vendor_id || null
  };
  showFormModal.value = true;
};

const reloadEntity = async (entity: MasterEntity) => {
  if (entity === 'labor') await loadLabor();
  if (entity === 'materials') await loadMaterials();
  if (entity === 'equipment') await loadEquipment();
};

const saveForm = async () => {
  const payload: any = {
    code: form.value.code?.trim(),
    name: form.value.name?.trim(),
    satuan: form.value.satuan?.trim(),
    harga: Number(form.value.harga) || 0,
    vendor_id: form.value.vendor_id || null
  };

  if (formEntity.value === 'materials') {
    payload.jenis = form.value.jenis?.trim();
  }

  if (!payload.code || !payload.name || !payload.satuan) {
    alert('Kode, nama, dan satuan wajib diisi');
    return;
  }

  try {
    if (formMode.value === 'create') {
      await api.post(`/estimator/masters/${formEntity.value}`, payload);
    } else if (form.value.id) {
      await api.put(`/estimator/masters/${formEntity.value}/${form.value.id}`, payload);
    }

    await reloadEntity(formEntity.value);
    showFormModal.value = false;
  } catch (error) {
    console.error('Failed to save master data:', error);
    alert('Gagal menyimpan data');
  }
};

const deleteMasterItem = async (entity: MasterEntity, item: any) => {
  if (!confirm('Hapus data ini?')) return;

  try {
    await api.delete(`/estimator/masters/${entity}/${item.id}`);
    await reloadEntity(entity);
  } catch (error) {
    console.error('Failed to delete master item:', error);
    alert('Gagal menghapus data');
  }
};

const triggerImport = (entity: MasterEntity) => {
  importEntity.value = entity;
  fileInput.value?.click();
};

const handleImportFile = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file || !importEntity.value) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    await api.post(`/import/import/${importEntity.value}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });

    alert('Import berhasil');
    await reloadEntity(importEntity.value);
  } catch (error) {
    console.error('Failed to import data:', error);
    alert('Gagal import data');
  } finally {
    if (fileInput.value) fileInput.value.value = '';
    importEntity.value = null;
  }
};

const downloadTemplate = async (entity: MasterEntity) => {
  try {
    const response = await api.get(`/import/template/${entity}`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `template_${entity}.xlsx`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  } catch (error: any) {
    let message = error?.message || 'Unknown error';
    const errData = error?.response?.data;

    if (errData instanceof Blob) {
      const text = await errData.text();
      try {
        const parsed = JSON.parse(text);
        message = parsed?.error || parsed?.message || text;
      } catch {
        message = text || message;
      }
    } else if (errData?.error || errData?.message) {
      message = errData.error || errData.message;
    }

    console.error('Failed to download template:', error);
    alert(`Gagal download template: ${message}`);
  }
};

const csvEscape = (value: any) => {
  const text = value === null || value === undefined ? '' : String(value);
  if (text.includes('"') || text.includes(',') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const exportCsv = (entity: MasterEntity) => {
  let headers: string[] = [];
  let rows: any[] = [];

  if (entity === 'labor') {
    headers = ['Code', 'Name', 'Satuan', 'Harga'];
    rows = labor.value.map((item) => [item.code, item.name, item.satuan, item.harga]);
  }

  if (entity === 'materials') {
    headers = ['Code', 'Jenis', 'Name', 'Satuan', 'Harga', 'Vendor'];
    rows = materials.value.map((item) => [item.code, item.jenis, item.name, item.satuan, item.harga, item.vendor_name]);
  }

  if (entity === 'equipment') {
    headers = ['Code', 'Name', 'Satuan', 'Harga', 'Vendor'];
    rows = equipment.value.map((item) => [item.code, item.name, item.satuan, item.harga, item.vendor_name]);
  }

  const lines = rows.map((row) => row.map(csvEscape).join(','));
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `masters_${entity}.csv`;
  a.click();
  URL.revokeObjectURL(url);
};

const isCleaningUp = ref(false);

const cleanupMaterials = async () => {
  if (!confirm('Jalankan cleanup dan standardisasi material? Ini akan:\n- Normalisasi nama/satuan\n- Nonaktifkan duplikasi\n- Standardisasi kode ke format MT-2026-xxxx')) {
    return;
  }

  isCleaningUp.value = true;

  try {
    const { data } = await api.post('/import/materials/cleanup', {});
    
    // Reload materials after cleanup
    await loadMaterials();
    
    // Show results notification
    const result = data.result || {};
    const message = `✅ Cleanup berhasil!
- ${result.normalizedRows} row dinormalisasi
- ${result.duplicateDeactivated} duplikat dinonaktifkan
- ${result.codesStandardized} kode di-standardisasi${result.standardizedRange ? ` (${result.standardizedRange})` : ''}`;
    
    alert(message);
  } catch (error) {
    console.error('Failed to cleanup materials:', error);
    alert('❌ Gagal cleanup material. Coba lagi.');
  } finally {
    isCleaningUp.value = false;
  }
};



onMounted(() => {
  loadVendors();
  loadLabor();
  loadMaterials();
  loadEquipment();
});
</script>
