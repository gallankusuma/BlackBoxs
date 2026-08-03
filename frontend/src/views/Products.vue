<template>
  <div class="space-y-6">
    <!-- Header -->
    <PageHeader title="Products (Items)" icon="🔧" subtitle="Manage all your inventory and non-inventory items">
      <template #actions>
        <button
          v-permission="['admin', 'manager']"
          @click="openAddModal"
          class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 font-medium transition-colors"
        >
          + Add Product
        </button>
      </template>
    </PageHeader>

    <!-- Search & Filter -->
    <FilterBar
      v-model="searchQuery"
      search-placeholder="Search by SKU or name..."
      :filters="categoryFilters"
      @filter-change="onFilterChange"
    />

    <!-- Products Table -->
    <DataTable
      :columns="columns"
      :rows="filteredProducts"
      :actions="tableActions"
      :loading="false"
    >
      <template #cell-standard_cost="{ value }">
        {{ formatCurrency(value || 0) }}
      </template>
      <template #cell-is_active="{ row }">
        <StatusBadge :status="row.is_active ? 'Active' : 'Inactive'" />
      </template>
    </DataTable>

    <!-- Add/Edit Modal -->
    <Dialog :is-open="showModal" @update:is-open="showModal = $event" size="medium">
      <template #title>
        {{ editingProduct ? 'Edit Product' : 'Add New Product' }}
      </template>

      <form @submit="handleSubmit" class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <FormField name="sku" label="SKU" :model-value="values.sku" @update:model-value="values.sku = $event" placeholder="PROD-001" required :error="errors.sku" />
          <FormField name="name" label="Product Name" :model-value="values.name" @update:model-value="values.name = $event" placeholder="Product name" required :error="errors.name" />
          <FormField name="category" label="Category" type="select" :model-value="values.category" @update:model-value="values.category = $event" required :error="errors.category" :options="categories.map(c => ({ value: c.name, label: c.name }))" select-placeholder="Select category" />
          <FormField name="unit_of_measure" label="Unit of Measure" type="select" :model-value="values.unit_of_measure" @update:model-value="values.unit_of_measure = $event" required :error="errors.unit_of_measure" :options="unitOptions" select-placeholder="Select unit" />
          <FormField name="standard_cost" label="Standard Cost" type="number" :model-value="values.standard_cost" @update:model-value="values.standard_cost = $event" placeholder="0.00" :error="errors.standard_cost" />
        </div>
        <FormField name="description" label="Description" type="textarea" :model-value="values.description" @update:model-value="values.description = $event" placeholder="Product description..." :rows="3" />
      </form>

      <template #actions="{ close }">
        <button @click="close" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 font-medium">
          Cancel
        </button>
        <button @click="handleSubmit" :disabled="isSubmitting" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 disabled:opacity-50 font-medium">
          {{ isSubmitting ? 'Saving...' : 'Save' }}
        </button>
      </template>
    </Dialog>

    <!-- Delete confirm -->
    <ConfirmDialog
      :is-open="showDeleteConfirm"
      title="Delete Product"
      message="Are you sure you want to delete this product? This action cannot be undone."
      confirm-label="Delete"
      confirm-variant="danger"
      @confirm="confirmDelete"
      @cancel="showDeleteConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useFormValidation } from '../composables/useFormValidation';
import { productSchema, type ProductFormData } from '../schemas/forms';
import { useProductStore } from '../stores/products';
import { useCategoryStore } from '../stores/categories';
import Dialog from '../components/ui/Dialog.vue';
import PageHeader from '../components/ui/PageHeader.vue';
import FilterBar from '../components/ui/FilterBar.vue';
import StatusBadge from '../components/ui/StatusBadge.vue';
import ConfirmDialog from '../components/ui/ConfirmDialog.vue';
import DataTable from '../components/DataTable.vue';
import FormField from '../components/FormField.vue';
import { formatCurrency } from '../utils/format';

const productStore = useProductStore();
const categoryStore = useCategoryStore();

const showModal = ref(false);
const showDeleteConfirm = ref(false);
const deletingProductId = ref<number | null>(null);
const searchQuery = ref('');
const filterCategory = ref('');
const editingProduct = ref<any>(null);

const unitOptions = [
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'gram', label: 'Gram (g)' },
  { value: 'liter', label: 'Liter (L)' },
  { value: 'ml', label: 'Milliliter (mL)' },
  { value: 'pcs', label: 'Pieces (pcs)' },
  { value: 'box', label: 'Box' },
];

const columns = [
  { key: 'sku', label: 'SKU' },
  { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' },
  { key: 'unit_of_measure', label: 'UoM' },
  { key: 'standard_cost', label: 'Cost' },
  { key: 'is_active', label: 'Status' },
];

const tableActions = [
  { label: 'Edit', variant: 'default' as const, handler: (row: any) => editProduct(row) },
  { label: 'Delete', variant: 'danger' as const, handler: (row: any) => deleteProduct(row.id) },
];

onMounted(async () => {
  await productStore.fetchProducts();
  await categoryStore.fetchCategories();
});

const products = computed(() => productStore.products);
const categories = computed(() => categoryStore.categories);

const categoryFilters = computed(() => [{
  key: 'category',
  label: 'All Categories',
  options: categories.value.map(c => ({ value: c.id, label: c.name })),
}]);

const filteredProducts = computed(() => {
  return products.value.filter((p) => {
    const matchesSearch = !searchQuery.value ||
      p.sku.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      p.name.toLowerCase().includes(searchQuery.value.toLowerCase());
    const matchesCategory = !filterCategory.value || p.category === filterCategory.value;
    return matchesSearch && matchesCategory;
  });
});

const onFilterChange = (key: string, value: string) => {
  if (key === 'category') filterCategory.value = value;
};

const { handleSubmit, values, errors, isSubmitting, resetForm } = useFormValidation(
  productSchema,
  async (formData: ProductFormData) => {
    try {
      if (editingProduct.value) {
        await productStore.updateProduct(editingProduct.value.id, formData);
      } else {
        await productStore.createProduct(formData);
      }
      showModal.value = false;
      resetForm();
      editingProduct.value = null;
    } catch (error) {
      console.error('Error saving product:', error);
    }
  }
);

const openAddModal = () => {
  editingProduct.value = null;
  resetForm();
  showModal.value = true;
};

const editProduct = (product: any) => {
  editingProduct.value = product;
  Object.assign(values, product);
  showModal.value = true;
};

const deleteProduct = (id: number) => {
  deletingProductId.value = id;
  showDeleteConfirm.value = true;
};

const confirmDelete = async () => {
  if (!deletingProductId.value) return;
  try {
    await productStore.deleteProduct(deletingProductId.value);
  } catch (error) {
    console.error('Error deleting product:', error);
  }
  showDeleteConfirm.value = false;
  deletingProductId.value = null;
};


</script>
