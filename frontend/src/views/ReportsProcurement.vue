<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Procurement Reports</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold">{{ data.summary?.total_po || 0 }}</p>
          <p class="text-xs text-gray-500">Total POs</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-green-600">{{ data.summary?.approved || 0 }}</p>
          <p class="text-xs text-gray-500">Approved</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ data.summary?.pending || 0 }}</p>
          <p class="text-xs text-gray-500">Pending</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-blue-600">Rp {{ fmt(data.summary?.total_spend) }}</p>
          <p class="text-xs text-gray-500">Total Spend</p>
        </div>
      </div>

      <!-- PR Stats -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold">{{ data.prStats?.total_pr || 0 }}</p>
          <p class="text-xs text-gray-500">Total PRs</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-green-600">{{ data.prStats?.fully_approved || 0 }}</p>
          <p class="text-xs text-gray-500">Fully Approved PRs</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ data.prStats?.pending_approval || 0 }}</p>
          <p class="text-xs text-gray-500">Pending Approval</p>
        </div>
      </div>

      <!-- By Vendor -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Spend by Vendor</h3>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b"><tr>
            <th class="px-4 py-2 text-left">Vendor</th>
            <th class="px-4 py-2 text-right">PO Count</th>
            <th class="px-4 py-2 text-right">Total Spend</th>
            <th class="px-4 py-2 text-right">% of Total</th>
          </tr></thead>
          <tbody>
            <tr v-for="v in data.byVendor" :key="v.vendor_name" class="border-b">
              <td class="px-4 py-2">{{ v.vendor_name || 'Unknown' }}</td>
              <td class="px-4 py-2 text-right">{{ v.po_count }}</td>
              <td class="px-4 py-2 text-right">Rp {{ fmt(v.total_spend) }}</td>
              <td class="px-4 py-2 text-right">{{ totalSpend > 0 ? ((v.total_spend / totalSpend) * 100).toFixed(1) : 0 }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Monthly Trend -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Monthly Spend Trend</h3>
        <div class="space-y-2">
          <div v-for="m in data.monthly" :key="m.month" class="flex items-center gap-3">
            <span class="w-20 text-sm text-gray-600">{{ m.month }}</span>
            <div class="flex-1 bg-gray-100 rounded h-6 relative">
              <div class="bg-blue-500 h-6 rounded" :style="{ width: barWidth(m.spend) }"></div>
            </div>
            <span class="text-xs w-32 text-right">{{ m.po_count }} POs · Rp {{ fmt(m.spend) }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useReportsStore } from '../stores/reports';

const store = useReportsStore();
const data = computed(() => store.procurement);
const totalSpend = computed(() => Number(data.value?.summary?.total_spend || 0));
const maxMonthlySpend = computed(() => Math.max(...(data.value?.monthly || []).map((m: any) => Number(m.spend || 0)), 1));
const fmt = (v: any) => Number(v || 0).toLocaleString();
const barWidth = (spend: number) => `${(spend / maxMonthlySpend.value) * 100}%`;

onMounted(() => store.fetchProcurementReport());
</script>
