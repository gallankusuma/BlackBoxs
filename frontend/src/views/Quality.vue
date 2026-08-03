<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
      <div class="px-4 sm:px-0 space-y-8">
        <header class="flex items-center justify-between">
          <div>
            <p class="text-sm text-gray-500">Quality</p>
            <h1 class="text-2xl font-bold text-gray-900">Batches & QC Results</h1>
          </div>
          <span v-if="store.loading" class="text-sm text-gray-500">Loading...</span>
        </header>

        <div v-if="errorMsg" class="bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded">{{ errorMsg }}</div>
        <div v-if="successMsg" class="bg-green-100 border border-green-400 text-green-700 px-4 py-2 rounded">{{ successMsg }}</div>

        <p v-if="store.error" class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">{{ store.error }}</p>

        <section class="bg-white shadow sm:rounded-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold text-gray-900">Batches</h2>
            <div class="flex flex-wrap gap-2 items-center">
                <select v-model.number="batchForm.product_id" class="input w-44">
                  <option :value="undefined" disabled>Pilih Product</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }} ({{ p.sku }})</option>
                </select>
              <input v-model="batchForm.mfg_date" type="date" class="input w-32" />
              <button @click="submitBatch" class="btn-primary" :disabled="submitting">Create Batch</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Batch</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Product</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">MFG</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">EXP</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="batch in store.batches" :key="batch.id">
                  <td class="px-3 py-2">{{ batch.batch_number }}</td>
                  <td class="px-3 py-2">{{ batch.product_name }}</td>
                  <td class="px-3 py-2">{{ batch.status }}</td>
                  <td class="px-3 py-2">{{ batch.mfg_date ? formatDate(batch.mfg_date) : '-' }}</td>
                  <td class="px-3 py-2">{{ batch.exp_date ? formatDate(batch.exp_date) : '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="bg-white shadow sm:rounded-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold text-gray-900">QC Tests</h2>
            <div class="flex space-x-2 items-center">
              <input v-model="testForm.name" placeholder="Name" class="input" />
              <button @click="submitTest" class="btn-primary" :disabled="submitting">Add Test</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Name</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Description</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="test in store.qcTests" :key="test.id">
                  <td class="px-3 py-2">{{ test.name }}</td>
                  <td class="px-3 py-2">{{ test.description || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="bg-white shadow sm:rounded-lg p-4">
          <div class="flex items-center justify-between mb-3">
            <h2 class="text-lg font-semibold text-gray-900">QC Results</h2>
            <div class="flex flex-wrap gap-2 items-center">
                <select v-model.number="resultForm.batch_id" class="input w-40">
                  <option :value="undefined" disabled>Pilih Batch</option>
                  <option v-for="b in store.batches" :key="b.id" :value="b.id">{{ b.batch_number }} - {{ b.product_name }}</option>
                </select>
                <select v-model.number="resultForm.test_id" class="input w-36">
                  <option :value="undefined" disabled>Pilih Test</option>
                  <option v-for="t in store.qcTests" :key="t.id" :value="t.id">{{ t.name }}</option>
                </select>
              <input v-model="resultForm.status" placeholder="Status" class="input w-28" />
              <button @click="submitResult" class="btn-primary" :disabled="submitting">Add Result</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-200 text-sm">
              <thead class="bg-gray-50">
                <tr>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Batch</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Test</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Status</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Result</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Tester</th>
                  <th class="px-3 py-2 text-left font-medium text-gray-500">Tested At</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-200">
                <tr v-for="qr in store.qcResults" :key="qr.id">
                  <td class="px-3 py-2">{{ qr.batch_number }}</td>
                  <td class="px-3 py-2">{{ qr.test_name }}</td>
                  <td class="px-3 py-2">{{ qr.status }}</td>
                  <td class="px-3 py-2">{{ qr.result || '-' }}</td>
                  <td class="px-3 py-2">{{ qr.tester_name || '-' }}</td>
                  <td class="px-3 py-2">{{ qr.tested_at ? formatDate(qr.tested_at) : '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useQualityStore } from '../stores/quality';
import { useProductStore } from '../stores/products';

const store = useQualityStore();
const productStore = useProductStore();
const formatDate = (value: string) => new Date(value).toLocaleDateString();

const batchForm = ref({ product_id: undefined as number | undefined, mfg_date: '' });
const testForm = ref({ name: '' });
const resultForm = ref({ batch_id: undefined as number | undefined, test_id: undefined as number | undefined, status: 'pending' });
const successMsg = ref('');
const errorMsg = ref('');
const products = computed(() => productStore.products || []);
const submitting = ref(false);

onMounted(async () => {
  await Promise.all([store.fetchBatches(), store.fetchQcTests(), store.fetchQcResults(), productStore.fetchProducts()]);
});

const submitBatch = async () => {
  if (!batchForm.value.product_id) {
    errorMsg.value = 'Product ID wajib diisi';
    return;
  }
  errorMsg.value = '';
  submitting.value = true;
  try {
    await store.createBatch({ product_id: batchForm.value.product_id, mfg_date: batchForm.value.mfg_date || undefined });
    batchForm.value = { product_id: undefined, mfg_date: '' };
    successMsg.value = 'Batch dibuat';
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error || 'Gagal membuat batch';
  } finally {
    submitting.value = false;
  }
};

const submitTest = async () => {
  if (!testForm.value.name) {
    errorMsg.value = 'Nama test wajib diisi';
    return;
  }
  errorMsg.value = '';
  submitting.value = true;
  try {
    await store.createQcTest({ name: testForm.value.name });
    testForm.value = { name: '' };
    successMsg.value = 'QC test dibuat';
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error || 'Gagal membuat QC test';
  } finally {
    submitting.value = false;
  }
};

const submitResult = async () => {
  if (!resultForm.value.batch_id || !resultForm.value.test_id) {
    errorMsg.value = 'Batch ID dan Test ID wajib diisi';
    return;
  }
  errorMsg.value = '';
  submitting.value = true;
  try {
    await store.createQcResult({
      batch_id: resultForm.value.batch_id,
      test_id: resultForm.value.test_id,
      status: resultForm.value.status,
    });
    resultForm.value = { batch_id: undefined, test_id: undefined, status: 'pending' };
    successMsg.value = 'QC result dibuat';
  } catch (err: any) {
    errorMsg.value = err?.response?.data?.error || 'Gagal membuat QC result';
  } finally {
    submitting.value = false;
  }
};
</script>

<style scoped>
.input {
  @apply border border-gray-300 rounded px-2 py-1 text-sm;
}
.btn-primary {
  @apply bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700;
}
</style>
