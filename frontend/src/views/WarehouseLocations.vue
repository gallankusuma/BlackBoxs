<template>
  <div class="min-h-screen bg-gray-50 p-6 space-y-4">
    <!-- Header -->
    <div class="bg-white border rounded-lg shadow-sm">
      <div class="px-6 py-4 flex items-center justify-between">
        <div>
          <p class="text-xs uppercase text-gray-500 tracking-wide">Inventory Management</p>
          <h1 class="text-2xl font-semibold text-gray-900">Warehouse Locations</h1>
          <p class="text-sm text-gray-600">Manage storage locations and capacity</p>
        </div>
        <button
          @click="handleExport"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
        >
          📥 Export
        </button>
        <button @click="openCreateModal" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
          + Add Location
        </button>
      </div>
    </div>

    <!-- Error/Success Messages -->
    <div v-if="error" class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{{ error }}</div>
    <div v-if="successMsg" class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">{{ successMsg }}</div>

    <!-- Filters -->
    <div class="bg-white border rounded-lg shadow-sm p-4">
      <div class="grid grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Warehouse</label>
          <select v-model="selectedWarehouse" class="w-full border border-gray-300 rounded-lg px-3 py-2">
            <option value="">All Warehouses</option>
            <option v-for="wh in warehouses" :key="wh.id" :value="wh.id">{{ wh.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Search Location</label>
          <input v-model="searchQuery" type="text" placeholder="Search by code..." class="w-full border border-gray-300 rounded-lg px-3 py-2" />
        </div>
        <div class="flex items-end">
          <button @click="fetchLocations" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 w-full">Filter</button>
        </div>
        <div class="flex items-end">
          <button @click="resetFilters" class="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 w-full">Reset</button>
        </div>
      </div>
    </div>

    <!-- Locations Table -->
    <div class="bg-white border rounded-lg shadow-sm overflow-hidden">
      <div v-if="loading" class="p-8 text-center text-gray-500">Loading locations...</div>
      <div v-else-if="filteredLocations.length === 0" class="p-8 text-center text-gray-500">No warehouse locations found</div>
      <table v-else class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Warehouse</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location Code</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rack</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Row</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bin</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Capacity</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="location in filteredLocations" :key="location.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ getWarehouseName(location.warehouse_id) }}</td>
            <td class="px-6 py-4 text-sm text-gray-900 font-semibold">{{ location.code }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ location.rack || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ location.row || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ location.bin || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ location.capacity || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ location.description || '-' }}</td>
            <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
              <button @click="editLocation(location)" class="text-blue-600 hover:text-blue-900">Edit</button>
              <button @click="deleteLocation(location.id)" class="text-red-600 hover:text-red-900">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h3 class="text-lg font-semibold text-gray-900">{{ isEditing ? 'Edit Location' : 'Add New Location' }}</h3>
          <button @click="closeModal" class="text-gray-400 hover:text-gray-600">✕</button>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Warehouse *</label>
            <select v-model="form.warehouse_id" class="w-full border border-gray-300 rounded-lg px-3 py-2" required>
              <option :value="null">Select Warehouse</option>
              <option v-for="wh in warehouses" :key="wh.id" :value="wh.id">{{ wh.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Location Code *</label>
            <input v-model="form.code" type="text" placeholder="e.g., A-01-01" class="w-full border border-gray-300 rounded-lg px-3 py-2" required />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Rack</label>
            <input v-model="form.rack" type="text" placeholder="e.g., A" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Row</label>
            <input v-model="form.row" type="text" placeholder="e.g., 01" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Bin</label>
            <input v-model="form.bin" type="text" placeholder="e.g., 01" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Capacity</label>
            <input v-model.number="form.capacity" type="number" placeholder="e.g., 100" class="w-full border border-gray-300 rounded-lg px-3 py-2" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea v-model="form.description" placeholder="Location description..." class="w-full border border-gray-300 rounded-lg px-3 py-2" rows="2"></textarea>
          </div>
        </div>
        <div class="px-6 py-4 border-t flex gap-2">
          <button @click="closeModal" class="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button @click="saveLocation" :disabled="submitting" class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">{{ submitting ? 'Saving...' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';

interface Location {
  id: number;
  warehouse_id: number;
  code: string;
  rack?: string;
  row?: string;
  bin?: string;
  capacity?: number;
  description?: string;
}

interface Warehouse {
  id: number;
  name: string;
  code: string;
}

const locations = ref<Location[]>([]);
const warehouses = ref<Warehouse[]>([]);
const loading = ref(false);
const submitting = ref(false);
const showModal = ref(false);
const isEditing = ref(false);
const error = ref('');
const successMsg = ref('');
const selectedWarehouse = ref('');
const searchQuery = ref('');
const editingId = ref<number | null>(null);

const form = ref({
  warehouse_id: null as number | null,
  code: '',
  rack: '',
  row: '',
  bin: '',
  capacity: null as number | null,
  description: '',
});

const filteredLocations = computed(() => {
  let result = locations.value;
  
  if (selectedWarehouse.value) {
    result = result.filter(loc => loc.warehouse_id === Number(selectedWarehouse.value));
  }
  
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter(loc => loc.code.toLowerCase().includes(query));
  }
  
  return result;
});

function getWarehouseName(warehouseId: number): string {
  const wh = warehouses.value.find(w => w.id === warehouseId);
  return wh?.name || '-';
}

async function fetchLocations() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/api/warehouses/locations');
    locations.value = res.data.data || [];
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to fetch locations';
  } finally {
    loading.value = false;
  }
}

async function fetchWarehouses() {
  try {
    const res = await api.get('/api/warehouses');
    warehouses.value = res.data.data || [];
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to fetch warehouses';
  }
}

function openCreateModal() {
  isEditing.value = false;
  editingId.value = null;
  form.value = {
    warehouse_id: null,
    code: '',
    rack: '',
    row: '',
    bin: '',
    capacity: null,
    description: '',
  };
  showModal.value = true;
}

function editLocation(location: Location) {
  isEditing.value = true;
  editingId.value = location.id;
  form.value = {
    warehouse_id: location.warehouse_id,
    code: location.code,
    rack: location.rack || '',
    row: location.row || '',
    bin: location.bin || '',
    capacity: location.capacity || null,
    description: location.description || '',
  };
  showModal.value = true;
}

async function saveLocation() {
  if (!form.value.warehouse_id || !form.value.code) {
    error.value = 'Warehouse and Location Code are required';
    return;
  }

  submitting.value = true;
  error.value = '';
  successMsg.value = '';

  try {
    if (isEditing.value && editingId.value) {
      await api.put(`/api/warehouses/${form.value.warehouse_id}/locations/${editingId.value}`, form.value);
      successMsg.value = 'Location updated successfully';
    } else {
      await api.post(`/api/warehouses/${form.value.warehouse_id}/locations`, form.value);
      successMsg.value = 'Location created successfully';
    }
    closeModal();
    await fetchLocations();
    setTimeout(() => (successMsg.value = ''), 3000);
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to save location';
  } finally {
    submitting.value = false;
  }
}

async function deleteLocation(id: number) {
  if (!confirm('Are you sure you want to delete this location?')) return;

  const location = locations.value.find(l => l.id === id);
  if (!location) return;

  try {
    await api.delete(`/api/warehouses/${location.warehouse_id}/locations/${id}`);
    successMsg.value = 'Location deleted successfully';
    await fetchLocations();
    setTimeout(() => (successMsg.value = ''), 3000);
  } catch (err: any) {
    error.value = err.response?.data?.error || 'Failed to delete location';
  }
}

function closeModal() {
  showModal.value = false;
  isEditing.value = false;
  editingId.value = null;
}

function resetFilters() {
  selectedWarehouse.value = '';
  searchQuery.value = '';
  fetchLocations();
}

onMounted(() => {
  fetchWarehouses();
  fetchLocations();
});

function handleExport() {
  exportToCSV(locations.value, 'WarehouseLocations_Export');
}

</script>
