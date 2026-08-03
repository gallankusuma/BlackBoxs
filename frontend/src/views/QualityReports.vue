<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h2 class="text-2xl font-bold text-gray-900">QC Reports &amp; Analytics</h2>
        <p class="text-sm text-gray-500 mt-1">Quality performance overview and KPIs</p>
      </div>

      <div v-if="loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else>
        <!-- KPI Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-gray-500 uppercase tracking-wide">Total Batches Tested</p>
            <p class="text-3xl font-bold mt-1">{{ summary.total_batches ?? 0 }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-green-600 uppercase tracking-wide">Pass Rate</p>
            <p class="text-3xl font-bold mt-1 text-green-700">{{ passRate }}%</p>
            <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
              <div class="bg-green-500 h-2 rounded-full transition-all" :style="{ width: passRate + '%' }"></div>
            </div>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-red-600 uppercase tracking-wide">Open NCRs</p>
            <p class="text-3xl font-bold mt-1 text-red-700">{{ summary.open_ncrs ?? 0 }}</p>
          </div>
          <div class="bg-white shadow rounded-lg p-5">
            <p class="text-xs text-orange-600 uppercase tracking-wide">Rework in Progress</p>
            <p class="text-3xl font-bold mt-1 text-orange-700">{{ summary.rework_in_progress ?? 0 }}</p>
          </div>
        </div>

        <!-- Detail Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Test Result Breakdown -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 mb-4 uppercase">Test Result Breakdown</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Passed</span>
                <div class="flex items-center gap-2">
                  <div class="w-40 bg-gray-200 rounded-full h-3">
                    <div class="bg-green-500 h-3 rounded-full" :style="{ width: barWidth(summary.tests_passed, totalTests) }"></div>
                  </div>
                  <span class="text-sm font-medium w-12 text-right">{{ summary.tests_passed ?? 0 }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Failed</span>
                <div class="flex items-center gap-2">
                  <div class="w-40 bg-gray-200 rounded-full h-3">
                    <div class="bg-red-500 h-3 rounded-full" :style="{ width: barWidth(summary.tests_failed, totalTests) }"></div>
                  </div>
                  <span class="text-sm font-medium w-12 text-right">{{ summary.tests_failed ?? 0 }}</span>
                </div>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-600">Pending</span>
                <div class="flex items-center gap-2">
                  <div class="w-40 bg-gray-200 rounded-full h-3">
                    <div class="bg-yellow-500 h-3 rounded-full" :style="{ width: barWidth(summary.tests_pending, totalTests) }"></div>
                  </div>
                  <span class="text-sm font-medium w-12 text-right">{{ summary.tests_pending ?? 0 }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- NCR Severity Distribution -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 mb-4 uppercase">NCR Severity Distribution</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-red-600 font-medium">Critical</span>
                <span class="text-lg font-bold">{{ summary.ncr_critical ?? 0 }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-yellow-600 font-medium">Major</span>
                <span class="text-lg font-bold">{{ summary.ncr_major ?? 0 }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-blue-600 font-medium">Minor</span>
                <span class="text-lg font-bold">{{ summary.ncr_minor ?? 0 }}</span>
              </div>
            </div>
          </div>

          <!-- Batch Release Summary -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 mb-4 uppercase">Batch Release Status</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-green-600">Released</span>
                <span class="text-lg font-bold text-green-700">{{ summary.batches_released ?? 0 }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-yellow-600">On Hold</span>
                <span class="text-lg font-bold text-yellow-700">{{ summary.batches_on_hold ?? 0 }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-red-600">Rejected</span>
                <span class="text-lg font-bold text-red-700">{{ summary.batches_rejected ?? 0 }}</span>
              </div>
            </div>
          </div>

          <!-- Rework Summary -->
          <div class="bg-white shadow rounded-lg p-5">
            <h3 class="text-sm font-bold text-gray-700 mb-4 uppercase">Rework Orders</h3>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-orange-600">Pending</span>
                <span class="text-lg font-bold text-orange-700">{{ summary.rework_pending ?? 0 }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-blue-600">In Progress</span>
                <span class="text-lg font-bold text-blue-700">{{ summary.rework_in_progress ?? 0 }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-green-600">Completed</span>
                <span class="text-lg font-bold text-green-700">{{ summary.rework_completed ?? 0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useQualityStore } from '../stores/quality';

const store = useQualityStore();
const loading = ref(true);
const summary = ref<any>({});

const totalTests = computed(() => (summary.value.tests_passed ?? 0) + (summary.value.tests_failed ?? 0) + (summary.value.tests_pending ?? 0));
const passRate = computed(() => {
  const done = (summary.value.tests_passed ?? 0) + (summary.value.tests_failed ?? 0);
  if (done === 0) return 0;
  return Math.round(((summary.value.tests_passed ?? 0) / done) * 100);
});

const barWidth = (val: number | undefined, total: number) => {
  if (!val || !total) return '0%';
  return Math.round((val / total) * 100) + '%';
};

onMounted(async () => {
  await store.fetchQCReportSummary();
  summary.value = store.reportSummary;
  loading.value = false;
});
</script>
