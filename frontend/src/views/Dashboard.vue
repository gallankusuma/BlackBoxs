<template>
  <div class="min-h-screen bg-slate-50 dark:bg-gray-900 transition-colors duration-300">
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      <section class="bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 rounded-2xl shadow-xl text-white overflow-hidden hero-3d">
        <div class="p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hero-depth">
          <div>
            <p class="text-sm uppercase tracking-wide text-white/80">Dashboard</p>
            <h1 class="text-3xl font-bold leading-tight">Hai, {{ displayName }} 👋</h1>
            <p class="text-white/80 mt-2">Pantau operasi produksi, inventory, dan fulfillment dalam satu layar.</p>
          </div>
          <div class="flex flex-wrap gap-2 text-sm">
            <router-link to="/procurement" class="quick-btn">New PO</router-link>
            <router-link to="/sales" class="quick-btn">New SO</router-link>
            <router-link to="/warehouses" class="quick-btn">Inventory Transfer</router-link>
            <router-link to="/quality" class="quick-btn">Log QC</router-link>
            <button @click="runSimulation" :disabled="isSimulating" class="quick-btn flex items-center gap-1">
              <svg v-if="isSimulating" class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>{{ isSimulating ? 'Running...' : '🧪 Simulate' }}</span>
            </button>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div v-for="card in summaryCards" :key="card.title" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-100 dark:border-gray-700 p-4 tilt-card">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">{{ card.title }}</p>
            <span :class="card.badgeClass" class="px-2 py-1 rounded-full text-[11px] font-semibold">{{ card.trend }}</span>
          </div>
          <p class="text-3xl font-bold text-slate-900">{{ card.value }}</p>
          <p class="text-slate-500 text-sm mt-1">{{ card.helper }}</p>
          <div class="mt-3 h-2 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
            <div class="h-full" :class="card.barClass" :style="{ width: card.fill }"></div>
          </div>
        </div>
      </section>

      <!-- Client Metrics Section -->
      <section class="">
        <h2 class="text-xl font-bold text-slate-900 dark:text-white mb-4">Client Management Overview</h2>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div v-for="card in clientMetricsCards" :key="card.title" class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-100 dark:border-gray-700 p-4 tilt-card">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-gray-400">{{ card.title }}</p>
              <span :class="card.badgeClass" class="px-2 py-1 rounded-full text-[11px] font-semibold">{{ card.trend }}</span>
            </div>
            <p class="text-3xl font-bold text-slate-900 dark:text-white">{{ card.value }}</p>
            <p class="text-slate-500 text-sm mt-1">{{ card.helper }}</p>
            <div class="mt-3 h-2 rounded-full bg-slate-100 dark:bg-gray-700 overflow-hidden">
              <div class="h-full" :class="card.barClass" :style="{ width: card.fill }"></div>
            </div>
          </div>
        </div>
        <div class="mt-4">
          <router-link to="/clients-management" class="inline-block px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition">
            View Client Management →
          </router-link>
        </div>
      </section>

      <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-100 dark:border-gray-700 p-5 space-y-4 lg:col-span-2 tilt-card">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Key Performance Indicators</h2>
            <span class="text-xs text-slate-500 dark:text-gray-400">Live snapshot</span>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div v-for="kpi in kpiCards" :key="kpi.label" class="rounded-lg border border-slate-100 dark:border-gray-700 p-4 bg-slate-50 dark:bg-gray-700 tilt-card">
              <p class="text-sm text-slate-500 dark:text-gray-400">{{ kpi.label }}</p>
              <p class="text-2xl font-bold text-slate-900 dark:text-white">{{ kpi.value }}</p>
              <div class="flex items-center text-sm mt-2" :class="kpi.delta > 0 ? 'text-emerald-600' : 'text-rose-600'">
                <span class="font-semibold">{{ kpi.delta > 0 ? '+' : '' }}{{ kpi.delta }}%</span>
                <span class="text-slate-500 ml-2">vs last 30d</span>
              </div>
              <div class="mt-3 h-2 bg-white rounded-full overflow-hidden">
                <div class="h-full" :class="kpi.delta > 0 ? 'bg-emerald-500' : 'bg-rose-500'" :style="{ width: kpi.spark }"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-100 dark:border-gray-700 p-5 space-y-4 tilt-card">
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Reminders</h2>
            <span class="text-xs text-slate-500 dark:text-gray-400">Today</span>
          </div>
          <div class="space-y-2">
            <div v-for="item in reminders" :key="item.label" class="flex items-center justify-between rounded-lg border border-slate-100 dark:border-gray-700 px-3 py-2 bg-slate-50 dark:bg-gray-700">
              <div>
                <p class="text-sm font-semibold text-slate-800 dark:text-white">{{ item.label }}</p>
                <p class="text-xs text-slate-500 dark:text-gray-400">{{ item.helper }}</p>
              </div>
              <span class="text-base font-bold" :class="item.tone">{{ item.value }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-100 dark:border-gray-700 p-5 tilt-card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Recent Work Orders</h3>
            <router-link to="/workorders" class="text-sm text-indigo-600 dark:text-indigo-400 font-semibold">View all →</router-link>
          </div>
          <div v-if="workOrderStore.workOrders.length === 0" class="text-slate-500 dark:text-gray-400 text-center py-6">Tidak ada work order.</div>
          <ul v-else class="divide-y divide-slate-100 dark:divide-gray-700">
            <li v-for="wo in workOrderStore.workOrders.slice(0, 5)" :key="wo.id" class="py-3 flex items-center justify-between">
              <div>
                <p class="font-semibold text-slate-900 dark:text-white">{{ wo.product_name }}</p>
                <p class="text-xs text-slate-500 dark:text-gray-400">Qty {{ wo.quantity }} · {{ wo.status }}</p>
              </div>
              <span :class="statusColor(wo.status)" class="px-2 py-1 text-xs font-semibold rounded-full capitalize">{{ wo.status }}</span>
            </li>
          </ul>
        </div>

        <div class="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-slate-100 dark:border-gray-700 p-5 tilt-card">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-lg font-semibold text-slate-900 dark:text-white">Low Stock Watchlist</h3>
            <router-link to="/inventory" class="text-sm text-indigo-600 dark:text-indigo-400 font-semibold">Inventory →</router-link>
          </div>
          <div v-if="lowStockItems.length === 0" class="text-slate-500 dark:text-gray-400 text-center py-6">Semua item aman.</div>
          <ul v-else class="divide-y divide-slate-100 dark:divide-gray-700">
            <li v-for="item in lowStockItems" :key="item.id" class="py-3 flex items-center justify-between">
              <div>
                <p class="font-semibold text-slate-900 dark:text-white">{{ item.product_name }}</p>
                <p class="text-xs text-slate-500 dark:text-gray-400">SKU {{ item.sku || '-' }}</p>
              </div>
              <span class="text-rose-600 font-bold text-sm">{{ item.quantity_available }} units</span>
            </li>
          </ul>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useAuthStore } from '../stores/auth';
