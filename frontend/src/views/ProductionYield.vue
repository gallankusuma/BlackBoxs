<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Yield & Scrap</h2>
          <p class="text-sm text-gray-500 mt-1">Record production output quantities and losses</p>
        </div>
        <button @click="showAddModal = true" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
          + Record Yield
        </button>
      </div>

      <div v-if="store.loading" class="text-center py-10">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">WO#</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Planned</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Output</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Loss</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Yield %</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">QC Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Completed</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="y in store.yieldResults" :key="y.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ y.wo_number }}</td>
              <td class="px-4 py-3 text-sm text-gray-900">{{ y.product_name }}</td>
              <td class="px-4 py-3 text-sm text-right text-gray-600">{{ y.planned_quantity }}</td>
              <td class="px-4 py-3 text-sm text-right text-green-600 font-semibold">{{ y.output_quantity }}</td>
              <td class="px-4 py-3 text-sm text-right text-red-600">{{ y.loss_quantity }}</td>
              <td class="px-4 py-3 text-sm text-right">
                <span :class="yieldColor(y)">{{ yieldPercent(y) }}%</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ y.batch_number || '-' }}</td>
              <td class="px-4 py-3">
                <span :class="qcBadge(y.qc_status)" class="px-2 py-1 text-xs rounded-full font-medium">
                  {{ y.qc_status }}
                </span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(y.completed_at) }}</td>
            </tr>
            <tr v-if="!store.yieldResults.length">
              <td colspan="9" class="text-center py-8 text-gray-400">No yield records</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Add Yield Modal -->
      <div v-if="showAddModal" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 class="text-lg font-bold mb-4">Record Production Yield</h3>
          <form @submit.prevent="submitYield" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700">Work Order ID</label>
              <input v-model.number="form.wo_id" type="number" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Output Quantity</label>
              <input v-model.number="form.output_quantity" type="number" step="0.01" required class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Loss Quantity</label>
              <input v-model.number="form.loss_quantity" type="number" step="0.01" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Batch Number</label>
              <input v-model="form.batch_number" type="text" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">QC Status</label>
              <select v-model="form.qc_status" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option value="pending">Pending</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700">Notes</label>
              <textarea v-model="form.notes" rows="2" class="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"></textarea>
            </div>
            <div class="flex justify-end gap-3">
              <button type="button" @click="showAddModal = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Save</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useProductionStore, type YieldResult } from '../stores/production';

const store = useProductionStore();
const showAddModal = ref(false);
const form = ref({ wo_id: 0, output_quantity: 0, loss_quantity: 0, batch_number: '', qc_status: 'pending', notes: '' });

onMounted(() => store.fetchYield());

const submitYield = async () => {
  try {
    await store.recordYield(form.value);
    showAddModal.value = false;
    form.value = { wo_id: 0, output_quantity: 0, loss_quantity: 0, batch_number: '', qc_status: 'pending', notes: '' };
    await store.fetchYield();
  } catch (e) { console.error(e); }
};

const yieldPercent = (y: YieldResult) => {
  const total = y.output_quantity + y.loss_quantity;
  return total > 0 ? ((y.output_quantity / total) * 100).toFixed(1) : '0.0';
};

const yieldColor = (y: YieldResult) => {
  const pct = parseFloat(yieldPercent(y));
  if (pct >= 95) return 'text-green-600 font-bold';
  if (pct >= 85) return 'text-yellow-600 font-semibold';
  return 'text-red-600 font-bold';
};

const qcBadge = (s: string) => ({
  pending: 'bg-yellow-100 text-yellow-800',
  passed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}[s] || 'bg-gray-100 text-gray-800');

const formatDate = (d: string | null) => d ? new Date(d).toLocaleString() : '-';
</script>
