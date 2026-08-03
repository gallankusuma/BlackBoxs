<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">System Alerts</h1>
      <button @click="load" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Refresh</button>
    </div>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>

    <!-- Summary -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded shadow p-4 text-center border-l-4 border-red-500">
        <p class="text-2xl font-bold text-red-600">{{ criticalCount }}</p>
        <p class="text-xs text-gray-500">Critical</p>
      </div>
      <div class="bg-white rounded shadow p-4 text-center border-l-4 border-yellow-500">
        <p class="text-2xl font-bold text-yellow-600">{{ warningCount }}</p>
        <p class="text-xs text-gray-500">Warnings</p>
      </div>
      <div class="bg-white rounded shadow p-4 text-center border-l-4 border-blue-500">
        <p class="text-2xl font-bold text-blue-600">{{ infoCount }}</p>
        <p class="text-xs text-gray-500">Info</p>
      </div>
    </div>

    <!-- Alert List -->
    <div v-if="store.alerts.length" class="space-y-3">
      <div v-for="(alert, i) in store.alerts" :key="i" 
        :class="alertClass(alert.type)"
        class="rounded shadow p-4 flex items-start gap-3">
        <span class="text-lg mt-0.5">{{ alertIcon(alert.type) }}</span>
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <span class="text-xs font-medium bg-gray-200 px-2 py-0.5 rounded">{{ alert.module }}</span>
            <span class="text-xs uppercase font-bold" :class="typeColor(alert.type)">{{ alert.type }}</span>
          </div>
          <p class="text-sm mt-1">{{ alert.message }}</p>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-16 bg-white rounded shadow">
      <p class="text-4xl mb-2">✅</p>
      <p class="text-gray-400">No active alerts — all systems normal</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useDashboardStore } from '../stores/dashboard';

const store = useDashboardStore();

const criticalCount = computed(() => store.alerts.filter(a => a.type === 'critical').length);
const warningCount = computed(() => store.alerts.filter(a => a.type === 'warning').length);
const infoCount = computed(() => store.alerts.filter(a => a.type === 'info').length);

const alertClass = (type: string) => ({
  'bg-red-50 border-l-4 border-red-500': type === 'critical',
  'bg-yellow-50 border-l-4 border-yellow-500': type === 'warning',
  'bg-blue-50 border-l-4 border-blue-500': type === 'info',
});

const alertIcon = (type: string) => type === 'critical' ? '🔴' : type === 'warning' ? '🟡' : '🔵';
const typeColor = (type: string) => type === 'critical' ? 'text-red-600' : type === 'warning' ? 'text-yellow-600' : 'text-blue-600';

const load = () => store.fetchAlerts();
onMounted(load);
</script>