import { useProductStore } from '../stores/products';
import { useWorkOrderStore } from '../stores/workorders';
import { useInventoryStore } from '../stores/inventory';
import { useWarehouseStore } from '../stores/warehouse';
import { api } from '../lib/api';
import axios from 'axios';

const authStore = useAuthStore();
const productStore = useProductStore();
const workOrderStore = useWorkOrderStore();
const inventoryStore = useInventoryStore();
const warehouseStore = useWarehouseStore();

const isSimulating = ref(false);
const clientMetrics = ref<any>(null);
const clientLoading = ref(false);

const displayName = computed(() => authStore.user?.name || 'Operator');

const activeWorkOrders = computed(() => workOrderStore.workOrders.filter((wo) => wo.status !== 'completed' && wo.status !== 'cancelled').length);
const lowStockItems = computed(() => inventoryStore.inventory.filter((item) => item.quantity_available < 10).slice(0, 5));

const clientMetricsCards = computed(() => [
  {
    title: 'Total Clients',
    value: clientMetrics.value?.total_clients || 0,
    trend: '+5.2%',
    helper: 'Active accounts',
    barClass: 'bg-purple-500',
    badgeClass: 'bg-purple-50 text-purple-700',
    fill: '76%',
  },
  {
    title: 'Month Revenue',
    value: `$${(clientMetrics.value?.total_invoiced || 0).toLocaleString()}`,
    trend: '+12.8%',
    helper: 'Total invoiced',
    barClass: 'bg-green-500',
    badgeClass: 'bg-green-50 text-green-700',
    fill: '84%',
  },
  {
    title: 'Overdue Invoices',
    value: clientMetrics.value?.overdue_invoices || 0,
    trend: '-8.5%',
    helper: 'Amounts pending',
    barClass: 'bg-red-500',
    badgeClass: 'bg-red-50 text-red-700',
    fill: '45%',
  },
  {
    title: 'Open Projects',
    value: clientMetrics.value?.open_projects || 0,
    trend: '+3.1%',
    helper: 'Current work',
    barClass: 'bg-cyan-500',
    badgeClass: 'bg-cyan-50 text-cyan-700',
    fill: '62%',
  },
]);

