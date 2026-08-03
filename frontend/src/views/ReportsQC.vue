<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Quality Control Reports</h1>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>
    <template v-else-if="data">
      <!-- QC Results Summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold">{{ data.summary?.total_results || 0 }}</p>
          <p class="text-xs text-gray-500">Total Tests</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-green-600">{{ data.summary?.passed || 0 }}</p>
          <p class="text-xs text-gray-500">Passed</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-red-600">{{ data.summary?.failed || 0 }}</p>
          <p class="text-xs text-gray-500">Failed</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ data.summary?.pending || 0 }}</p>
          <p class="text-xs text-gray-500">Pending</p>
        </div>
      </div>

      <!-- Pass Rate -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-2">Pass Rate</h3>
        <div class="flex items-center gap-4">
          <div class="flex-1 bg-gray-100 rounded-full h-4">
            <div class="bg-green-500 h-4 rounded-full" :style="{ width: passRate + '%' }"></div>
          </div>
          <span class="text-lg font-bold text-green-600">{{ passRate }}%</span>
        </div>
      </div>

      <!-- NCR Summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold">{{ data.ncrSummary?.total_ncr || 0 }}</p>
          <p class="text-xs text-gray-500">Total NCRs</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-orange-600">{{ data.ncrSummary?.open_ncr || 0 }}</p>
          <p class="text-xs text-gray-500">Open</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-red-600">{{ data.ncrSummary?.critical || 0 }}</p>
          <p class="text-xs text-gray-500">Critical</p>
        </div>
        <div class="bg-white rounded shadow p-4 text-center">
          <p class="text-2xl font-bold text-yellow-600">{{ data.ncrSummary?.major || 0 }}</p>
          <p class="text-xs text-gray-500">Major</p>
        </div>
      </div>

      <!-- Test Breakdown -->
      <div class="bg-white rounded shadow p-5 mb-6">
        <h3 class="font-semibold mb-3">Results by Test Type</h3>
        <table class="w-full text-sm">
          <thead class="bg-gray-50 border-b"><tr>
            <th class="px-4 py-2 text-left">Test</th>
            <th class="px-4 py-2 text-right">Total</th>
            <th class="px-4 py-2 text-right">Passed</th>
            <th class="px-4 py-2 text-right">Failed</th>
            <th class="px-4 py-2 text-right">Pass Rate</th>
          </tr></thead>
          <tbody>
            <tr v-for="t in data.byTest" :key="t.test_name" class="border-b">
              <td class="px-4 py-2">{{ t.test_name || 'Unknown' }}</td>
              <td class="px-4 py-2 text-right">{{ t.total }}</td>
              <td class="px-4 py-2 text-right text-green-600">{{ t.passed }}</td>
              <td class="px-4 py-2 text-right text-red-600">{{ t.failed }}</td>
              <td class="px-4 py-2 text-right font-medium">{{ t.total > 0 ? ((t.passed / t.total) * 100).toFixed(1) : 0 }}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Batch Release Stats -->
      <div class="bg-white rounded shadow p-5">
        <h3 class="font-semibold mb-3">Batch Release Statistics</h3>
        <div class="grid grid-cols-4 gap-4">
          <div class="text-center"><p class="text-xl font-bold">{{ data.batchStats?.total || 0 }}</p><p class="text-xs text-gray-500">Total</p></div>
          <div class="text-center"><p class="text-xl font-bold text-green-600">{{ data.batchStats?.released || 0 }}</p><p class="text-xs text-gray-500">Released</p></div>
          <div class="text-center"><p class="text-xl font-bold text-yellow-600">{{ data.batchStats?.on_hold || 0 }}</p><p class="text-xs text-gray-500">On Hold</p></div>
          <div class="text-center"><p class="text-xl font-bold text-red-600">{{ data.batchStats?.rejected || 0 }}</p><p class="text-xs text-gray-500">Rejected</p></div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useReportsStore } from '../stores/reports';

const store = useReportsStore();
const data = computed(() => store.qc);
const passRate = computed(() => {
  const s = data.value?.summary;
  if (!s || !s.total_results) return 0;
  return ((s.passed / s.total_results) * 100).toFixed(1);
});

onMounted(() => store.fetchQCReport());
</script>
