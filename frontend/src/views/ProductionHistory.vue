<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Production History</h2>
          <p class="text-sm text-gray-500 mt-1">Complete record of all work orders and production output</p>
        </div>
      </div>

      <!-- Stats Cards -->
      <div v-if="store.historyStats" class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-xs text-gray-500 uppercase">Total WO</p>
          <p class="text-xl font-bold">{{ store.historyStats.total_wo }}</p>
        </div>
        <div class="bg-green-50 rounded-lg shadow p-4">
          <p class="text-xs text-green-600 uppercase">Completed</p>
          <p class="text-xl font-bold text-green-700">{{ store.historyStats.completed }}</p>
        </div>
        <div class="bg-blue-50 rounded-lg shadow p-4">
          <p class="text-xs text-blue-600 uppercase">In Progress</p>
          <p class="text-xl font-bold text-blue-700">{{ store.historyStats.in_progress }}</p>
        </div>
        <div class="bg-yellow-50 rounded-lg shadow p-4">
          <p class="text-xs text-yellow-600 uppercase">Pending</p>
          <p class="text-xl font-bold text-yellow-700">{{ store.historyStats.pending }}</p>
        </div>
        <div class="bg-purple-50 rounded-lg shadow p-4">
          <p class="text-xs text-purple-600 uppercase">Avg Hours</p>
          <p class="text-xl font-bold text-purple-700">{{ store.historyStats.avg_hours ? Number(store.historyStats.avg_hours).toFixed(1) : '-' }}</p>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-lg shadow p-4 mb-6">
        <div class="flex flex-wrap gap-3 items-end">
          <div>
            <label class="block text-xs text-gray-500 mb-1">Search</label>
            <input v-model="filters.search" placeholder="WO# or product" class="px-3 py-2 border rounded text-sm w-48" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">Status</label>
            <select v-model="filters.status" class="px-3 py-2 border rounded text-sm">
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">From</label>
            <input v-model="filters.from_date" type="date" class="px-3 py-2 border rounded text-sm" />
          </div>
          <div>
            <label class="block text-xs text-gray-500 mb-1">To</label>
            <input v-model="filters.to_date" type="date" class="px-3 py-2 border rounded text-sm" />
          </div>
          <button @click="applyFilters" class="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
            Filter
          </button>
          <button @click="clearFilters" class="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300">
            Clear
          </button>
        </div>
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
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Output</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Loss %</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">End</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="wo in store.historyOrders" :key="wo.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ wo.wo_number || 'WO-' + wo.id }}</td>
              <td class="px-4 py-3 text-sm text-gray-900">{{ wo.product_name }}</td>
              <td class="px-4 py-3 text-sm text-right text-gray-600">{{ wo.quantity }}</td>
              <td class="px-4 py-3">
                <span :class="statusBadge(wo.status)" class="px-2 py-1 rounded-full text-xs font-semibold">{{ wo.status }}</span>
              </td>
              <td class="px-4 py-3 text-sm text-right text-green-600 font-medium">{{ wo.output_quantity ?? '-' }}</td>
              <td class="px-4 py-3 text-sm text-right">
                <span v-if="wo.loss_percentage != null" :class="Number(wo.loss_percentage) > 10 ? 'text-red-600' : 'text-gray-600'">
                  {{ Number(wo.loss_percentage).toFixed(1) }}%
                </span>
                <span v-else class="text-gray-400">-</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(wo.actual_start || wo.scheduled_start) }}</td>
              <td class="px-4 py-3 text-sm text-gray-500">{{ formatDate(wo.actual_end || wo.scheduled_end) }}</td>
              <td class="px-4 py-3 text-sm text-gray-400">{{ formatDate(wo.created_at) }}</td>
            </tr>
            <tr v-if="!store.historyOrders.length">
              <td colspan="9" class="text-center py-8 text-gray-400">No production history records</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useProductionStore } from '../stores/production';

const store = useProductionStore();
const filters = ref({ search: '', status: '', from_date: '', to_date: '' });

onMounted(async () => {
  await Promise.all([store.fetchHistory(), store.fetchHistoryStats()]);
});

const applyFilters = () => {
  const f: any = {};
  if (filters.value.search) f.search = filters.value.search;
  if (filters.value.status) f.status = filters.value.status;
  if (filters.value.from_date) f.from_date = filters.value.from_date;
  if (filters.value.to_date) f.to_date = filters.value.to_date;
  store.fetchHistory(f);
};

const clearFilters = () => {
  filters.value = { search: '', status: '', from_date: '', to_date: '' };
  store.fetchHistory();
};

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '-';

const statusBadge = (s: string) => ({
  pending: 'bg-yellow-100 text-yellow-800',
  planned: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-blue-100 text-blue-800',
  'in-progress': 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800',
  on_hold: 'bg-gray-100 text-gray-800',
}[s] || 'bg-gray-100 text-gray-800');
</script>
