<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-3xl font-bold text-gray-900">📂 Item Categories</h1>
        <p class="text-gray-600 mt-1">Organize your items into logical categories</p>
      </div>
      <div class="flex gap-3">
        <input
          ref="fileInput"
          type="file"
          accept=".xlsx,.xls,.csv"
          class="hidden"
          @change="handleFileSelect"
        />
        <button
          @click="downloadTemplate"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
        >
          📋 Template
        </button>
        <button
          @click="fileInput?.click()"
          class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium transition-colors flex items-center gap-2"
        >
          📤 Import
        </button>
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
          class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
        >
          + Add Category
        </button>
      </div>
    </div>

    <!-- Search -->
    <div class="flex gap-4">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Search categories..."
        class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>

    <!-- Bulk Delete Bar -->
    <div v-if="selectedIds.length > 0" class="flex items-center gap-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
      <span class="text-sm font-medium text-red-700">{{ selectedIds.length }} item(s) selected</span>
      <button @click="bulkDelete" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm">🗑️ Delete Selected</button>
      <button @click="selectedIds = []" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium text-sm">Cancel</button>
    </div>

    <!-- Categories Table -->
    <div class="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-4 py-3 w-10"><input type="checkbox" :checked="isAllSelected" @change="toggleSelectAll" class="w-4 h-4 rounded border-gray-300 text-blue-600" /></th>
            <th @click="toggleSort('name')" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none">Name <span class="text-gray-400">{{ sortIcon('name') }}</span></th>
            <th @click="toggleSort('description')" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none">Description <span class="text-gray-400">{{ sortIcon('description') }}</span></th>
            <th @click="toggleSort('active')" class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase cursor-pointer hover:bg-gray-100 select-none">Status <span class="text-gray-400">{{ sortIcon('active') }}</span></th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-if="sortedData.length === 0" class="hover:bg-gray-50">
            <td colspan="5" class="px-6 py-4 text-center text-gray-500">No categories found</td>
          </tr>
          <tr v-for="category in sortedData" :key="category.id" class="hover:bg-gray-50 transition-colors" :class="{ 'bg-blue-50': selectedIds.includes(category.id) }">
            <td class="px-4 py-4"><input type="checkbox" :value="category.id" v-model="selectedIds" class="w-4 h-4 rounded border-gray-300 text-blue-600" /></td>
            <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ category.name }}</td>
            <td class="px-6 py-4 text-sm text-gray-700">{{ category.description || '-' }}</td>
            <td class="px-6 py-4 text-sm">
              <span
                :class="[
                  'px-3 py-1 rounded-full text-xs font-medium',
                  category.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                ]"
              >
                {{ category.active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2 flex gap-2">
              <button
                @click="editCategory(category)"
                class="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 text-sm font-medium"
              >
                Edit
              </button>
              <button
                @click="deleteCategory(category.id)"
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
    <div v-if="showModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="showModal = false">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center justify-between">
          <h2 class="font-bold text-lg text-gray-800">{{ editingCategory ? 'Edit Category' : 'Add New Category' }}</h2>
          <button @click="showModal = false" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <form @submit.prevent="handleSubmit" class="p-6 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              v-model="formValues.name"
              type="text"
              placeholder="e.g., Raw Materials"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              :class="formError ? 'border-red-400' : ''"
              autofocus
            />
            <p v-if="formError" class="text-xs text-red-500 mt-1">{{ formError }}</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              v-model="formValues.description"
              placeholder="Category description..."
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <div class="flex items-center gap-2">
            <input id="active" v-model="formValues.active" type="checkbox" class="w-4 h-4 rounded border-gray-300" />
            <label for="active" class="text-sm font-medium text-gray-700">Active</label>
          </div>
          <div class="flex justify-end gap-3 pt-2 border-t">
            <button type="button" @click="showModal = false" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" :disabled="isSaving" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
              {{ isSaving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, computed, onMounted } from 'vue';
import { useCategoryStore } from '../stores/categories';
import { useTableSort } from '../composables/useTableSort';
import { api } from '@/lib/api';

const categoryStore = useCategoryStore();

const showModal    = ref(false);
const isSaving     = ref(false);
const searchQuery  = ref('');
const editingCategory = ref<any>(null);
const fileInput    = ref<HTMLInputElement | null>(null);
const formError    = ref('');
const formValues   = ref({ name: '', description: '', active: true });

onMounted(async () => {
  await categoryStore.fetchCategories();
});

const categories = computed(() => categoryStore.categories);

const filteredCategories = computed(() =>
  categories.value.filter((c) =>
    !searchQuery.value ||
    c.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
    (c.description && c.description.toLowerCase().includes(searchQuery.value.toLowerCase()))
  )
);

const selectedIds = ref<number[]>([]);
const isAllSelected = computed(() => filteredCategories.value.length > 0 && filteredCategories.value.every((c: any) => selectedIds.value.includes(c.id)));
const toggleSelectAll = () => { if (isAllSelected.value) { selectedIds.value = []; } else { selectedIds.value = filteredCategories.value.map((c: any) => c.id); } };
const bulkDelete = async () => {
  if (!confirm(`Delete ${selectedIds.value.length} categories?`)) return;
  for (const id of selectedIds.value) { await categoryStore.deleteCategory(id); }
  selectedIds.value = [];
};

const { toggleSort, sortIcon, sortedData } = useTableSort(filteredCategories);

const openAddModal = () => {
  editingCategory.value = null;
  formValues.value = { name: '', description: '', active: true };
  formError.value = '';
  showModal.value = true;
};

const editCategory = (category: any) => {
  editingCategory.value = category;
  formValues.value = { name: category.name, description: category.description || '', active: !!category.active };
  formError.value = '';
  showModal.value = true;
};

const handleSubmit = async () => {
  formError.value = '';
  if (!formValues.value.name.trim()) {
    formError.value = 'Category name is required';
    return;
  }
  if (formValues.value.name.trim().length < 2) {
    formError.value = 'Category name must be at least 2 characters';
    return;
  }
  isSaving.value = true;
  try {
    if (editingCategory.value) {
      await categoryStore.updateCategory(editingCategory.value.id, formValues.value);
    } else {
      await categoryStore.createCategory(formValues.value);
    }
    showModal.value = false;
  } catch (error: any) {
    formError.value = error?.response?.data?.error || 'Failed to save category';
  } finally {
    isSaving.value = false;
  }
};

const deleteCategory = async (id: number) => {
  if (!confirm('Are you sure you want to delete this category?')) return;
  try {
    await categoryStore.deleteCategory(id);
  } catch (error) {
    console.error('Error deleting category:', error);
  }
};

// Import functions
const selectedFile = ref<File | null>(null);

async function downloadTemplate() {
  try {
    const response = await api.get('/import/template/categories', {
      responseType: 'blob'
    });
    
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_categories.xlsx');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (err: any) {
    alert('Failed to download template');
  }
}

async function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  
  selectedFile.value = file;
  
  if (!confirm(`Import "${file.name}"?`)) {
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
    return;
  }
  
  await previewImport();
}

async function previewImport() {
  if (!selectedFile.value) return;
  
  const formData = new FormData();
  formData.append('file', selectedFile.value);
  
  try {
    const response = await api.post('/import/preview/categories', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    const { success, validation } = response.data;
    
    if (!success) {
      alert(`Validation failed!\n${validation.firstError?.errors?.join(', ') || 'Unknown error'}`);
      selectedFile.value = null;
      if (fileInput.value) fileInput.value.value = '';
      return;
    }
    
    if (confirm(`Ready to import ${validation.totalRows} categories. Continue?`)) {
      await performImport();
    } else {
      selectedFile.value = null;
      if (fileInput.value) fileInput.value.value = '';
    }
  } catch (err: any) {
    alert('Preview failed: ' + (err.response?.data?.error || err.message));
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function performImport() {
  if (!selectedFile.value) return;
  
  const formData = new FormData();
  formData.append('file', selectedFile.value);
  
  try {
    const response = await api.post('/import/import/categories', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    alert(`✅ ${response.data.message}`);
    await categoryStore.fetchCategories();
    
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
  } catch (err: any) {
    alert('Import failed: ' + (err.response?.data?.error || err.message));
  }
}

function handleExport() {
  exportToCSV(categories.value, 'Categories_Export');
}

</script>
