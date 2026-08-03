<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">QC Sampling Plans</h2>
          <p class="text-sm text-gray-500 mt-1">Define sampling size, frequency, and AQL per product</p>
        </div>
        <button @click="showAdd = true" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">+ Add Plan</button>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Test</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sample Size</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Frequency</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">AQL Level</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Inspection</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="p in store.samplingPlans" :key="p.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm text-gray-900">{{ p.product_name }} <span class="text-xs text-gray-400">({{ p.sku }})</span></td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ p.test_name || 'All' }}</td>
              <td class="px-4 py-3 text-sm text-right font-medium">{{ p.sample_size }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ p.frequency }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ p.aql_level }}</td>
              <td class="px-4 py-3 text-sm">
                <span :class="p.inspection_level === 'tightened' ? 'text-red-600' : p.inspection_level === 'reduced' ? 'text-green-600' : 'text-gray-600'">
                  {{ p.inspection_level }}
                </span>
              </td>
              <td class="px-4 py-3 text-right">
                <button @click="deletePlan(p.id)" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
              </td>
            </tr>
            <tr v-if="!store.samplingPlans.length"><td colspan="7" class="text-center py-8 text-gray-400">No sampling plans configured</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Add Modal -->
      <div v-if="showAdd" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 class="text-lg font-bold mb-4">Add Sampling Plan</h3>
          <form @submit.prevent="createPlan" class="space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700">Product</label>
              <select v-model.number="form.product_id" required class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                <option value="">Select</option>
                <option v-for="p in products" :key="p.id" :value="p.id">{{ p.name }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Sample Size</label>
              <input v-model.number="form.sample_size" type="number" min="1" class="mt-1 w-full px-3 py-2 border rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Frequency</label>
              <select v-model="form.frequency" class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                <option value="per_batch">Per Batch</option>
                <option value="per_lot">Per Lot</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">AQL Level</label>
              <select v-model="form.aql_level" class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                <option value="0.65">0.65%</option>
                <option value="1.0">1.0%</option>
                <option value="1.5">1.5%</option>
                <option value="2.5">2.5%</option>
                <option value="4.0">4.0%</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Inspection Level</label>
              <select v-model="form.inspection_level" class="mt-1 w-full px-3 py-2 border rounded-md text-sm">
                <option value="normal">Normal</option>
                <option value="tightened">Tightened</option>
                <option value="reduced">Reduced</option>
              </select>
            </div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click="showAdd = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useQualityStore } from '../stores/quality';
import { api } from '../lib/api';

const store = useQualityStore();
const showAdd = ref(false);
const products = ref<any[]>([]);
const form = ref({ product_id: '', sample_size: 5, frequency: 'per_batch', aql_level: '1.0', inspection_level: 'normal' });

onMounted(async () => {
  await store.fetchSamplingPlans();
  try { products.value = (await api.get('/products')).data.data || (await api.get('/products')).data || []; } catch {}
});

const createPlan = async () => {
  await store.createSamplingPlan(form.value);
  showAdd.value = false;
  form.value = { product_id: '', sample_size: 5, frequency: 'per_batch', aql_level: '1.0', inspection_level: 'normal' };
};

const deletePlan = async (id: number) => {
  if (!confirm('Delete this sampling plan?')) return;
  await store.deleteSamplingPlan(id);
};
</script>
