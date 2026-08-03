<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Margin Analysis</h2>
        <p class="text-sm text-gray-500 mt-1">Gross margin by product and period — profitability ranking</p>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else>
        <!-- Summary KPIs -->
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-gray-500 uppercase">Total Revenue</p>
            <p class="text-2xl font-bold">{{ fmt(totals.revenue) }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-gray-500 uppercase">Total COGS</p>
            <p class="text-2xl font-bold text-red-600">{{ fmt(totals.cogs) }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-green-600 uppercase">Gross Profit</p>
            <p class="text-2xl font-bold text-green-700">{{ fmt(totals.profit) }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-blue-600 uppercase">Avg Margin</p>
            <p class="text-2xl font-bold text-blue-700">{{ avgMargin }}%</p>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <!-- Top Products -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 uppercase mb-4">Top Products by Profit</h3>
            <div v-if="store.marginSummary.topProducts.length" class="space-y-3">
              <div v-for="(p, i) in store.marginSummary.topProducts" :key="i" class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-xs bg-blue-100 text-blue-700 rounded-full w-6 h-6 flex items-center justify-center font-bold">{{ i + 1 }}</span>
                  <span class="text-sm text-gray-900">{{ p.product_name }}</span>
                </div>
                <div class="flex items-center gap-4">
                  <span class="text-sm font-mono text-green-600">{{ fmt(p.gross_profit) }}</span>
                  <span :class="p.avg_margin_pct >= 20 ? 'text-green-600' : p.avg_margin_pct >= 10 ? 'text-yellow-600' : 'text-red-600'" class="text-xs font-medium w-12 text-right">
                    {{ p.avg_margin_pct }}%
                  </span>
                </div>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 text-center py-4">No data</p>
          </div>

          <!-- Period Trend -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 uppercase mb-4">Monthly Margin Trend</h3>
            <div v-if="store.marginSummary.periods.length" class="space-y-2">
              <div v-for="p in store.marginSummary.periods" :key="p.period" class="flex items-center justify-between">
                <span class="text-sm text-gray-600 w-20">{{ p.period }}</span>
                <div class="flex-1 mx-3 bg-gray-200 rounded-full h-3 relative">
                  <div class="bg-green-500 h-3 rounded-full" :style="{ width: (p.avg_margin_pct || 0) + '%' }"></div>
                </div>
                <span class="text-sm font-mono w-20 text-right">{{ fmt(p.gross_profit) }}</span>
                <span class="text-xs font-medium w-12 text-right" :class="p.avg_margin_pct >= 20 ? 'text-green-600' : 'text-yellow-600'">{{ p.avg_margin_pct }}%</span>
              </div>
            </div>
            <p v-else class="text-sm text-gray-400 text-center py-4">No trend data</p>
          </div>
        </div>

        <!-- Detail Table -->
        <div class="bg-white shadow rounded-lg overflow-x-auto">
          <div class="px-4 py-3 border-b"><h3 class="text-sm font-bold text-gray-700 uppercase">Product Margin Detail</h3></div>
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">COGS</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross Profit</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Margin %</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="m in store.margins" :key="m.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm text-gray-900">{{ m.product_name }} <span class="text-xs text-gray-400">({{ m.sku }})</span></td>
                <td class="px-4 py-3 text-sm text-gray-600">{{ m.period }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(m.total_revenue) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-red-600">{{ fmt(m.total_cogs) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-green-600 font-medium">{{ fmt(m.gross_profit) }}</td>
                <td class="px-4 py-3 text-center">
                  <span :class="m.gross_margin_pct >= 30 ? 'bg-green-100 text-green-800' : m.gross_margin_pct >= 15 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'"
                    class="px-2 py-1 rounded-full text-xs font-medium">{{ m.gross_margin_pct }}%</span>
                </td>
              </tr>
              <tr v-if="!store.margins.length"><td colspan="6" class="text-center py-8 text-gray-400">No profitability data</td></tr>
            </tbody>
          </table>
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

const totals = computed(() => ({
  revenue: store.margins.reduce((s, m) => s + Number(m.total_revenue || 0), 0),
  cogs: store.margins.reduce((s, m) => s + Number(m.total_cogs || 0), 0),
  profit: store.margins.reduce((s, m) => s + Number(m.gross_profit || 0), 0),
}));

const avgMargin = computed(() => {
  if (!store.margins.length) return 0;
  return Math.round(store.margins.reduce((s, m) => s + Number(m.gross_margin_pct || 0), 0) / store.margins.length);
});

onMounted(async () => {
  await Promise.all([store.fetchMargins(), store.fetchMarginSummary()]);
});
</script>
