<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Production Planning</h2>
          <p class="text-sm text-gray-500 mt-1">Schedule and plan manufacturing work orders</p>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded-lg shadow p-4">
          <p class="text-xs text-gray-500 uppercase">Total WO</p>
          <p class="text-2xl font-bold text-gray-900">{{ summary?.capacity?.total_wo || 0 }}</p>
        </div>
        <div class="bg-blue-50 rounded-lg shadow p-4">
          <p class="text-xs text-blue-600 uppercase">Active</p>
          <p class="text-2xl font-bold text-blue-700">{{ summary?.capacity?.active_wo || 0 }}</p>
        </div>
        <div class="bg-green-50 rounded-lg shadow p-4">
          <p class="text-xs text-green-600 uppercase">Completed Qty</p>
          <p class="text-2xl font-bold text-green-700">{{ summary?.capacity?.completed_qty || 0 }}</p>
        </div>
        <div class="bg-yellow-50 rounded-lg shadow p-4">
          <p class="text-xs text-yellow-600 uppercase">Pending Qty</p>
          <p class="text-2xl font-bold text-yellow-700">{{ summary?.capacity?.pending_qty || 0 }}</p>
        </div>
      </div>

      <!-- Status Summary -->
      <div v-if="summary?.summary?.length" class="bg-white rounded-lg shadow p-4 mb-6">
        <h3 class="text-sm font-semibold text-gray-700 mb-3">Status Breakdown</h3>
        <div class="flex flex-wrap gap-3">
          <span v-for="s in summary.summary" :key="s.status"
            :class="statusBadge(s.status)"
            class="px-3 py-1 rounded-full text-xs font-semibold">
            {{ s.status }}: {{ s.count }} ({{ s.total_qty }} units)
          </span>
        </div>
      </div>

      <div v-if="store.loading" class="text-center py-10">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <!-- Work Orders Table -->
      <div v-else class="bg-white shadow rounded-lg overflow-hidden">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">WO#</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scheduled Start</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scheduled End</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created By</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="wo in store.planningOrders" :key="wo.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ wo.wo_number || 'WO-' + wo.id }}</td>
              <td class="px-4 py-3 text-sm text-gray-900">{{ wo.product_name }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ wo.quantity }}</td>
              <td class="px-4 py-3">
                <span :class="statusBadge(wo.status)" class="px-2 py-1 rounded-full text-xs font-semibold">{{ wo.status }}</span>
              </td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ formatDate(wo.scheduled_start) }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ formatDate(wo.scheduled_end) }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ wo.created_by_name || '-' }}</td>
            </tr>
            <tr v-if="!store.planningOrders.length">
              <td colspan="7" class="text-center py-8 text-gray-400">No work orders found</td>
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
const summary = ref<any>(null);

onMounted(async () => {
  await Promise.all([
    store.fetchPlanning(),
    store.fetchPlanningSummary(),
  ]);
  summary.value = store.planningSummary;
});

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '-';

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    planned: 'bg-indigo-100 text-indigo-800',
    in_progress: 'bg-blue-100 text-blue-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    on_hold: 'bg-gray-100 text-gray-800',
  };
  return map[status] || 'bg-gray-100 text-gray-800';
};
</script>
