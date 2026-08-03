<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">🏷️ Item Types</h1>
        <p class="text-gray-600 mt-1">Define inventory vs non-inventory item classifications</p>
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
        + Add Item Type
      </button>
    </div>

    <!-- Bulk Delete Bar -->
    <div v-if="selectedIds.length > 0" class="flex items-center gap-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <span class="text-sm font-medium text-red-700">{{ selectedIds.length }} item(s) selected</span>
      <button @click="bulkDelete" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm">🗑️ Delete Selected</button>
      <button @click="selectedIds = []" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
    </div>

    <!-- Item Types Table -->
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 w-10"><input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="w-4 h-4 rounded border-gray-300 text-blue-600" /></th>
            <th @click="toggleSort('code')" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none">Code <span class="text-gray-400">{{ sortIcon('code') }}</span></th>
            <th @click="toggleSort('name')" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none">Name <span class="text-gray-400">{{ sortIcon('name') }}</span></th>
            <th @click="toggleSort('description')" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none">Description <span class="text-gray-400">{{ sortIcon('description') }}</span></th>
            <th @click="toggleSort('active')" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none">Status <span class="text-gray-400">{{ sortIcon('active') }}</span></th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-if="sortedData.length === 0" class="hover:bg-gray-50">
            <td colspan="6" class="px-6 py-4 text-center text-gray-500">No item types found</td>
          </tr>
          <tr v-for="type in sortedData" :key="type.id" class="hover:bg-gray-50 transition-colors" :class="{ 'bg-blue-50': selectedIds.includes(type.id) }">
            <td class="px-4 py-4"><input type="checkbox" :value="type.id" v-model="selectedIds" class="w-4 h-4 rounded border-gray-300 text-blue-600" /></td>
            <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ type.code }}</td>
            <td class="px-6 py-4 text-sm text-gray-900">{{ type.name }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ type.description || '-' }}</td>
            <td class="px-6 py-4 text-sm">
              <span
                :class="[
                  'px-3 py-1 rounded-full text-xs font-medium',
                  type.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                ]"
              >
                {{ type.active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2 flex gap-2">
              <button
                @click="editItemType(type)"
                class="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-medium"
              >
                Edit
              </button>
              <button
                @click="deleteItemType(type.id)"
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
        {{ editingType ? 'Edit Item Type' : 'Add New Item Type' }}
      </template>

      <form @submit="onFormSubmit" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-gray-700">Code *</label>
            <input
              v-model="formData.code"
              type="text"
              placeholder="e.g., INV, NON-INV"
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p v-if="errors.code" class="text-xs text-red-500">{{ errors.code }}</p>
          </div>

          <div class="flex flex-col gap-2">
            <label class="text-sm font-medium text-gray-700">Name *</label>
            <input
              v-model="formData.name"
              type="text"
              placeholder="e.g., Inventory Item"
              class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p v-if="errors.name" class="text-xs text-red-500">{{ errors.name }}</p>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-sm font-medium text-gray-700">Description</label>
          <textarea
            v-model="formData.description"
            placeholder="Item type description..."
            rows="3"
            class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <input
              id="active"
              v-model="formData.active"
              type="checkbox"
              class="w-4 h-4 rounded border-gray-300"
            />
            <label for="active" class="text-sm font-medium text-gray-700">Active</label>
          </div>
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
          @click="onFormSubmit"
          :disabled="isSubmitting"
          class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {{ isSubmitting ? 'Saving...' : 'Save' }}
        </button>
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, onMounted, computed, reactive } from 'vue';
import { z } from 'zod';
import Dialog from '../components/ui/Dialog.vue';
import { useItemTypeStore } from '../stores/item-types';
import { useTableSort } from '../composables/useTableSort';

const itemTypeSchema = z.object({
  code: z.string().min(1, 'Code is required').min(2, 'Code must be at least 2 characters'),
  name: z.string().min(1, 'Name is required').min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  active: z.boolean().default(true),
});

const store = useItemTypeStore();
const showModal = ref(false);
const editingType = ref<any>(null);
const isSubmitting = ref(false);

const itemTypes = computed(() => store.itemTypes);

const selectedIds = ref<number[]>([]);
const isAllSelected = computed(() => itemTypes.value.length > 0 && itemTypes.value.every((t: any) => selectedIds.value.includes(t.id)));
const toggleSelectAll = () => { if (isAllSelected.value) { selectedIds.value = []; } else { selectedIds.value = itemTypes.value.map((t: any) => t.id); } };
const bulkDelete = async () => {
  if (!confirm(`Delete ${selectedIds.value.length} item types?`)) return;
  for (const id of selectedIds.value) { await store.deleteItemType(id); }
  selectedIds.value = [];
};

const { toggleSort, sortIcon, sortedData } = useTableSort(itemTypes);

// Create reactive form state
const formData = reactive({
  code: '',
  name: '',
  description: '',
  active: true,
});

const errors = reactive<Record<string, string>>({
  code: '',
  name: '',
  description: '',
  active: '',
});

const resetFormData = () => {
  formData.code = '';
  formData.name = '';
  formData.description = '';
  formData.active = true;
  Object.keys(errors).forEach(key => {
    errors[key] = '';
  });
};

const validateForm = (): boolean => {
  Object.keys(errors).forEach(key => {
    errors[key] = '';
  });

  try {
    itemTypeSchema.parse(formData);
    return true;
  } catch (error: any) {
    if (error.issues) {
      error.issues.forEach((issue: any) => {
        errors[issue.path[0]] = issue.message;
      });
    }
    return false;
  }
};

const onFormSubmit = async () => {
  if (!validateForm()) return;

  isSubmitting.value = true;
  try {
    if (editingType.value) {
      await store.updateItemType(editingType.value.id, { ...formData });
    } else {
      await store.createItemType({ ...formData });
    }
    showModal.value = false;
    resetFormData();
    editingType.value = null;
  } catch (error) {
    console.error('Error saving item type:', error);
  } finally {
    isSubmitting.value = false;
  }
};

const openAddModal = () => {
  editingType.value = null;
  resetFormData();
  showModal.value = true;
};

const editItemType = (type: any) => {
  editingType.value = type;
  formData.code = type.code;
  formData.name = type.name;
  formData.description = type.description || '';
  formData.active = type.active;
  showModal.value = true;
};

const deleteItemType = async (id: number) => {
  if (!confirm('Are you sure you want to delete this item type?')) return;
  try {
    await store.deleteItemType(id);
  } catch (error) {
    console.error('Error deleting item type:', error);
  }
};

onMounted(() => {
  store.fetchItemTypes();
});

function handleExport() {
  exportToCSV(itemTypes.value, 'ItemTypes_Export');
}

</script>
