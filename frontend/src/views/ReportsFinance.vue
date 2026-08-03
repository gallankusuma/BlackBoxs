<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Finance Reports</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- COGS Summary -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Cost of Goods Sold</h3>
        <div class="grid grid-cols-4 gap-4">
          <div class="text-center">
            <p class="text-xl font-bold">Rp {{ fmt(data.cogsSum?.total) }}</p>
            <p class="text-xs text-gray-500">Total COGS</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-blue-600">Rp {{ fmt(data.cogsSum?.material) }}</p>
            <p class="text-xs text-gray-500">Material</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-green-600">Rp {{ fmt(data.cogsSum?.labor) }}</p>
            <p class="text-xs text-gray-500">Labor</p>
          </div>
          <div class="text-center">
            <p class="text-xl font-bold text-purple-600">Rp {{ fmt(data.cogsSum?.overhead) }}</p>
            <p class="text-xs text-gray-500">Overhead</p>
          </div>
        </div>
      </div>

      <!-- AP/AR Summary -->
      <div class="grid grid-cols-2 gap-4 mb-6">
        <div class="bg-white rounded shadow p-5">
          <h3 class="font-semibold mb-3">Accounts Payable</h3>
          <div class="grid grid-cols-2 gap-3">
            <div class="text-center"><p class="text-lg font-bold">{{ data.apSummary?.total || 0 }}</p><p class="text-xs text-gray-500">Total Bills</p></div>
            <div class="text-center"><p class="text-lg font-bold">Rp {{ fmt(data.apSummary?.total_amount) }}</p><p class="text-xs text-gray-500">Total Amount</p></div>
            <div class="text-center"><p class="text-lg font-bold text-red-600">Rp {{ fmt(data.apSummary?.unpaid) }}</p><p class="text-xs text-gray-500">Unpaid</p></div>
            <div class="text-center"><p class="text-lg font-bold text-green-600">Rp {{ fmt(data.apSummary?.paid) }}</p><p class="text-xs text-gray-500">Paid</p></div>
          </div>
        </div>
        <div class="bg-white rounded shadow p-5">
          <h3 class="font-semibold mb-3">Accounts Receivable</h3>
          <div class="grid grid-cols-2 gap-3">
            <div class="text-center"><p class="text-lg font-bold">{{ data.arSummary?.total || 0 }}</p><p class="text-xs text-gray-500">Total Invoices</p></div>
            <div class="text-center"><p class="text-lg font-bold">Rp {{ fmt(data.arSummary?.total_amount) }}</p><p class="text-xs text-gray-500">Total Amount</p></div>
            <div class="text-center"><p class="text-lg font-bold text-orange-600">Rp {{ fmt(data.arSummary?.outstanding) }}</p><p class="text-xs text-gray-500">Outstanding</p></div>
            <div class="text-center"><p class="text-lg font-bold text-green-600">Rp {{ fmt(data.arSummary?.collected) }}</p><p class="text-xs text-gray-500">Collected</p></div>
          </div>
        </div>
      </div>

      <!-- Profitability -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Top Products by Margin</h3>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b"><tr>
            <th class="px-4 py-2 text-left">Product</th>
            <th class="px-4 py-2 text-right">Revenue</th>
            <th class="px-4 py-2 text-right">Total Cost</th>
            <th class="px-4 py-2 text-right">Margin %</th>
          </tr></thead>
          <tbody>
            <tr v-for="p in data.profitability" :key="p.product_name" class="border-b">
              <td class="px-4 py-2">{{ p.product_name || '-' }}</td>
              <td class="px-4 py-2 text-right">Rp {{ fmt(p.revenue) }}</td>
              <td class="px-4 py-2 text-right">Rp {{ fmt(p.total_cost) }}</td>
              <td class="px-4 py-2 text-right">
                <span :class="p.profit_margin >= 20 ? 'text-green-600' : p.profit_margin >= 10 ? 'text-yellow-600' : 'text-red-600'" class="font-medium">
                  {{ Number(p.profit_margin || 0).toFixed(1) }}%
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useReportsStore } from '../stores/reports';

const store = useReportsStore();
const data = computed(() => store.finance);
const fmt = (v: any) => Number(v || 0).toLocaleString();

onMounted(() => store.fetchFinanceReport());
</script>