const summaryCards = computed(() => [
  {
    title: 'Inventory Items',
    value: inventoryStore.inventory.length || 0,
    trend: '+13.2%',
    helper: 'Total stocked SKUs',
    barClass: 'bg-emerald-500',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    fill: '68%',
  },
  {
    title: 'Work Orders',
    value: activeWorkOrders.value,
    trend: '+17.5%',
    helper: 'Open and in-progress',
    barClass: 'bg-blue-500',
    badgeClass: 'bg-blue-50 text-blue-700',
    fill: '72%',
  },
  {
    title: 'Low Stock Alerts',
    value: lowStockItems.value.length,
    trend: '-14.7%',
    helper: 'Below safety threshold',
    barClass: 'bg-amber-500',
    badgeClass: 'bg-amber-50 text-amber-700',
    fill: '34%',
  },
  {
    title: 'Warehouses',
    value: warehouseStore.warehouses.length || 0,
    trend: '+6.2%',
    helper: 'Active locations',
    barClass: 'bg-indigo-500',
    badgeClass: 'bg-indigo-50 text-indigo-700',
    fill: '54%',
  },
]);

const kpiCards = computed(() => [
  { label: 'Inventory Coverage', value: `${inventoryStore.inventory.length ? '92' : '—'} days`, delta: 13.2, spark: '74%' },
  { label: 'Order OTIF', value: '96%', delta: 11.4, spark: '66%' },
  { label: 'Yield Quality', value: '98.3%', delta: 3.5, spark: '58%' },
]);

const reminders = computed(() => [
  { label: 'Work orders to start', value: activeWorkOrders.value, helper: 'Need release today', tone: 'text-amber-600' },
  { label: 'Low stock items', value: lowStockItems.value.length, helper: 'Reorder before noon', tone: 'text-rose-600' },
  { label: 'Inventory checks', value: warehouseStore.warehouses.length || 0, helper: 'Cycle counts pending', tone: 'text-indigo-600' },
]);

const statusColor = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    completed: 'bg-emerald-100 text-emerald-800',
    cancelled: 'bg-rose-100 text-rose-800',
  };
  return colors[status] || 'bg-slate-100 text-slate-800';
};

const runSimulation = async () => {
  if (isSimulating.value) return;
  
  try {
    isSimulating.value = true;
    console.log('🧪 Running simulation...');
    
    const response = await api.post('/api/simulate/run', { scenario: 'basic' });
    
    if (response.data) {
      const { movement_ids } = response.data.data;
      console.log(`✅ Simulation complete! Created ${movement_ids.length} movements`);
      
      // Refresh inventory data
      await inventoryStore.fetchInventory();
      
      alert(`✅ Simulation complete! Created ${movement_ids.length} movements`);
    }
  } catch (error: any) {
    console.error('Simulation error:', error);
    alert(error.response?.data?.error || 'Failed to run simulation');
  } finally {
    isSimulating.value = false;
  }
};

const fetchClientMetrics = async () => {
  try {
    clientLoading.value = true;
    const token = localStorage.getItem('auth_token');
    const response = await axios.get('/api/clients/dashboard', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    clientMetrics.value = response.data.data;
  } catch (error: any) {
    console.error('Failed to fetch client metrics:', error);
  } finally {
    clientLoading.value = false;
  }
};

onMounted(async () => {
  await Promise.all([
    productStore.fetchProducts(),
    workOrderStore.fetchWorkOrders(),
    inventoryStore.fetchInventory(),
    warehouseStore.fetchWarehouses(),
    fetchClientMetrics(),
  ]);
});
</script>

<style scoped>
.quick-btn {
  @apply px-3 py-2 rounded-lg bg-white/15 text-white font-semibold hover:bg-white/25 transition disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>
