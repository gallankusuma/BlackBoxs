<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" @click.self="$emit('close')">
    <div class="bg-white rounded-xl shadow-2xl w-[98vw] h-[96vh] flex flex-col">
      <!-- Header -->
      <div class="p-4 border-b bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-t-xl flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold">📊 Project Resume & Master Schedule</h2>
          <p class="text-sm text-emerald-200">{{ proposalName }}</p>
        </div>
        <button @click="$emit('close')" class="text-white hover:text-emerald-200 text-xl font-bold">✕</button>
      </div>

      <!-- Tabs -->
      <div class="flex border-b bg-gray-50">
        <button v-for="tab in tabs" :key="tab.id" @click="activeTab = tab.id"
          :class="[
            'px-5 py-3 text-sm font-medium border-b-2 transition-colors',
            activeTab === tab.id ? 'border-emerald-600 text-emerald-700 bg-white' : 'border-transparent text-gray-500 hover:text-gray-700'
          ]">
          {{ tab.icon }} {{ tab.label }}
          <span v-if="tab.count" class="ml-1.5 bg-gray-200 text-gray-700 text-xs px-1.5 py-0.5 rounded-full">{{ tab.count }}</span>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-0">
        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center h-64">
          <div class="text-gray-500">Loading resume data...</div>
        </div>

        <!-- Overview Tab -->
        <div v-else-if="activeTab === 'overview'" class="p-6 space-y-6">
          <!-- Cost Breakdown Cards -->
          <div class="grid grid-cols-4 gap-4">
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div class="text-sm text-blue-600 font-medium">Material Cost</div>
              <div class="text-xl font-bold text-blue-800 mt-1">{{ formatCurrency(data?.totals?.material_cost) }}</div>
              <div class="text-xs text-blue-500 mt-1">{{ data?.materials?.length || 0 }} jenis material</div>
            </div>
            <div class="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div class="text-sm text-orange-600 font-medium">Manpower Cost</div>
              <div class="text-xl font-bold text-orange-800 mt-1">{{ formatCurrency(data?.totals?.labor_cost) }}</div>
              <div class="text-xs text-orange-500 mt-1">{{ data?.labor?.length || 0 }} jenis tenaga</div>
            </div>
            <div class="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div class="text-sm text-purple-600 font-medium">Equipment Cost</div>
              <div class="text-xl font-bold text-purple-800 mt-1">{{ formatCurrency(data?.totals?.equipment_cost) }}</div>
              <div class="text-xs text-purple-500 mt-1">{{ data?.equipment?.length || 0 }} jenis alat</div>
            </div>
            <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div class="text-sm text-emerald-600 font-medium">Total Direct Cost</div>
              <div class="text-xl font-bold text-emerald-800 mt-1">{{ formatCurrency(totalDirect) }}</div>
              <div class="text-xs text-emerald-500 mt-1">{{ data?.schedule_items?.length || 0 }} work packages</div>
            </div>
          </div>

          <!-- Cost Pie Chart (simple CSS bars) -->
          <div class="bg-white border rounded-lg p-4">
            <h3 class="font-semibold text-gray-800 mb-3">Cost Distribution</h3>
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-600 w-24">Material</span>
                <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div class="bg-blue-500 h-full rounded-full transition-all flex items-center justify-end pr-2"
                    :style="{ width: costPct('material') + '%' }">
                    <span class="text-xs text-white font-medium" v-if="costPct('material') > 8">{{ costPct('material').toFixed(1) }}%</span>
                  </div>
                </div>
                <span class="text-sm font-medium w-20 text-right">{{ costPct('material').toFixed(1) }}%</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-600 w-24">Manpower</span>
                <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div class="bg-orange-500 h-full rounded-full transition-all flex items-center justify-end pr-2"
                    :style="{ width: costPct('labor') + '%' }">
                    <span class="text-xs text-white font-medium" v-if="costPct('labor') > 8">{{ costPct('labor').toFixed(1) }}%</span>
                  </div>
                </div>
                <span class="text-sm font-medium w-20 text-right">{{ costPct('labor').toFixed(1) }}%</span>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-sm text-gray-600 w-24">Equipment</span>
                <div class="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div class="bg-purple-500 h-full rounded-full transition-all flex items-center justify-end pr-2"
                    :style="{ width: costPct('equipment') + '%' }">
                    <span class="text-xs text-white font-medium" v-if="costPct('equipment') > 8">{{ costPct('equipment').toFixed(1) }}%</span>
                  </div>
                </div>
                <span class="text-sm font-medium w-20 text-right">{{ costPct('equipment').toFixed(1) }}%</span>
              </div>
            </div>
          </div>

          <!-- Top 10 Expensive Resources -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-white border rounded-lg p-4">
              <h3 class="font-semibold text-gray-800 mb-3">Top 10 Material (by cost)</h3>
              <div class="space-y-1.5">
                <div v-for="(m, i) in (data?.materials || []).slice(0, 10)" :key="i" class="flex items-center gap-2 text-sm">
                  <span class="text-gray-400 w-5 text-right">{{ i + 1 }}.</span>
                  <span class="flex-1 truncate" :title="m.resource_name">{{ m.resource_name }}</span>
                  <span class="font-mono text-gray-500 text-xs">{{ m.total_qty?.toFixed(2) }} {{ m.resource_satuan }}</span>
                  <span class="font-semibold text-blue-700 whitespace-nowrap">{{ formatCurrency(m.total_cost) }}</span>
                </div>
              </div>
            </div>
            <div class="bg-white border rounded-lg p-4">
              <h3 class="font-semibold text-gray-800 mb-3">Top 10 Manpower (by cost)</h3>
              <div class="space-y-1.5">
                <div v-for="(l, i) in (data?.labor || []).slice(0, 10)" :key="i" class="flex items-center gap-2 text-sm">
                  <span class="text-gray-400 w-5 text-right">{{ i + 1 }}.</span>
                  <span class="flex-1 truncate" :title="l.resource_name">{{ l.resource_name }}</span>
                  <span class="font-mono text-gray-500 text-xs">{{ l.total_qty?.toFixed(2) }} {{ l.resource_satuan }}</span>
                  <span class="font-semibold text-orange-700 whitespace-nowrap">{{ formatCurrency(l.total_cost) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Material Tab -->
        <div v-else-if="activeTab === 'material'" class="p-0">
          <ResourceTable :items="data?.materials || []" :detail="data?.materials_detail || []" type="material" />
        </div>

        <!-- Manpower Tab -->
        <div v-else-if="activeTab === 'manpower'" class="p-0">
          <ResourceTable :items="data?.labor || []" :detail="data?.labor_detail || []" type="labor" />
        </div>

        <!-- Equipment Tab -->
        <div v-else-if="activeTab === 'equipment'" class="p-0">
          <ResourceTable :items="data?.equipment || []" :detail="data?.equipment_detail || []" type="equipment" />
        </div>

        <!-- Master Schedule Tab -->
        <div v-else-if="activeTab === 'schedule'" class="p-0">
          <MasterSchedule :items="scheduleItems" :proposal-name="proposalName" @update="onScheduleUpdate" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';
import ResourceTable from '@/components/ResourceTable.vue';
import MasterSchedule from '@/components/MasterSchedule.vue';

const props = defineProps<{
  proposalId: string | number;
  proposalName: string;
}>();

defineEmits<{ (e: 'close'): void }>();

const activeTab = ref('overview');
const loading = ref(false);
const data = ref<any>(null);
const scheduleItems = ref<any[]>([]);

const tabs = computed(() => [
  { id: 'overview', icon: '📊', label: 'Overview', count: 0 },
  { id: 'material', icon: '🧱', label: 'Material', count: data.value?.materials?.length || 0 },
  { id: 'manpower', icon: '👷', label: 'Manpower', count: data.value?.labor?.length || 0 },
  { id: 'equipment', icon: '🔧', label: 'Equipment', count: data.value?.equipment?.length || 0 },
  { id: 'schedule', icon: '📅', label: 'Master Schedule', count: data.value?.schedule_items?.length || 0 },
]);

const totalDirect = computed(() => {
  if (!data.value?.totals) return 0;
  return data.value.totals.material_cost + data.value.totals.labor_cost + data.value.totals.equipment_cost;
});

const costPct = (type: string) => {
  const total = totalDirect.value || 1;
  if (type === 'material') return (data.value?.totals?.material_cost || 0) / total * 100;
  if (type === 'labor') return (data.value?.totals?.labor_cost || 0) / total * 100;
  if (type === 'equipment') return (data.value?.totals?.equipment_cost || 0) / total * 100;
  return 0;
};

const formatCurrency = (val: number | undefined) => {
  if (!val) return 'Rp 0';
  return 'Rp ' + val.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const fetchResume = async () => {
  loading.value = true;
  try {
    const { data: result } = await api.get(`/estimator/proposals/${props.proposalId}/resume`);
    data.value = result;
    scheduleItems.value = (result.schedule_items || []).map((item: any) => ({
      ...item,
      duration_days: item.duration_days || Math.max(7, Math.ceil(item.qty / 10) * 7),
      start_offset: item.start_offset || 0,
    }));
  } catch (err) {
    console.error('Failed to load resume:', err);
  } finally {
    loading.value = false;
  }
};

const onScheduleUpdate = (items: any[]) => {
  scheduleItems.value = items;
};

onMounted(() => {
  fetchResume();
});
</script>
