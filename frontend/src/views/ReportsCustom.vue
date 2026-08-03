<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Custom Reports</h1>

    <!-- Report Builder -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">Report Builder</h3>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <label class="block text-sm font-medium mb-1">Module</label>
          <select v-model="selectedModule" class="w-full border rounded px-3 py-2 text-sm">
            <option v-for="m in moduleOptions" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">From Date</label>
          <input type="date" v-model="fromDate" class="w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">To Date</label>
          <input type="date" v-model="toDate" class="w-full border rounded px-3 py-2 text-sm" />
        </div>
        <div class="flex items-end">
          <button @click="generateReport" :disabled="loading" class="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50 w-full">
            Generate
          </button>
        </div>
      </div>
    </div>

    <!-- Saved Templates -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold">Saved Templates</h3>
        <button v-if="reportData" @click="saveTemplate" class="text-blue-600 text-sm hover:underline">Save Current as Template</button>
      </div>
      <div v-if="templates.length" class="flex flex-wrap gap-2">
        <button v-for="(t, i) in templates" :key="i" @click="loadTemplate(t)" class="bg-gray-100 hover:bg-blue-100 px-3 py-1.5 rounded text-sm flex items-center gap-2">
          {{ t.name }}
          <span @click.stop="templates.splice(i, 1)" class="text-red-400 hover:text-red-600">&times;</span>
        </button>
      </div>
      <p v-else class="text-sm text-gray-400">No saved templates</p>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="text-center py-12 text-gray-500">Generating report...</div>

    <!-- Report Results -->
    <div v-else-if="reportData" class="bg-white rounded shadow p-5">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold">{{ currentModuleLabel }} Report Results</h3>
        <span class="text-xs text-gray-400">Generated: {{ new Date().toLocaleString() }}</span>
      </div>

      <!-- Dynamic summary cards -->
      <div v-if="reportData.summary" class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div v-for="(val, key) in reportData.summary" :key="String(key)" class="bg-gray-50 rounded p-3 text-center">
          <p class="text-lg font-bold">{{ formatVal(val) }}</p>
          <p class="text-xs text-gray-500">{{ formatKey(String(key)) }}</p>
        </div>
      </div>

      <!-- Dynamic tables for each data array -->
      <template v-for="(val, key) in reportData" :key="String(key)">
        <div v-if="Array.isArray(val) && val.length" class="mt-4">
          <h4 class="font-medium text-sm mb-2">{{ formatKey(String(key)) }}</h4>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 border-b">
                <tr><th v-for="col in Object.keys(val[0])" :key="col" class="px-3 py-2 text-left text-xs">{{ formatKey(col) }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="(row, ri) in val" :key="ri" class="border-b">
                  <td v-for="col in Object.keys(row)" :key="col" class="px-3 py-2 text-xs">{{ formatVal(row[col]) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
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
const fromDate = ref('');
const toDate = ref('');
const loading = ref(false);
const reportData = ref<any>(null);
const templates = ref<any[]>([]);

const currentModuleLabel = computed(() => moduleOptions.find(m => m.value === selectedModule.value)?.label || 'Report');

const generateReport = async () => {
  loading.value = true;
  try {
    const params: Record<string, any> = {};
    if (fromDate.value) params.from_date = fromDate.value;
    if (toDate.value) params.to_date = toDate.value;
    const res = await api.get(`/reports/${selectedModule.value}`, { params });
    reportData.value = res.data?.data || res.data || null;
  } catch {
    reportData.value = null;
  }
  loading.value = false;
};

const saveTemplate = () => {
  const name = prompt('Template name:');
  if (name) {
    templates.value.push({ name, module: selectedModule.value, fromDate: fromDate.value, toDate: toDate.value });
  }
};

const loadTemplate = (t: any) => {
  selectedModule.value = t.module;
  fromDate.value = t.fromDate || '';
  toDate.value = t.toDate || '';
  generateReport();
};

const formatKey = (key: string) => key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
const formatVal = (val: any) => {
  if (val == null) return '-';
  if (typeof val === 'number') return val.toLocaleString();
  return String(val);
};
</script>
