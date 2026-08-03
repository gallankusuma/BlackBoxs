<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
    <div class="max-w-7xl mx-auto">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-slate-800 mb-2">Batch Management</h1>
        <p class="text-slate-600">Track and manage production batches with full traceability</p>
      </div>

      <!-- Filters & Actions -->
      <div class="bg-white rounded-lg shadow-sm p-4 mb-6 tilt-card">
        <div class="flex flex-wrap gap-4 items-center justify-between">
          <div class="flex gap-3">
            <select v-model="filterStatus" @change="applyFilters" 
                    class="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="in_qc">In QC</option>
              <option value="released">Released</option>
              <option value="closed">Closed</option>
            </select>
            
            <select v-model="filterQCStatus" @change="applyFilters"
                    class="px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">All QC Status</option>
              <option value="pending">Pending QC</option>
              <option value="passed">QC Passed</option>
              <option value="failed">QC Failed</option>
            </select>
          </div>

          <button @click="showBatchForm = true" 
                  class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            + New Batch
          </button>
        </div>
      </div>

      <!-- Expiring Batches Alert -->
      <div v-if="expiringBatches.length > 0" class="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
        <div class="flex items-start gap-3">
          <span class="text-2xl">⚠️</span>
          <div>
            <h3 class="font-semibold text-amber-900 mb-1">Batches Expiring Soon</h3>
            <p class="text-sm text-amber-700 mb-2">{{ expiringBatches.length }} batch(es) expiring in the next 30 days</p>
            <button @click="showExpiringModal = true" class="text-sm text-amber-800 underline hover:text-amber-900">
              View Details
            </button>
          </div>
        </div>
      </div>

      <!-- Batches Table -->
      <div class="bg-white rounded-lg shadow-sm overflow-hidden tilt-card">
        <div v-if="loading" class="p-8 text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent"></div>
          <p class="mt-2 text-slate-600">Loading batches...</p>
        </div>

        <div v-else-if="error" class="p-8 text-center text-red-600">
          {{ error }}
        </div>

        <table v-else class="w-full">
          <thead class="bg-slate-50 border-b border-slate-200">
            <tr>
              <th class="text-left p-4 font-semibold text-slate-700">Batch Number</th>
              <th class="text-left p-4 font-semibold text-slate-700">Product</th>
              <th class="text-left p-4 font-semibold text-slate-700">Quantity</th>
              <th class="text-left p-4 font-semibold text-slate-700">Mfg Date</th>
              <th class="text-left p-4 font-semibold text-slate-700">Exp Date</th>
              <th class="text-left p-4 font-semibold text-slate-700">Status</th>
              <th class="text-left p-4 font-semibold text-slate-700">QC Status</th>
              <th class="text-left p-4 font-semibold text-slate-700">Location</th>
              <th class="text-right p-4 font-semibold text-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            <tr v-for="batch in batches" :key="batch.id" class="hover:bg-slate-50 transition">
              <td class="p-4">
                <span class="font-mono text-sm font-semibold text-blue-600">{{ batch.batch_number }}</span>
              </td>
              <td class="p-4">
                <div class="text-sm font-medium text-slate-900">{{ batch.product_name }}</div>
                <div class="text-xs text-slate-500">SKU: {{ batch.sku }}</div>
              </td>
              <td class="p-4 text-sm">{{ batch.quantity }} {{ batch.uom }}</td>
              <td class="p-4 text-sm">{{ formatDate(batch.mfg_date) }}</td>
              <td class="p-4 text-sm">{{ batch.exp_date ? formatDate(batch.exp_date) : '-' }}</td>
              <td class="p-4">
                <span :class="getStatusClass(batch.status)" class="px-3 py-1 rounded-full text-xs font-medium">
                  {{ batch.status }}
                </span>
              </td>
              <td class="p-4">
                <span :class="getQCStatusClass(batch.qc_status)" class="px-3 py-1 rounded-full text-xs font-medium">
                  {{ batch.qc_status }}
                </span>
              </td>
              <td class="p-4 text-sm">{{ batch.location || '-' }}</td>
              <td class="p-4 text-right space-x-2">
                <button @click="viewBatch(batch)" 
                        class="text-blue-600 hover:text-blue-800 text-sm font-medium">
                  View
                </button>
                <button v-if="batch.qc_status === 'passed' && batch.status === 'in_qc'" 
                        @click="releaseBatch(batch.id!)"
                        class="text-green-600 hover:text-green-800 text-sm font-medium">
                  Release
                </button>
              </td>
            </tr>
            <tr v-if="batches.length === 0">
              <td colspan="9" class="p-8 text-center text-slate-500">
                No batches found
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Batch Form Modal -->
    <div v-if="showBatchForm" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <h2 class="text-2xl font-bold text-slate-800">{{ editingBatch ? 'Edit Batch' : 'New Batch' }}</h2>
        </div>
        
        <form @submit.prevent="submitBatch" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Batch Number *</label>
              <input v-model="batchForm.batch_number" type="text" required
                     class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Product *</label>
              <select v-model="batchForm.product_id" required
                      class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">Select Product</option>
                <option v-for="product in products" :key="product.id" :value="product.id">
                  {{ product.name }} ({{ product.sku }})
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Quantity *</label>
              <input v-model.number="batchForm.quantity" type="number" step="0.01" required
                     class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">UoM *</label>
              <select v-model="batchForm.uom" required
                      class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="KG">KG</option>
                <option value="L">L</option>
                <option value="PCS">PCS</option>
                <option value="BOX">BOX</option>
                <option value="DRUM">DRUM</option>
                <option value="PAIL">PAIL</option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Manufacturing Date *</label>
              <input v-model="batchForm.mfg_date" type="date" required
                     class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
              <input v-model="batchForm.exp_date" type="date"
                     class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
            </div>

            <div>
              <label class="block text-sm font-medium text-slate-700 mb-1">Status</label>
              <select v-model="batchForm.status"
                      class="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="open">Open</option>
                <option value="in_qc">In QC</option>
                <option value="released">Released</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-4">
            <button type="button" @click="closeBatchForm"
                    class="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition">
              Cancel
            </button>
            <button type="submit"
                    class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              {{ editingBatch ? 'Update' : 'Create' }} Batch
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Batch Detail Modal -->
    <div v-if="showDetailModal && currentBatch" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <h2 class="text-2xl font-bold text-slate-800">Batch Details</h2>
        </div>
        
        <div class="p-6 space-y-6">
          <!-- Batch Info -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-sm font-medium text-slate-500">Batch Number</label>
              <p class="text-lg font-mono font-semibold text-blue-600">{{ currentBatch.batch_number }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-500">Product</label>
              <p class="text-lg font-semibold">{{ currentBatch.product_name }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-500">Quantity</label>
              <p class="text-lg">{{ currentBatch.quantity }} {{ currentBatch.uom }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-500">Status</label>
              <span :class="getStatusClass(currentBatch.status)" class="inline-block px-3 py-1 rounded-full text-sm font-medium mt-1">
                {{ currentBatch.status }}
              </span>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-500">QC Status</label>
              <span :class="getQCStatusClass(currentBatch.qc_status)" class="inline-block px-3 py-1 rounded-full text-sm font-medium mt-1">
                {{ currentBatch.qc_status }}
              </span>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-500">Location</label>
              <p class="text-lg">{{ currentBatch.location || '-' }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-500">Mfg Date</label>
              <p class="text-lg">{{ formatDate(currentBatch.mfg_date) }}</p>
            </div>
            <div>
              <label class="text-sm font-medium text-slate-500">Exp Date</label>
              <p class="text-lg">{{ currentBatch.exp_date ? formatDate(currentBatch.exp_date) : '-' }}</p>
            </div>
          </div>

          <!-- QC Results -->
          <div v-if="currentBatch.qc_results && currentBatch.qc_results.length > 0">
            <h3 class="text-lg font-semibold text-slate-800 mb-3">QC Test Results</h3>
            <div class="bg-slate-50 rounded-lg p-4 space-y-3">
              <div v-for="result in currentBatch.qc_results" :key="result.id" 
                   class="bg-white rounded-lg p-4 border border-slate-200">
                <div class="flex justify-between items-start">
                  <div>
                    <p class="font-semibold text-slate-800">{{ result.test_name }}</p>
                    <p class="text-sm text-slate-600">{{ result.test_code }}</p>
                    <p v-if="result.measured_value" class="text-sm mt-1">
                      Measured: <span class="font-medium">{{ result.measured_value }}</span>
                    </p>
                    <p v-if="result.result_text" class="text-sm mt-1">{{ result.result_text }}</p>
                  </div>
                  <span :class="getQCStatusClass(result.status)" class="px-3 py-1 rounded-full text-xs font-medium">
                    {{ result.status }}
                  </span>
                </div>
                <div class="mt-2 text-xs text-slate-500">
                  Tested by {{ result.tested_by_name }} on {{ formatDate(result.tested_at) }}
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-3 pt-4 border-t">
            <button @click="showDetailModal = false"
                    class="px-6 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useBatchStore, type Batch } from '@/stores/batches';
import { useProductStore } from '@/stores/products';

const batchStore = useBatchStore();
const productStore = useProductStore();

const batches = computed(() => batchStore.batches);
const currentBatch = computed(() => batchStore.currentBatch);
const expiringBatches = computed(() => batchStore.expiringBatches);
const products = computed(() => productStore.products);
const loading = computed(() => batchStore.loading);
const error = computed(() => batchStore.error);

const showBatchForm = ref(false);
const showDetailModal = ref(false);
const showExpiringModal = ref(false);
const editingBatch = ref<Batch | null>(null);
const filterStatus = ref('');
const filterQCStatus = ref('');

const batchForm = ref<Batch>({
  batch_number: '',
  product_id: 0,
  quantity: 0,
  uom: 'KG',
  mfg_date: '',
  exp_date: '',
  status: 'open',
  qc_status: 'pending',
});

onMounted(async () => {
  await Promise.all([
    batchStore.fetchBatches(),
    batchStore.fetchExpiringBatches(),
    productStore.fetchProducts(),
  ]);
});

const applyFilters = async () => {
  const filters: any = {};
  if (filterStatus.value) filters.status = filterStatus.value;
  if (filterQCStatus.value) filters.qc_status = filterQCStatus.value;
  await batchStore.fetchBatches(filters);
};

const submitBatch = async () => {
  try {
    if (editingBatch.value) {
      await batchStore.updateBatch(editingBatch.value.id!, batchForm.value);
    } else {
      await batchStore.createBatch(batchForm.value);
    }
    closeBatchForm();
  } catch (error) {
    console.error('Error submitting batch:', error);
  }
};

const closeBatchForm = () => {
  showBatchForm.value = false;
  editingBatch.value = null;
  batchForm.value = {
    batch_number: '',
    product_id: 0,
    quantity: 0,
    uom: 'KG',
    mfg_date: '',
    exp_date: '',
    status: 'open',
    qc_status: 'pending',
  };
};

const viewBatch = async (batch: Batch) => {
  await batchStore.fetchBatch(batch.id!);
  showDetailModal.value = true;
};

const releaseBatch = async (id: number) => {
  if (confirm('Release this batch for use?')) {
    try {
      await batchStore.releaseBatch(id);
      alert('Batch released successfully');
    } catch (error) {
      console.error('Error releasing batch:', error);
    }
  }
};

const formatDate = (date: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const getStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    open: 'bg-blue-100 text-blue-800',
    in_qc: 'bg-purple-100 text-purple-800',
    released: 'bg-green-100 text-green-800',
    closed: 'bg-slate-100 text-slate-800',
    rejected: 'bg-red-100 text-red-800',
  };
  return classes[status] || 'bg-slate-100 text-slate-800';
};

const getQCStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    passed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  };
  return classes[status] || 'bg-slate-100 text-slate-800';
};
</script>
