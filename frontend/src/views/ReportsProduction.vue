<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Production Reports</h1>

    <!-- Date filter -->
    <div class="flex gap-3 mb-6 bg-white p-4 rounded shadow">
      <input type="date" v-model="fromDate" class="border rounded px-3 py-2 text-sm" />
      <input type="date" v-model="toDate" class="border rounded px-3 py-2 text-sm" />
      <button @click="load" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Apply</button>
    </div>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold">{{ data.summary?.total_wo || 0 }}</p>
          <p class="text-xs text-gray-500">Total Work Orders</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-green-600">{{ data.summary?.completed || 0 }}</p>
          <p class="text-xs text-gray-500">Completed</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-blue-600">{{ data.summary?.in_progress || 0 }}</p>
          <p class="text-xs text-gray-500">In Progress</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ data.summary?.pending || 0 }}</p>
          <p class="text-xs text-gray-500">Pending</p>
        </div>
      </div>

      <!-- Output summary -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4">
          <h3 class="font-semibold mb-1">Planned Quantity</h3>
          <p class="text-2xl font-bold">{{ fmt(data.summary?.total_planned_qty) }}</p>
        </div>
        <div class="bg-white rounded shadow p-4">
          <h3 class="font-semibold mb-1">Completed Quantity</h3>
          <p class="text-2xl font-bold text-green-600">{{ fmt(data.summary?.total_completed_qty) }}</p>
        </div>
      </div>

      <!-- By Product -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Output by Product</h3>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b"><tr>
            <th class="px-4 py-2 text-left">Product</th>
            <th class="px-4 py-2 text-right">WO Count</th>
            <th class="px-4 py-2 text-right">Planned</th>
            <th class="px-4 py-2 text-right">Completed</th>
            <th class="px-4 py-2 text-right">Completion %</th>
          </tr></thead>
          <tbody>
            <tr v-for="p in data.byProduct" :key="p.product_name" class="border-b">
              <td class="px-4 py-2">{{ p.product_name }}</td>
              <td class="px-4 py-2 text-right">{{ p.wo_count }}</td>
              <td class="px-4 py-2 text-right">{{ fmt(p.planned_qty) }}</td>
              <td class="px-4 py-2 text-right">{{ fmt(p.completed_qty) }}</td>
              <td class="px-4 py-2 text-right">{{ p.planned_qty > 0 ? ((p.completed_qty / p.planned_qty) * 100).toFixed(1) : 0 }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Monthly Trend -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Monthly Trend</h3>
        <div class="space-y-2">
          <div v-for="m in data.monthly" :key="m.month" class="flex items-center gap-3">
            <span class="w-20 text-sm text-gray-600">{{ m.month }}</span>
            <div class="flex-1 bg-gray-100 rounded h-6 relative">
              <div class="bg-blue-500 h-6 rounded" :style="{ width: barWidth(m.completed, m.total) }"></div>
            </div>
            <span class="text-xs w-20 text-right">{{ m.completed }}/{{ m.total }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useReportsStore } from '../stores/reports';

const store = useReportsStore();
const fromDate = ref('');
const toDate = ref('');
const data = computed(() => store.production);

const load = () => {
  const params: Record<string, any> = {};
  if (fromDate.value) params.from_date = fromDate.value;
  if (toDate.value) params.to_date = toDate.value;
  store.fetchProductionReport(params);
};

const fmt = (v: any) => Number(v || 0).toLocaleString();
const barWidth = (val: number, total: number) => total > 0 ? `${(val / total) * 100}%` : '0%';

onMounted(load);
</script>
