<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Inventory Reports</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- KPI Cards -->
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold">{{ data.summary?.total_products || 0 }}</p>
          <p class="text-xs text-gray-500">Products in Stock</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-blue-600">{{ fmt(data.summary?.total_stock) }}</p>
          <p class="text-xs text-gray-500">Total Quantity</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-green-600">Rp {{ fmt(data.summary?.total_valuation) }}</p>
          <p class="text-xs text-gray-500">Total Valuation</p>
        </div>
      </div>

      <!-- Low Stock Alerts -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3 text-red-600">Low Stock Alerts ({{ (data.lowStock || []).length }})</h3>
        <table class="w-full text-sm">
          <thead class="bg-red-50 border-b"><tr>
            <th class="px-4 py-2 text-left">Product</th>
            <th class="px-4 py-2 text-left">SKU</th>
            <th class="px-4 py-2 text-right">Current Stock</th>
            <th class="px-4 py-2 text-right">Minimum Stock</th>
            <th class="px-4 py-2 text-right">Shortage</th>
          </tr></thead>
          <tbody>
            <tr v-for="item in data.lowStock" :key="item.sku" class="border-b">
              <td class="px-4 py-2">{{ item.name }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ item.sku }}</td>
              <td class="px-4 py-2 text-right text-red-600 font-medium">{{ item.quantity }}</td>
              <td class="px-4 py-2 text-right">{{ item.minimum_stock }}</td>
              <td class="px-4 py-2 text-right text-red-600">{{ item.quantity - item.minimum_stock }}</td>
            </tr>
            <tr v-if="!data.lowStock?.length"><td colspan="5" class="px-4 py-4 text-center text-gray-400">No low stock items</td></tr>
          </tbody>
        </table>
      </div>

      <!-- By Warehouse -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Stock by Warehouse</h3>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b"><tr>
            <th class="px-4 py-2 text-left">Warehouse</th>
            <th class="px-4 py-2 text-right">Products</th>
            <th class="px-4 py-2 text-right">Total Qty</th>
            <th class="px-4 py-2 text-right">Valuation</th>
          </tr></thead>
          <tbody>
            <tr v-for="w in data.byWarehouse" :key="w.warehouse_name" class="border-b">
              <td class="px-4 py-2">{{ w.warehouse_name || 'Default' }}</td>
              <td class="px-4 py-2 text-right">{{ w.products }}</td>
              <td class="px-4 py-2 text-right">{{ fmt(w.total_qty) }}</td>
              <td class="px-4 py-2 text-right">Rp {{ fmt(w.valuation) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Top Items by Value -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Top Items by Value</h3>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b"><tr>
            <th class="px-4 py-2 text-left">Product</th>
            <th class="px-4 py-2 text-left">SKU</th>
            <th class="px-4 py-2 text-right">Quantity</th>
            <th class="px-4 py-2 text-right">Value</th>
          </tr></thead>
          <tbody>
            <tr v-for="item in data.topItems" :key="item.sku" class="border-b">
              <td class="px-4 py-2">{{ item.name }}</td>
              <td class="px-4 py-2 font-mono text-xs">{{ item.sku }}</td>
              <td class="px-4 py-2 text-right">{{ fmt(item.quantity) }}</td>
              <td class="px-4 py-2 text-right">Rp {{ fmt(item.value) }}</td>
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
const data = computed(() => store.inventory);
const fmt = (v: any) => Number(v || 0).toLocaleString();

onMounted(() => store.fetchInventoryReport());
</script>
