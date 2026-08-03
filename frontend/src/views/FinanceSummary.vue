<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Financial Summary</h2>
        <p class="text-sm text-gray-500 mt-1">P&amp;L overview — Revenue vs COGS vs Operating Expenses</p>
      </div>

      <div v-if="loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else>
        <!-- Main KPIs -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Total Revenue</p>
            <p class="text-2xl font-bold mt-1">{{ fmt(totals.revenue) }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-red-600 uppercase tracking-wide">Total COGS</p>
            <p class="text-2xl font-bold mt-1 text-red-600">{{ fmt(totals.cogs) }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-green-600 uppercase tracking-wide">Gross Profit</p>
            <p class="text-2xl font-bold mt-1 text-green-700">{{ fmt(totals.grossProfit) }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-blue-600 uppercase tracking-wide">Net Profit</p>
            <p class="text-2xl font-bold mt-1 text-blue-700">{{ fmt(totals.netProfit) }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-purple-600 uppercase tracking-wide">Margin</p>
            <p class="text-2xl font-bold mt-1 text-purple-700">{{ totals.margin }}%</p>
          </div>
        </div>

        <!-- Supplementary stats -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <!-- AP Summary -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 uppercase mb-3">Accounts Payable</h3>
            <div class="space-y-2">
              <div class="flex justify-between"><span class="text-sm text-gray-600">Total Payable</span><span class="text-sm font-mono font-medium">{{ fmt(ap.total) }}</span></div>
              <div class="flex justify-between"><span class="text-sm text-green-600">Paid</span><span class="text-sm font-mono text-green-700">{{ fmt(ap.paid) }}</span></div>
              <div class="flex justify-between"><span class="text-sm text-red-600">Outstanding</span><span class="text-sm font-mono text-red-700 font-medium">{{ fmt(ap.total - ap.paid) }}</span></div>
            </div>
          </div>

          <!-- AR Summary -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 uppercase mb-3">Accounts Receivable</h3>
            <div class="space-y-2">
              <div class="flex justify-between"><span class="text-sm text-gray-600">Total Receivable</span><span class="text-sm font-mono font-medium">{{ fmt(ar.total) }}</span></div>
              <div class="flex justify-between"><span class="text-sm text-green-600">Received</span><span class="text-sm font-mono text-green-700">{{ fmt(ar.paid) }}</span></div>
              <div class="flex justify-between"><span class="text-sm text-red-600">Outstanding</span><span class="text-sm font-mono text-red-700 font-medium">{{ fmt(ar.total - ar.paid) }}</span></div>
            </div>
          </div>

          <!-- COGS Breakdown -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 uppercase mb-3">COGS Breakdown</h3>
            <div class="space-y-2">
              <div class="flex justify-between"><span class="text-sm text-blue-600">Material</span><span class="text-sm font-mono">{{ fmt(cogsBreak.material) }}</span></div>
              <div class="flex justify-between"><span class="text-sm text-green-600">Labor</span><span class="text-sm font-mono">{{ fmt(cogsBreak.labor) }}</span></div>
              <div class="flex justify-between"><span class="text-sm text-purple-600">Overhead</span><span class="text-sm font-mono">{{ fmt(cogsBreak.overhead) }}</span></div>
              <div class="border-t pt-2 flex justify-between font-medium"><span class="text-sm text-gray-900">Total</span><span class="text-sm font-mono">{{ fmt(cogsBreak.total) }}</span></div>
            </div>
          </div>
        </div>

        <!-- Period table -->
        <div class="bg-white shadow rounded-lg overflow-x-auto">
          <div class="px-4 py-3 border-b"><h3 class="text-sm font-bold text-gray-700 uppercase">Period Summary</h3></div>
          <table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">COGS</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Gross Profit</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Expenses</th>
                <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Profit</th>
                <th class="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Margin %</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              <tr v-for="s in store.financialSummary" :key="s.id" class="hover:bg-gray-50">
                <td class="px-4 py-3 text-sm font-medium text-gray-900">{{ s.period_date }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono">{{ fmt(s.total_revenue) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-red-600">{{ fmt(s.total_cogs) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-green-600">{{ fmt(s.gross_profit) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono text-gray-500">{{ fmt(s.total_expenses) }}</td>
                <td class="px-4 py-3 text-sm text-right font-mono font-medium" :class="s.net_profit >= 0 ? 'text-green-700' : 'text-red-700'">{{ fmt(s.net_profit) }}</td>
                <td class="px-4 py-3 text-center">
                  <span :class="s.profit_margin_pct >= 20 ? 'bg-green-100 text-green-800' : s.profit_margin_pct >= 10 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'"
                    class="px-2 py-1 rounded-full text-xs font-medium">{{ s.profit_margin_pct }}%</span>
                </td>
              </tr>
              <tr v-if="!store.financialSummary.length"><td colspan="7" class="text-center py-8 text-gray-400">No financial summary data</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useFinanceStore } from '../stores/finance';

const store = useFinanceStore();
const loading = ref(true);

const fmt = (v: number) => v ? Number(v).toLocaleString('id-ID') : '0';

const totals = computed(() => {
  const rev = store.financialSummary.reduce((s, f) => s + Number(f.total_revenue || 0), 0);
  const cogs = store.financialSummary.reduce((s, f) => s + Number(f.total_cogs || 0), 0);
  const gp = rev - cogs;
  const np = store.financialSummary.reduce((s, f) => s + Number(f.net_profit || 0), 0);
  return { revenue: rev, cogs, grossProfit: gp, netProfit: np, margin: rev ? Math.round((gp / rev) * 100) : 0 };
});

const ap = computed(() => ({
  total: store.ap.reduce((s, a) => s + Number(a.amount || 0), 0),
  paid: store.ap.reduce((s, a) => s + Number(a.paid_amount || 0), 0),
}));

const ar = computed(() => ({
  total: store.ar.reduce((s, a) => s + Number(a.amount || 0), 0),
  paid: store.ar.reduce((s, a) => s + Number(a.paid_amount || 0), 0),
}));

const cogsBreak = computed(() => ({
  material: store.cogs.reduce((s, c) => s + Number(c.raw_material_cost || 0), 0),
  labor: store.cogs.reduce((s, c) => s + Number(c.labor_cost || 0), 0),
  overhead: store.cogs.reduce((s, c) => s + Number(c.overhead_cost || 0), 0),
  total: store.cogs.reduce((s, c) => s + Number(c.total_cost || 0), 0),
}));

onMounted(async () => {
  await Promise.all([
    store.fetchFinancialSummary(),
    store.fetchAP(),
    store.fetchAR(),
    store.fetchCOGS(),
  ]);
  loading.value = false;
});
</script>
