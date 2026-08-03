<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 py-6 sm:px-0">
        <div class="flex justify-between items-center mb-6">
          <h2 class="text-2xl font-bold text-gray-900">Product Types</h2>
          <button
            @click="openAddModal"
            class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            + Add Product Type
          </button>
        </div>

        <!-- Bulk Delete Bar -->
        <div v-if="selectedIds.length > 0" class="flex items-center gap-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          <span class="text-sm font-medium text-red-700">{{ selectedIds.length }} item(s) selected</span>
          <button @click="bulkDelete" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm">🗑️ Delete Selected</button>
          <button @click="selectedIds = []" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
        </div>

        <div v-if="store.loading" class="text-center py-8">
          <p>Loading...</p>
        </div>

        <div v-else-if="store.error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {{ store.error }}
        </div>

        <div v-else class="bg-white shadow overflow-hidden sm:rounded-md">
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 w-10"><input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="w-4 h-4 rounded border-gray-300 text-blue-600" /></th>
                <th @click="toggleSort('code')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">Code <span class="text-gray-400">{{ sortIcon('code') }}</span></th>
                <th @click="toggleSort('name')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">Name <span class="text-gray-400">{{ sortIcon('name') }}</span></th>
                <th @click="toggleSort('description')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">Description <span class="text-gray-400">{{ sortIcon('description') }}</span></th>
                <th @click="toggleSort('active')" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none">Status <span class="text-gray-400">{{ sortIcon('active') }}</span></th>
                <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">
              <tr v-for="type in sortedData" :key="type.id" :class="{ 'bg-blue-50': selectedIds.includes(type.id) }">
                <td class="px-4 py-4"><input type="checkbox" :value="type.id" v-model="selectedIds" class="w-4 h-4 rounded border-gray-300 text-blue-600" /></td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{{ type.code }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ type.name }}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{{ type.description || '-' }}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span :class="type.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'" class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full">
                    {{ type.active ? 'Active' : 'Inactive' }}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button @click="editProductType(type)" class="text-blue-600 hover:text-blue-900 mr-4">Edit</button>
                  <button @click="deleteProductType(type.id)" class="text-red-600 hover:text-red-900">Delete</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div v-if="sortedData.length === 0" class="text-center py-8 text-gray-500">
            No product types found
          </div>
        </div>
      </div>
    </main>

    <!-- Add/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        <div class="px-6 py-4 border-b border-gray-200">
          <h3 class="text-lg font-bold text-gray-900">{{ editingId ? 'Edit Product Type' : 'Add Product Type' }}</h3>
        </div>
        <div class="px-6 py-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input
              v-model="form.code"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              placeholder="e.g., RM, FG, PK"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="form.name"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              placeholder="e.g., Raw Material"
            />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              v-model="form.description"
              class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-blue-500"
              placeholder="Description"
              rows="2"
            ></textarea>
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
            @click="saveProductType"
            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {{ editingId ? 'Update' : 'Add' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useProductTypeStore } from '../stores/product-types';
import { useTableSort } from '../composables/useTableSort';

interface ProductType {
  id: number;
  code: string;
  name: string;
  description?: string;
  active: boolean;
}

const store = useProductTypeStore();
const showModal = ref(false);
const editingId = ref<number | null>(null);
const form = ref({ code: '', name: '', description: '', active: true });

const types = computed(() => store.types);
const selectedIds = ref<number[]>([]);
const isAllSelected = computed(() => types.value.length > 0 && types.value.every((t: any) => selectedIds.value.includes(t.id)));
const toggleSelectAll = () => { if (isAllSelected.value) { selectedIds.value = []; } else { selectedIds.value = types.value.map((t: any) => t.id); } };
const bulkDelete = async () => {
  if (!confirm(`Delete ${selectedIds.value.length} product types?`)) return;
  for (const id of selectedIds.value) { await store.deleteProductType(id); }
  selectedIds.value = [];
};

const { toggleSort, sortIcon, sortedData } = useTableSort(types);

const openAddModal = () => {
  editingId.value = null;
  form.value = { code: '', name: '', description: '', active: true };
  showModal.value = true;
};

const editProductType = (type: ProductType) => {
  editingId.value = type.id;
  form.value = {
    code: type.code,
    name: type.name,
    description: type.description || '',
    active: type.active
  };
  showModal.value = true;
};

const saveProductType = async () => {
  if (!form.value.code.trim() || !form.value.name.trim()) {
    alert('Code and Name are required');
    return;
  }

  try {
    if (editingId.value) {
      await store.updateProductType(editingId.value, form.value);
    } else {
      await store.createProductType(form.value);
    }
    showModal.value = false;
  } catch (error) {
    console.error('Error saving product type:', error);
    alert('Failed to save product type');
  }
};

const deleteProductType = async (id: number) => {
  if (confirm('Are you sure?')) {
    try {
      await store.deleteProductType(id);
    } catch (error) {
      console.error('Error deleting product type:', error);
      alert('Failed to delete product type');
    }
  }
};

onMounted(() => {
  store.fetchProductTypes();
});
</script>
