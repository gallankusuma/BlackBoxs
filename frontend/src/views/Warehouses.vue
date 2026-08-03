<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">🏭 Warehouses</h1>
        <p class="text-gray-600 mt-1">Manage warehouse locations and storage areas</p>
      </div>
      <button
          @click="handleExport"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
        >
          📥 Export
        </button>
        <button
        @click="openAddModal"
        class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
      >
        + Add Warehouse
      </button>
    </div>

    <!-- Search -->
    <div class="flex gap-4">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search warehouses..."
        class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <!-- Warehouses Table -->
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Code</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Address</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Contact</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-if="filteredWarehouses.length === 0" class="hover:bg-gray-50">
            <td colspan="6" class="px-6 py-4 text-center text-gray-500">No warehouses found</td>
          </tr>
          <tr v-for="wh in filteredWarehouses" :key="wh.id" class="hover:bg-gray-50 transition-colors">
            <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ wh.code }}</td>
            <td class="px-6 py-4 text-sm text-gray-900">{{ wh.name }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ wh.address || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ wh.contact_person || '-' }}</td>
            <td class="px-6 py-4 text-sm">
              <span
                :class="[
                  'px-3 py-1 rounded-full text-xs font-medium',
                  wh.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                ]"
              >
                {{ wh.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2 flex gap-2">
              <button
                @click="openLocations(wh)"
                class="px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 text-sm font-medium"
              >
                📍 Locations
              </button>
              <button
                @click="editWarehouse(wh)"
                class="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-medium"
              >
                Edit
              </button>
              <button
                @click="deleteWarehouse(wh.id)"
                class="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm font-medium"
              >
                Delete
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Add/Edit Modal -->
    <Dialog :is-open="showModal" @update:is-open="showModal = $event">
      <template #title>
        {{ editingWarehouse ? 'Edit Warehouse' : 'Add New Warehouse' }}
      </template>

      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-gray-700">Code *</label>
            <input
              v-model="formData.code"
              type="text"
              placeholder="e.g., WH-001"
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p v-if="formErrors.code" class="text-xs text-red-500">{{ formErrors.code }}</p>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-gray-700">Name *</label>
            <input
              v-model="formData.name"
              type="text"
              placeholder="e.g., Main Warehouse"
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p v-if="formErrors.name" class="text-xs text-red-500">{{ formErrors.name }}</p>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Address</label>
          <input
            v-model="formData.address"
            type="text"
            placeholder="Warehouse address..."
            class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Contact Person</label>
          <input
            v-model="formData.contact_person"
            type="text"
            placeholder="Contact person name..."
            class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="flex items-center gap-2">
          <input
            id="is_active"
            v-model="formData.is_active"
            type="checkbox"
            class="w-4 h-4 rounded border-gray-300"
          />
          <label for="is_active" class="text-sm font-medium text-gray-700">Active</label>
        </div>
      </div>

      <template #actions="{ close }">
        <button
          @click="close"
          class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          Cancel
        </button>
        <button
          @click="handleSubmit"
          :disabled="isFormSubmitting"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {{ isFormSubmitting ? 'Saving...' : 'Save' }}
        </button>
      </template>
    </Dialog>

    <!-- Locations Management Modal -->
    <Dialog :is-open="showLocationsModal" @update:is-open="showLocationsModal = $event" size="large">
      <template #title>
        📍 Manage Locations - {{ selectedWarehouse?.name }}
      </template>

      <div class="space-y-4">
        <!-- Add Location Button -->
        <div class="flex justify-between items-center pb-4 border-b">
          <p class="text-sm text-gray-600">{{ locations.length }} location(s) in this warehouse</p>
          <button
            @click="openAddLocationModal"
            class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
          >
            + Add Location
          </button>
        </div>

        <!-- Locations Table -->
        <div class="max-h-96 overflow-y-auto">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50 sticky top-0">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Code</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Rack</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Row</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Bin</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Capacity</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white">
              <tr v-if="locations.length === 0">
                <td colspan="6" class="px-4 py-8 text-center text-gray-500">No locations found. Add one to get started.</td>
              </tr>
              <tr v-for="loc in locations" :key="loc.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ loc.code }}</td>
                <td class="px-4 py-3 text-sm text-gray-700">{{ loc.rack || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-700">{{ loc.row || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-700">{{ loc.bin || '-' }}</td>
                <td class="px-4 py-3 text-sm text-gray-700">{{ loc.capacity || '-' }}</td>
                <td class="px-4 py-3 text-sm space-x-2">
                  <button
                    @click="editLocation(loc)"
                    class="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Edit
                  </button>
                  <button
                    @click="deleteLocation(loc.id)"
                    class="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <template #actions="{ close }">
        <button
          @click="close"
          class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          Close
        </button>
      </template>
    </Dialog>

    <!-- Add/Edit Location Modal -->
    <Dialog :is-open="showLocationModal" @update:is-open="showLocationModal = $event">
      <template #title>
        {{ editingLocation ? 'Edit Location' : 'Add New Location' }}
      </template>

      <form @submit.prevent="handleLocationSubmit" class="space-y-4">
        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Location Code *</label>
          <input
            v-model="locationForm.code"
            type="text"
            placeholder="e.g., A-01-01"
            class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
        </div>

        <div class="grid grid-cols-3 gap-4">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-gray-700">Rack</label>
            <input
              v-model="locationForm.rack"
              type="text"
              placeholder="e.g., A"
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-gray-700">Row</label>
            <input
              v-model="locationForm.row"
              type="text"
              placeholder="e.g., 01"
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-gray-700">Bin</label>
            <input
              v-model="locationForm.bin"
              type="text"
              placeholder="e.g., 01"
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Capacity</label>
          <input
            v-model.number="locationForm.capacity"
            type="number"
            placeholder="e.g., 100"
            class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <textarea
            v-model="locationForm.description"
            placeholder="Location description..."
            rows="2"
            class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          ></textarea>
        </div>
      </form>

      <template #actions="{ close }">
        <button
          @click="close"
          class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
        >
          Cancel
        </button>
        <button
          @click="handleLocationSubmit"
          :disabled="isLocationSubmitting"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {{ isLocationSubmitting ? 'Saving...' : 'Save Location' }}
        </button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, computed, onMounted } from 'vue';
import { useWarehouseStore } from '../stores/warehouse';
import { api } from '../lib/api';
import Dialog from '../components/ui/Dialog.vue';

const warehouseStore = useWarehouseStore();

const showModal = ref(false);
const searchQuery = ref('');
const editingWarehouse = ref<any>(null);

// Location management states
const showLocationsModal = ref(false);
const showLocationModal = ref(false);
const selectedWarehouse = ref<any>(null);
const locations = ref<any[]>([]);
const editingLocation = ref<any>(null);
const isLocationSubmitting = ref(false);
const locationForm = ref({
  code: '',
  rack: '',
  row: '',
  bin: '',
  capacity: null as number | null,
  description: '',
});

onMounted(async () => {
  await warehouseStore.fetchWarehouses();
});

const warehouses = computed(() => warehouseStore.warehouses);

const filteredWarehouses = computed(() => {
  return warehouses.value.filter((w) => {
    return (
      !searchQuery.value ||
      w.code.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      w.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (w.address && w.address.toLowerCase().includes(searchQuery.value.toLowerCase()))
    );
  });
});

// Form state - NOT using vee-validate for warehouse (too complex)
const formData = ref({
  code: '',
  name: '',
  address: '',
  contact_person: '',
  is_active: true,
});

const formErrors = ref<Record<string, string>>({});
const isFormSubmitting = ref(false);

const validateForm = () => {
  formErrors.value = {};
  if (!formData.value.code?.trim()) formErrors.value.code = 'Code is required';
  if (!formData.value.name?.trim()) formErrors.value.name = 'Name is required';
  if (formData.value.code && formData.value.code.length < 2) formErrors.value.code = 'Code must be at least 2 characters';
  if (formData.value.name && formData.value.name.length < 3) formErrors.value.name = 'Name must be at least 3 characters';
  return Object.keys(formErrors.value).length === 0;
};

const handleSubmit = async () => {
  if (!validateForm()) return;
  
  isFormSubmitting.value = true;
  try {
    const payload = {
      code: formData.value.code,
      name: formData.value.name,
      address: formData.value.address || null,
      contact_person: formData.value.contact_person || null,
      is_active: formData.value.is_active,
    };
    
    if (editingWarehouse.value) {
      await warehouseStore.updateWarehouse(editingWarehouse.value.id, payload);
    } else {
      await warehouseStore.createWarehouse(payload);
    }
    showModal.value = false;
    editingWarehouse.value = null;
  } catch (error: any) {
    console.error('Error saving warehouse:', error);
    alert(error.response?.data?.error || 'Failed to save warehouse');
  } finally {
    isFormSubmitting.value = false;
  }
};

const openAddModal = () => {
  editingWarehouse.value = null;
  formData.value = { code: '', name: '', address: '', contact_person: '', is_active: true };
  formErrors.value = {};
  showModal.value = true;
};

const editWarehouse = (warehouse: any) => {
  editingWarehouse.value = warehouse;
  formData.value = {
    code: warehouse.code || '',
    name: warehouse.name || '',
    address: warehouse.address || '',
    contact_person: warehouse.contact_person || '',
    is_active: !!warehouse.is_active,
  };
  formErrors.value = {};
  showModal.value = true;
};

const deleteWarehouse = async (id: number) => {
  if (!confirm('Are you sure you want to delete this warehouse?')) return;
  try {
    await warehouseStore.deleteWarehouse(id);
  } catch (error) {
    console.error('Error deleting warehouse:', error);
  }
};

// Location management functions
const openLocations = async (warehouse: any) => {
  selectedWarehouse.value = warehouse;
  await fetchLocations(warehouse.id);
  showLocationsModal.value = true;
};

const fetchLocations = async (warehouseId: number) => {
  try {
    const response = await api.get(`/api/warehouses/${warehouseId}/locations`);
    locations.value = response.data.data || [];
  } catch (error) {
    console.error('Error fetching locations:', error);
    locations.value = [];
  }
};

const openAddLocationModal = () => {
  editingLocation.value = null;
  locationForm.value = {
    code: '',
    rack: '',
    row: '',
    bin: '',
    capacity: null,
    description: '',
  };
  showLocationModal.value = true;
};

const editLocation = (location: any) => {
  editingLocation.value = location;
  locationForm.value = {
    code: location.code,
    rack: location.rack || '',
    row: location.row || '',
    bin: location.bin || '',
    capacity: location.capacity || null,
    description: location.description || '',
  };
  showLocationModal.value = true;
};

const handleLocationSubmit = async () => {
  if (!locationForm.value.code) {
    alert('Location code is required');
    return;
  }

  isLocationSubmitting.value = true;
  try {
    const payload = {
      code: locationForm.value.code,
      rack: locationForm.value.rack || null,
      row: locationForm.value.row || null,
      bin: locationForm.value.bin || null,
      capacity: locationForm.value.capacity || null,
      description: locationForm.value.description || null,
    };

    if (editingLocation.value) {
      await api.put(`/api/warehouses/${selectedWarehouse.value.id}/locations/${editingLocation.value.id}`, payload);
    } else {
      await api.post(`/api/warehouses/${selectedWarehouse.value.id}/locations`, payload);
    }

    showLocationModal.value = false;
    await fetchLocations(selectedWarehouse.value.id);
  } catch (error: any) {
    console.error('Error saving location:', error);
    alert(error.response?.data?.error || 'Failed to save location');
  } finally {
    isLocationSubmitting.value = false;
  }
};

const deleteLocation = async (locationId: number) => {
  if (!confirm('Are you sure you want to delete this location?')) return;

  try {
    await api.delete(`/api/warehouses/${selectedWarehouse.value.id}/locations/${locationId}`);
    await fetchLocations(selectedWarehouse.value.id);
  } catch (error: any) {
    console.error('Error deleting location:', error);
    alert(error.response?.data?.error || 'Failed to delete location');
  }
};

function handleExport() {
  exportToCSV(warehouses.value, 'Warehouses_Export');
}

</script>
