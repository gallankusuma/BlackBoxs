<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Sales KPI Dashboard</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- Main KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-blue-500">
          <p class="text-3xl font-bold">{{ data.summary?.total_so || 0 }}</p>
          <p class="text-sm text-gray-500">Total Orders</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-green-500">
          <p class="text-3xl font-bold text-green-600">Rp {{ fmt(data.summary?.total_revenue) }}</p>
          <p class="text-sm text-gray-500">Total Revenue</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-indigo-500">
          <p class="text-3xl font-bold text-indigo-600">{{ data.summary?.active || 0 }}</p>
          <p class="text-sm text-gray-500">Active Orders</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-emerald-500">
          <p class="text-3xl font-bold text-emerald-600">{{ data.summary?.completed || 0 }}</p>
          <p class="text-sm text-gray-500">Completed</p>
        </div>
      </div>

      <!-- Delivery KPIs -->
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
          <p class="text-xs text-gray-500">In Transit</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-xl font-bold text-yellow-600">{{ data.deliveryStats?.pending || 0 }}</p>
          <p class="text-xs text-gray-500">Pending</p>
        </div>
      </div>

      <!-- Revenue Trend -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Monthly Revenue Trend</h3>
        <div class="space-y-2">
          <div v-for="m in data.monthly" :key="m.month" class="flex items-center gap-3">
            <span class="w-20 text-sm text-gray-600">{{ m.month }}</span>
            <div class="flex-1 bg-gray-100 rounded h-6">
              <div class="bg-green-500 h-6 rounded" :style="{ width: bar(m.revenue) }"></div>
            </div>
            <span class="text-xs w-40 text-right">{{ m.orders }} orders · Rp {{ fmt(m.revenue) }}</span>
          </div>
        </div>
      </div>

      <!-- Top Customers -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Top Customers by Revenue</h3>
        <div class="space-y-2">
          <div v-for="(c, i) in (data.byCustomer || []).slice(0, 10)" :key="c.customer_name" class="flex items-center gap-3">
            <span class="text-lg font-bold text-gray-300 w-8">{{ i + 1 }}</span>
            <span class="w-40 text-sm truncate">{{ c.customer_name || 'Unknown' }}</span>
            <div class="flex-1 bg-gray-100 rounded h-5">
              <div class="bg-indigo-500 h-5 rounded" :style="{ width: custBar(c.revenue) }"></div>
            </div>
            <span class="text-xs w-32 text-right">{{ c.order_count }} orders · Rp {{ fmt(c.revenue) }}</span>
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
const data = computed(() => store.sales);
const fmt = (v: any) => Number(v || 0).toLocaleString();
const maxRevenue = computed(() => Math.max(...(data.value?.monthly || []).map((m: any) => Number(m.revenue || 0)), 1));
const bar = (v: number) => `${(v / maxRevenue.value) * 100}%`;
const maxCust = computed(() => Math.max(...(data.value?.byCustomer || []).map((c: any) => Number(c.revenue || 0)), 1));
const custBar = (v: number) => `${(v / maxCust.value) * 100}%`;

onMounted(() => store.fetchSalesKPI());
</script>
