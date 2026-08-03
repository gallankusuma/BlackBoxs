<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Production KPI Dashboard</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- Main KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded shadow p-5 text-center">
          <p class="text-3xl font-bold">{{ data.summary?.total_wo || 0 }}</p>
          <p class="text-sm text-gray-500">Total Work Orders</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-green-500">
          <p class="text-3xl font-bold text-green-600">{{ data.summary?.completed || 0 }}</p>
          <p class="text-sm text-gray-500">Completed</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-blue-500">
          <p class="text-3xl font-bold text-blue-600">{{ data.summary?.in_progress || 0 }}</p>
          <p class="text-sm text-gray-500">In Progress</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-yellow-500">
          <p class="text-3xl font-bold text-yellow-600">{{ completionRate }}%</p>
          <p class="text-sm text-gray-500">Completion Rate</p>
        </div>
      </div>

      <!-- Output Metrics -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="bg-white rounded shadow p-5">
          <h3 class="font-semibold text-gray-600 text-sm mb-2">Planned vs Completed Output</h3>
          <div class="flex items-end gap-6">
            <div>
              <p class="text-2xl font-bold">{{ fmt(data.summary?.total_planned_qty) }}</p>
              <p class="text-xs text-gray-400">Planned</p>
            </div>
            <div>
              <p class="text-2xl font-bold text-green-600">{{ fmt(data.summary?.total_completed_qty) }}</p>
              <p class="text-xs text-gray-400">Completed</p>
            </div>
          </div>
          <div class="mt-3 bg-gray-100 rounded-full h-3">
            <div class="bg-green-500 h-3 rounded-full" :style="{ width: outputRate + '%' }"></div>
          </div>
        </div>
        <div class="bg-white rounded shadow p-5">
          <h3 class="font-semibold text-gray-600 text-sm mb-2">WO Status Distribution</h3>
          <div class="space-y-2 mt-3">
            <div class="flex items-center justify-between">
              <span class="text-sm">Pending</span>
              <div class="flex items-center gap-2">
                <div class="w-32 bg-gray-100 rounded-full h-2"><div class="bg-yellow-500 h-2 rounded-full" :style="{ width: pct(data.summary?.pending) }"></div></div>
                <span class="text-sm font-medium w-8 text-right">{{ data.summary?.pending || 0 }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm">In Progress</span>
              <div class="flex items-center gap-2">
                <div class="w-32 bg-gray-100 rounded-full h-2"><div class="bg-blue-500 h-2 rounded-full" :style="{ width: pct(data.summary?.in_progress) }"></div></div>
                <span class="text-sm font-medium w-8 text-right">{{ data.summary?.in_progress || 0 }}</span>
              </div>
            </div>
            <div class="flex items-center justify-between">
              <span class="text-sm">Completed</span>
              <div class="flex items-center gap-2">
                <div class="w-32 bg-gray-100 rounded-full h-2"><div class="bg-green-500 h-2 rounded-full" :style="{ width: pct(data.summary?.completed) }"></div></div>
                <span class="text-sm font-medium w-8 text-right">{{ data.summary?.completed || 0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Top Products -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Top Products by Output</h3>
        <div class="space-y-2">
          <div v-for="p in (data.byProduct || []).slice(0, 8)" :key="p.product_name" class="flex items-center gap-3">
            <span class="w-40 text-sm truncate">{{ p.product_name }}</span>
            <div class="flex-1 bg-gray-100 rounded h-5">
              <div class="bg-blue-500 h-5 rounded" :style="{ width: productBar(p.completed_qty) }"></div>
            </div>
            <span class="text-xs w-24 text-right">{{ fmt(p.completed_qty) }}/{{ fmt(p.planned_qty) }}</span>
          </div>
        </div>
      </div>

      <!-- Monthly Trend -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Monthly Trend</h3>
        <div class="space-y-2">
          <div v-for="m in data.monthly" :key="m.month" class="flex items-center gap-3">
            <span class="w-20 text-sm text-gray-600">{{ m.month }}</span>
            <div class="flex-1 bg-gray-100 rounded h-5 relative overflow-hidden">
              <div class="bg-blue-200 h-5 absolute" :style="{ width: monthBar(m.total) }"></div>
              <div class="bg-green-500 h-5 absolute" :style="{ width: monthBar(m.completed) }"></div>
            </div>
            <span class="text-xs w-20 text-right">{{ m.completed }}/{{ m.total }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useDashboardStore } from '../stores/dashboard';

const store = useDashboardStore();
const data = computed(() => store.production);

const total = computed(() => Number(data.value?.summary?.total_wo || 0));
const completionRate = computed(() => total.value > 0 ? ((data.value?.summary?.completed || 0) / total.value * 100).toFixed(1) : '0');
const outputRate = computed(() => {
  const p = Number(data.value?.summary?.total_planned_qty || 0);
  return p > 0 ? ((data.value?.summary?.total_completed_qty || 0) / p * 100).toFixed(1) : '0';
});

const fmt = (v: any) => Number(v || 0).toLocaleString();
const pct = (v: any) => total.value > 0 ? `${(Number(v || 0) / total.value) * 100}%` : '0%';
const maxProduct = computed(() => Math.max(...(data.value?.byProduct || []).map((p: any) => Number(p.planned_qty || 0)), 1));
const productBar = (qty: number) => `${(qty / maxProduct.value) * 100}%`;
const maxMonth = computed(() => Math.max(...(data.value?.monthly || []).map((m: any) => Number(m.total || 0)), 1));
const monthBar = (val: number) => `${(val / maxMonth.value) * 100}%`;

onMounted(() => store.fetchProductionKPI());
</script>
