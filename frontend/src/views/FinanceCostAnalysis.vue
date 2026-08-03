<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Cost Analysis</h2>
        <p class="text-sm text-gray-500 mt-1">Compare costs across products — material, labor, overhead breakdown and trends</p>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else>
        <!-- Top Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-gray-500 uppercase">Products Analyzed</p>
            <p class="text-3xl font-bold">{{ store.costAnalysis.length }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-gray-500 uppercase">Total Batches</p>
            <p class="text-3xl font-bold">{{ totalBatches }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-gray-500 uppercase">Total Production Cost</p>
            <p class="text-3xl font-bold">{{ fmt(totalCost) }}</p>
          </div>
        </div>

        <!-- Cost per Product Table -->
        <div class="bg-white shadow rounded-lg overflow-x-auto mb-6">
          <div class="px-4 py-3 border-b"><h3 class="text-sm font-bold text-gray-700 uppercase">Cost Breakdown by Product</h3></div>
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Batches</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Material</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Labor</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Overhead</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Total</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg/Unit</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Min/Unit</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Max/Unit</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Variance</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="c in store.costAnalysis" :key="c.product_id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900">{{ c.product_name }} <span class="text-xs text-gray-400">({{ c.sku }})</span></td>
                <td class="px-4 py-3 text-sm text-right">{{ c.batch_count }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-blue-600">{{ fmt(c.avg_material_cost) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-green-600">{{ fmt(c.avg_labor_cost) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-purple-600">{{ fmt(c.avg_overhead_cost) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono font-medium">{{ fmt(c.avg_total_cost) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(c.avg_cost_per_unit) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-green-600">{{ fmt(c.min_cost_per_unit) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-red-600">{{ fmt(c.max_cost_per_unit) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono" :class="variance(c) > 20 ? 'text-red-600 font-medium' : 'text-gray-500'">
                  {{ variance(c) }}%
                </td>
              </tr>
              <tr v-if="!store.costAnalysis.length"><td colspan="10" class="text-center py-8 text-gray-400">No cost data — record COGS to see analysis</td></tr>
            </tbody>
          </table>
        </div>

        <!-- Cost Trend -->
        <div class="bg-white shadow rounded-lg p-5">
          <h3 class="text-sm font-bold text-gray-700 uppercase mb-4">Monthly Cost Trend</h3>
          <div v-if="store.costTrends.length" class="space-y-2">
            <div v-for="t in store.costTrends" :key="t.period" class="flex items-center justify-between">
              <span class="text-sm text-gray-600 w-24">{{ t.period }}</span>
              <div class="flex-1 mx-4 bg-gray-200 rounded-full h-4">
                <div class="bg-blue-500 h-4 rounded-full" :style="{ width: trendBar(t.total_cost) }"></div>
              </div>
              <span class="text-sm font-mono w-28 text-right">{{ fmt(t.total_cost) }}</span>
              <span class="text-xs text-gray-400 w-20 text-right">{{ t.batch_count }} batch</span>
            </div>
          </div>
          <p v-else class="text-sm text-gray-400 text-center py-4">No trend data available</p>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useFinanceStore } from '../stores/finance';

const store = useFinanceStore();

const fmt = (v: number) => v ? Number(v).toLocaleString('id-ID') : '0';

const totalBatches = computed(() => store.costAnalysis.reduce((s, c) => s + Number(c.batch_count || 0), 0));
const totalCost = computed(() => store.costAnalysis.reduce((s, c) => s + Number(c.total_cost_sum || 0), 0));

const variance = (c: any) => {
  if (!c.avg_cost_per_unit) return 0;
  return Math.round(((c.max_cost_per_unit - c.min_cost_per_unit) / c.avg_cost_per_unit) * 100);
};

const maxTrendCost = computed(() => Math.max(...store.costTrends.map(t => Number(t.total_cost) || 0), 1));
const trendBar = (cost: number) => Math.round((Number(cost) / maxTrendCost.value) * 100) + '%';

onMounted(async () => {
  await Promise.all([store.fetchCostAnalysis(), store.fetchCostTrends()]);
});
</script>
