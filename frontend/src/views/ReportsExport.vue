<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Export Data</h1>

    <!-- Export Options -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">Export Configuration</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">Module</label>
          <select v-model="selectedModule" class="w-full border rounded px-3 py-2 text-sm">
            <option v-for="m in moduleOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Format</label>
          <select v-model="selectedFormat" class="w-full border rounded px-3 py-2 text-sm">
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Date Range (optional)</label>
          <div class="flex gap-2">
            <input type="date" v-model="fromDate" class="flex-1 border rounded px-2 py-2 text-sm" />
            <input type="date" v-model="toDate" class="flex-1 border rounded px-2 py-2 text-sm" />
          </div>
        </div>
      </div>
      <button @click="exportData" :disabled="exporting" class="bg-green-600 text-white px-6 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50">
        {{ exporting ? 'Exporting...' : 'Export Data' }}
      </button>
    </div>

    <!-- Quick Export -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">Quick Export</h3>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
        <button v-for="m in moduleOptions" :key="m.value" @click="quickExport(m.value, m.label)" 
          class="border rounded p-4 text-center hover:bg-blue-50 hover:border-blue-300 transition">
          <p class="font-medium text-sm">{{ m.label }}</p>
          <p class="text-xs text-gray-400 mt-1">Export as CSV</p>
        </button>
      </div>
    </div>

    <!-- Export History -->
    <div class="bg-white rounded shadow p-5">
      <h3 class="font-semibold mb-3">Recent Exports</h3>
      <div v-if="exports.length" class="space-y-2">
        <div v-for="(e, i) in exports" :key="i" class="flex items-center justify-between bg-gray-50 rounded px-4 py-2">
          <div>
            <p class="text-sm font-medium">{{ e.module }} — {{ e.format.toUpperCase() }}</p>
            <p class="text-xs text-gray-400">{{ e.date }} · {{ e.rows }} rows</p>
          </div>
          <button @click="redownload(e)" class="text-blue-600 text-sm hover:underline">Re-download</button>
        </div>
      </div>
      <p v-else class="text-sm text-gray-400">No exports yet</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { api } from '../lib/api';

const moduleOptions = [
  { value: 'production', label: 'Production' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'qc', label: 'Quality Control' },
  { value: 'sales', label: 'Sales' },
  { value: 'finance', label: 'Finance' },
];

const selectedModule = ref('production');
const selectedFormat = ref('csv');
const fromDate = ref('');
const toDate = ref('');
const exporting = ref(false);
const exports = ref<any[]>([]);

const exportData = async () => {
  exporting.value = true;
  try {
    const params: Record<string, any> = {};
    if (fromDate.value) params.from_date = fromDate.value;
    if (toDate.value) params.to_date = toDate.value;

    const res = await api.get(`/reports/${selectedModule.value}`, { params });
    const data = res.data?.data || res.data || {};
    downloadData(data, selectedModule.value, selectedFormat.value);
  } catch (err) {
    alert('Export failed');
  }
  exporting.value = false;
};

const quickExport = async (mod: string, _label: string) => {
  exporting.value = true;
  try {
    const res = await api.get(`/reports/${mod}`);
    const data = res.data?.data || res.data || {};
    downloadData(data, mod, 'csv');
  } catch {
    alert('Export failed');
  }
  exporting.value = false;
};

const downloadData = (data: any, module: string, format: string) => {
  let content: string;
  let mime: string;
  let rows = 0;

  if (format === 'json') {
    content = JSON.stringify(data, null, 2);
    mime = 'application/json';
    rows = Object.values(data).reduce((acc: number, v) => acc + (Array.isArray(v) ? v.length : 1), 0);
  } else {
    // Find the largest array in data and export it as CSV
    const arrays = Object.entries(data).filter(([, v]) => Array.isArray(v));
    const largest = arrays.sort(([, a]: any, [, b]: any) => b.length - a.length)[0];
    if (largest && (largest[1] as any[]).length > 0) {
      const arr = largest[1] as any[];
      const headers = Object.keys(arr[0]);
      const csvRows = [headers.join(','), ...arr.map(row => headers.map(h => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','))];
      content = csvRows.join('\n');
      rows = arr.length;
    } else {
      content = JSON.stringify(data, null, 2);
      rows = 1;
    }
    mime = 'text/csv';
  }

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${module}_report_${new Date().toISOString().slice(0, 10)}.${format}`;
  a.click();
  URL.revokeObjectURL(url);

  exports.value.unshift({
    module: module.charAt(0).toUpperCase() + module.slice(1),
    format,
    date: new Date().toLocaleString(),
    rows,
    data,
  });
};

const redownload = (e: any) => {
  downloadData(e.data, e.module.toLowerCase(), e.format);
};
</script>
