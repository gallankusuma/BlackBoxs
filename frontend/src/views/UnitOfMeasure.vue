<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Units of Measure</h2>
        <!-- Disembunyikan atas permintaan pemilik pekerjaan (13 Agustus 2026).
             Bukan dihapus — fungsinya utuh, hapus `v-if="false"` untuk menyalakan. -->
          <button
          v-if="false"
          @click="handleExport"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
        >
          📥 Export
        </button>
        <button
            @click="openAddModal"
            class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            + Add Unit
          </button>
        </div>

        <!-- Bulk Delete Bar -->
        <div v-if="selectedIds.length > 0" class="flex items-center gap-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <span class="text-sm font-medium text-red-700">{{ selectedIds.length }} item(s) selected</span>
          <button @click="bulkDelete" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm">🗑️ Delete Selected</button>
          <button @click="selectedIds = []" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
        </div>

        <div v-if="loading" class="text-center py-8 text-gray-500">Loading...</div>

        <div v-else class="bg-white shadow overflow-hidden sm:rounded-md">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 w-10"><input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="w-4 h-4 rounded border-gray-300 text-blue-600" /></th>
                <th @click="toggleSort('code')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">Code <span class="text-gray-400">{{ sortIcon('code') }}</span></th>
                <th @click="toggleSort('name')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">Name <span class="text-gray-400">{{ sortIcon('name') }}</span></th>
                <th @click="toggleSort('category')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">Type <span class="text-gray-400">{{ sortIcon('category') }}</span></th>
                <th @click="toggleSort('active')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">Status <span class="text-gray-400">{{ sortIcon('active') }}</span></th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="unit in sortedData" :key="unit.id" :class="{ 'bg-blue-50': selectedIds.includes(unit.id) }">
                <td class="px-4 py-4"><input type="checkbox" :value="unit.id" v-model="selectedIds" class="w-4 h-4 rounded border-gray-300 text-blue-600" /></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ unit.code }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ unit.name }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ unit.category || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="unit.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ unit.active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="editUnit(unit)" class="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                  <button @click="deleteUnit(unit.id)" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="units.length === 0" class="text-center py-8 text-gray-500">
            No units found
          </div>
        </div>
      </div>
    </main>

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-bold text-gray-900">{{ editingId ? 'Edit Unit' : 'Add Unit' }}</h3>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input
              v-model="form.code"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              placeholder="e.g. PCS, KG, L"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="form.name"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              placeholder="e.g. Piece, Kilogram"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              v-model="form.category"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
            >
              <option value="">Select Category</option>
              <option value="Weight">Weight</option>
              <option value="Volume">Volume</option>
              <option value="Length">Length</option>
              <option value="Count">Count</option>
              <option value="Time">Time</option>
              <option value="Other">Other</option>
            </select>
          </div>
          <div>
            <label class="flex items-center">
              <input v-model="form.active" type="checkbox" class="rounded border-gray-300" />
              <span class="ml-2 text-sm text-gray-700">Active</span>
            </label>
          </div>
        </div>
        <div class="px-6 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            @click="showModal = false"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            @click="saveUnit"
            :disabled="saving"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {{ saving ? 'Saving...' : (editingId ? 'Update' : 'Add') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';
import { useTableSort } from '../composables/useTableSort';

interface Unit {
  id: number;
  code: string;
  name: string;
  category?: string;
  active: boolean;
}

const units = ref<Unit[]>([]);
const showModal = ref(false);
const editingId = ref<number | null>(null);
const loading = ref(false);
const saving = ref(false);
const form = ref({ code: '', name: '', category: '', active: true });

const selectedIds = ref<number[]>([]);
const isAllSelected = computed(() => units.value.length > 0 && units.value.every((u: any) => selectedIds.value.includes(u.id)));
const toggleSelectAll = () => { if (isAllSelected.value) { selectedIds.value = []; } else { selectedIds.value = units.value.map((u: any) => u.id); } };
const bulkDelete = async () => {
  if (!confirm(`Delete ${selectedIds.value.length} units?`)) return;
  for (const id of selectedIds.value) { try { await api.delete(`/units/${id}`); } catch {} }
  selectedIds.value = [];
  await fetchUnits();
};

const { toggleSort, sortIcon, sortedData } = useTableSort(units);

const fetchUnits = async () => {
  loading.value = true;
  try {
    const res = await api.get('/units');
    units.value = (res.data.data || []).map((u: any) => ({
      ...u,
      active: u.active === 1 || u.active === true,
    }));
  } catch (error) {
    console.error('Error fetching units:', error);
  } finally {
    loading.value = false;
  }
};

const openAddModal = () => {
  editingId.value = null;
  form.value = { code: '', name: '', category: '', active: true };
  showModal.value = true;
};

const editUnit = (unit: Unit) => {
  editingId.value = unit.id;
  form.value = {
    code: unit.code,
    name: unit.name,
    category: unit.category || '',
    active: unit.active
  };
  showModal.value = true;
};

const saveUnit = async () => {
  if (!form.value.code.trim() || !form.value.name.trim()) {
    alert('Code and Name are required');
    return;
  }

  saving.value = true;
  try {
    const payload = {
      code: form.value.code,
      name: form.value.name,
      category: form.value.category || null,
      active: form.value.active,
    };

    if (editingId.value) {
      await api.put(`/units/${editingId.value}`, payload);
    } else {
      await api.post('/units', payload);
    }

    showModal.value = false;
    await fetchUnits();
  } catch (error: any) {
    console.error('Error saving unit:', error);
    alert(error.response?.data?.error || 'Failed to save unit');
  } finally {
    saving.value = false;
  }
};

const deleteUnit = async (id: number) => {
  if (confirm('Are you sure you want to delete this unit?')) {
    try {
      await api.delete(`/units/${id}`);
      await fetchUnits();
    } catch (error) {
      console.error('Error deleting unit:', error);
      alert('Failed to delete unit');
    }
  }
};

onMounted(() => {
  fetchUnits();
});

function handleExport() {
  exportToCSV(units.value, 'UnitOfMeasure_Export');
}

</script>
