<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Sales Reports</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- KPI Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold">{{ data.summary?.total_so || 0 }}</p>
          <p class="text-xs text-gray-500">Total Orders</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-blue-600">{{ data.summary?.active || 0 }}</p>
          <p class="text-xs text-gray-500">Active</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-green-600">{{ data.summary?.completed || 0 }}</p>
          <p class="text-xs text-gray-500">Completed</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-green-700">Rp {{ fmt(data.summary?.total_revenue) }}</p>
          <p class="text-xs text-gray-500">Total Revenue</p>
        </div>
      </div>

      <!-- Delivery Stats -->
      <div class="grid grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-xl font-bold">{{ data.deliveryStats?.total_do || 0 }}</p>
          <p class="text-xs text-gray-500">Delivery Orders</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-xl font-bold text-green-600">{{ data.deliveryStats?.delivered || 0 }}</p>
          <p class="text-xs text-gray-500">Delivered</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-xl font-bold text-blue-600">{{ data.deliveryStats?.shipped || 0 }}</p>
          <p class="text-xs text-gray-500">Shipped</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-xl font-bold text-yellow-600">{{ data.deliveryStats?.pending || 0 }}</p>
          <p class="text-xs text-gray-500">Pending</p>
        </div>
      </div>

      <!-- Revenue by Customer -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Revenue by Customer</h3>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b"><tr>
            <th class="px-4 py-2 text-left">Customer</th>
            <th class="px-4 py-2 text-right">Orders</th>
            <th class="px-4 py-2 text-right">Revenue</th>
            <th class="px-4 py-2 text-right">% Total</th>
          </tr></thead>
          <tbody>
            <tr v-for="c in data.byCustomer" :key="c.customer_name" class="border-b">
              <td class="px-4 py-2">{{ c.customer_name || 'Unknown' }}</td>
              <td class="px-4 py-2 text-right">{{ c.order_count }}</td>
              <td class="px-4 py-2 text-right">Rp {{ fmt(c.revenue) }}</td>
              <td class="px-4 py-2 text-right">{{ totalRevenue > 0 ? ((c.revenue / totalRevenue) * 100).toFixed(1) : 0 }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Monthly Revenue Trend -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Monthly Revenue Trend</h3>
        <div class="space-y-2">
          <div v-for="m in data.monthly" :key="m.month" class="flex items-center gap-3">
            <span class="w-20 text-sm text-gray-600">{{ m.month }}</span>
            <div class="flex-1 bg-gray-100 rounded h-6">
              <div class="bg-green-500 h-6 rounded" :style="{ width: barWidth(m.revenue) }"></div>
            </div>
            <span class="text-xs w-40 text-right">{{ m.orders }} orders · Rp {{ fmt(m.revenue) }}</span>
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
const data = computed(() => store.sales);
const totalRevenue = computed(() => Number(data.value?.summary?.total_revenue || 0));
const maxRevenue = computed(() => Math.max(...(data.value?.monthly || []).map((m: any) => Number(m.revenue || 0)), 1));
const fmt = (v: any) => Number(v || 0).toLocaleString();
const barWidth = (revenue: number) => `${(revenue / maxRevenue.value) * 100}%`;

onMounted(() => store.fetchSalesReport());
</script>
