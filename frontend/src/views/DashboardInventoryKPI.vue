<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Inventory KPI Dashboard</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- Main KPIs -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-blue-500">
          <p class="text-3xl font-bold">{{ data.summary?.total_products || 0 }}</p>
          <p class="text-sm text-gray-500">Products Tracked</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-green-500">
          <p class="text-3xl font-bold text-green-600">{{ fmt(data.summary?.total_stock) }}</p>
          <p class="text-sm text-gray-500">Total Quantity</p>
        </div>
        <div class="bg-white rounded shadow p-5 text-center border-l-4 border-purple-500">
          <p class="text-3xl font-bold text-purple-600">{{ formatCurrency(data.summary?.total_valuation) }}</p>
          <p class="text-sm text-gray-500">Total Valuation</p>
        </div>
      </div>

      <!-- Low Stock Alert -->
      <div v-if="data.lowStock?.length" class="bg-red-50 border border-red-200 rounded shadow p-5 mb-6">
        <h3 class="font-semibold text-red-700 mb-3">⚠ Low Stock Alerts ({{ data.lowStock.length }})</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div v-for="item in data.lowStock.slice(0, 6)" :key="item.sku" class="flex items-center justify-between bg-white rounded px-4 py-2">
            <div>
              <p class="text-sm font-medium">{{ item.name }}</p>
              <p class="text-xs text-gray-400">{{ item.sku }}</p>
            </div>
            <div class="text-right">
              <p class="text-sm font-bold text-red-600">{{ item.quantity }}</p>
              <p class="text-xs text-gray-400">min: {{ item.minimum_stock }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Warehouse Distribution -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Stock by Warehouse</h3>
        <div class="space-y-3">
          <div v-for="w in data.byWarehouse" :key="w.warehouse_name" class="flex items-center gap-3">
            <span class="w-32 text-sm truncate">{{ w.warehouse_name || 'Default' }}</span>
            <div class="flex-1 bg-gray-100 rounded h-6">
              <div class="bg-blue-500 h-6 rounded" :style="{ width: whBar(w.valuation) }"></div>
            </div>
            <span class="text-xs w-40 text-right">{{ w.products }} items · {{ formatCurrency(w.valuation) }}</span>
          </div>
        </div>
      </div>

      <!-- Top Items by Value -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Highest Value Items</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div v-for="(item, i) in (data.topItems || []).slice(0, 10)" :key="item.sku" class="flex items-center gap-3 bg-gray-50 rounded px-4 py-3">
            <span class="text-lg font-bold text-gray-300 w-8">{{ i + 1 }}</span>
            <div class="flex-1">
              <p class="text-sm font-medium">{{ item.name }}</p>
              <p class="text-xs text-gray-400">{{ item.sku }} · Qty: {{ fmt(item.quantity) }}</p>
            </div>
            <p class="text-sm font-bold">{{ formatCurrency(item.value) }}</p>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useDashboardStore } from '../stores/dashboard';
import { formatCurrency } from '../utils/format';

const store = useDashboardStore();
const data = computed(() => store.inventory);
const fmt = (v: any) => Number(v || 0).toLocaleString();
const maxWh = computed(() => Math.max(...(data.value?.byWarehouse || []).map((w: any) => Number(w.valuation || 0)), 1));
const whBar = (val: number) => `${(val / maxWh.value) * 100}%`;

onMounted(() => store.fetchInventoryKPI());
</script>
