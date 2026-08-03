<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">QC Results</h2>
          <p class="text-sm text-gray-500 mt-1">View and record quality control test results</p>
        </div>
        <button @click="showRecord = true" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">+ Record Result</button>
      </div>

      <!-- Filters -->
      <div class="bg-white shadow rounded-lg p-4 mb-4 flex flex-wrap gap-4 items-end">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Status</label>
          <select v-model="filters.status" @change="load" class="px-3 py-2 border rounded-md text-sm w-36">
            <option value="">All</option>
            <option value="pass">Pass</option>
            <option value="fail">Fail</option>
            <option value="pending">Pending</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">Search</label>
          <input v-model="search" placeholder="Product or batch..." class="px-3 py-2 border rounded-md text-sm w-48" />
        </div>
      </div>

      <div v-if="loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Spec</th>
              <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Result</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tested By</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="r in filteredResults" :key="r.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm text-gray-900">{{ r.product_name }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ r.batch_number || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ r.test_name }}</td>
              <td class="px-4 py-3 text-sm text-right font-mono">{{ r.actual_value ?? '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ r.min_value }}–{{ r.max_value }} {{ r.unit }}</td>
              <td class="px-4 py-3 text-center">
                <span :class="resultBadge(r.result)" class="px-2 py-1 rounded-full text-xs font-medium">
                  {{ r.result }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ r.tested_by_name || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ formatDate(r.tested_at || r.created_at) }}</td>
            </tr>
            <tr v-if="!filteredResults.length"><td colspan="8" class="text-center py-8 text-gray-400">No results found</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Record Result Modal -->
      <div v-if="showRecord" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
          <h3 class="text-lg font-bold mb-4">Record Test Result</h3>
          <form @submit.prevent="submitResult" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700">Product</label>
                <select v-model.number="form.product_id" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                  <option value="">Select</option>
                  <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Batch Number</label>
                <input v-model="form.batch_number" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Test Name</label>
              <input v-model="form.test_name" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700">Actual Value</label>
                <input v-model.number="form.actual_value" type="number" step="any" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Min Spec</label>
                <input v-model.number="form.min_value" type="number" step="any" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700">Max Spec</label>
                <input v-model.number="form.max_value" type="number" step="any" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Result</label>
              <select v-model="form.result" class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                <option value="pass">Pass</option>
                <option value="fail">Fail</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Notes</label>
              <textarea v-model="form.notes" rows="2" class="mt-1 w-full px-3 py-2 border rounded-md text-sm"></textarea>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click="showRecord = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Save</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { api } from '../lib/api';

const loading = ref(true);
const results = ref<any[]>([]);
const products = ref<any[]>([]);
const showRecord = ref(false);
const search = ref('');
const filters = ref({ status: '' });
const form = ref({ product_id: '', batch_number: '', test_name: '', actual_value: null as number | null, min_value: null as number | null, max_value: null as number | null, result: 'pass', notes: '' });

const filteredResults = computed(() => {
  let list = results.value;
  if (filters.value.status) list = list.filter(r => r.result === filters.value.status);
  if (search.value) {
    const q = search.value.toLowerCase();
    list = list.filter(r => (r.product_name || '').toLowerCase().includes(q) || (r.batch_number || '').toLowerCase().includes(q));
  }
  return list;
});

const resultBadge = (r: string) => ({
  'bg-green-100 text-green-800': r === 'pass',
  'bg-red-100 text-red-800': r === 'fail',
  'bg-yellow-100 text-yellow-800': r === 'pending',
});

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

const load = async () => {
  loading.value = true;
  try {
    const res = await api.get('/quality/results', { params: filters.value });
    results.value = res.data.data || res.data || [];
  } catch { results.value = []; }
  loading.value = false;
};

onMounted(async () => {
  await load();
  try { products.value = (await api.get('/products')).data.data || []; } catch {}
});

const submitResult = async () => {
  try {
    await api.post('/quality/results', form.value);
    showRecord.value = false;
    form.value = { product_id: '', batch_number: '', test_name: '', actual_value: null, min_value: null, max_value: null, result: 'pass', notes: '' };
    await load();
  } catch (e: any) { alert(e.response?.data?.message || 'Failed to save result'); }
};
</script>
