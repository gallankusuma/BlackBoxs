<template>
  <div class="space-y-4">
    <div class="flex justify-between items-center mb-6">
      <h1 class="text-2xl font-bold text-gray-900">Add New Product</h1>
      <button
        @click="$router.back()"
        class="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
      >
        Back
      </button>
    </div>

    <form @submit="handleSubmit" class="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
      <div class="grid grid-cols-2 gap-6">
        <!-- SKU -->
        <FormField
          name="sku"
          label="SKU"
          type="text"
          placeholder="e.g., PROD-001"
          required
          :model-value="values.sku"
          :error="errors.sku"
          @update:model-value="(val) => { values.sku = val }"
        />

        <!-- Product Name -->
        <FormField
          name="name"
          label="Product Name"
          type="text"
          placeholder="e.g., Calcium Carbonate"
          required
          :model-value="values.name"
          :error="errors.name"
          @update:model-value="(val) => { values.name = val }"
        />

        <!-- Category -->
        <FormField
          name="category"
          label="Category"
          type="select"
          required
          :model-value="values.category"
          :error="errors.category"
          :options="categoryOptions"
          @update:model-value="(val) => { values.category = val }"
        />

        <!-- Unit of Measure -->
        <FormField
          name="unit_of_measure"
          label="Unit of Measure"
          type="select"
          required
          :model-value="values.unit_of_measure"
          :error="errors.unit_of_measure"
          :options="unitOptions"
          @update:model-value="(val) => { values.unit_of_measure = val }"
        />

        <!-- Product Type -->
        <FormField
          name="product_type"
          label="Product Type"
          type="select"
          :model-value="values.product_type"
          :error="errors.product_type"
          :options="productTypeOptions"
          select-placeholder="Select a type"
          @update:model-value="(val) => { values.product_type = val }"
        />

        <!-- Standard Cost -->
        <FormField
          name="standard_cost"
          label="Standard Cost"
          type="number"
          placeholder="0.00"
          :model-value="values.standard_cost"
          :error="errors.standard_cost"
          @update:model-value="(val) => { values.standard_cost = val }"
        />
      </div>

      <!-- Description -->
      <FormField
        name="description"
        label="Description"
        type="textarea"
        placeholder="Product description..."
        :model-value="values.description"
        :error="errors.description"
        :rows="4"
        @update:model-value="(val) => { values.description = val }"
      />

      <!-- Form Actions -->
      <div class="flex gap-4 pt-4 border-t border-gray-200">
        <button
          type="submit"
          :disabled="isSubmitting"
          class="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {{ isSubmitting ? 'Creating...' : 'Create Product' }}
        </button>
        <button
          type="button"
          @click="() => resetForm()"
          class="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
        >
          Reset
        </button>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import FormField from '../components/FormField.vue';
import { useFormValidation } from '../composables/useFormValidation';
import { productSchema, type ProductFormData } from '../schemas/forms';
import { api } from '../lib/api';

const router = useRouter();

const categoryOptions = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'finished_goods', label: 'Finished Goods' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'other', label: 'Other' },
];

const unitOptions = [
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'gram', label: 'Gram (g)' },
  { value: 'liter', label: 'Liter (L)' },
  { value: 'ml', label: 'Milliliter (mL)' },
  { value: 'pcs', label: 'Pieces (pcs)' },
  { value: 'box', label: 'Box' },
];

const productTypeOptions = [
  { value: 'raw_material', label: 'Raw Material' },
  { value: 'finished_goods', label: 'Finished Goods' },
  { value: 'packaging', label: 'Packaging' },
];

const { handleSubmit, values, errors, isSubmitting, resetForm } = useFormValidation(
  productSchema,
  async (formData: ProductFormData) => {
    try {
      await api.post('/api/products', formData);
      router.push('/products');
    } catch (error) {
      console.error('Error creating product:', error);
    }
  },
  {
    sku: '',
    name: '',
    category: '',
    unit_of_measure: '',
    product_type: 'raw_material' as 'raw_material' | 'finished_goods' | 'packaging',
    description: '',
    standard_cost: 0,
    density: 0,
  }
);
</script>
