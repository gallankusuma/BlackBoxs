<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">Production Execution</h2>
          <p class="text-sm text-gray-500 mt-1">Real-time work order tracking and process logging</p>
        </div>
      </div>

      <div v-if="store.loading" class="text-center py-10">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>

      <!-- WO Cards -->
      <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div v-for="wo in store.executionOrders" :key="wo.id"
          class="bg-white rounded-lg shadow border-l-4 p-5"
          :class="borderColor(wo.status)">
          <div class="flex justify-between items-start mb-3">
            <div>
              <h3 class="text-lg font-bold text-gray-900">{{ wo.wo_number || 'WO-' + wo.id }}</h3>
              <p class="text-sm text-gray-600">{{ wo.product_name }} ({{ wo.sku }})</p>
            </div>
            <span :class="statusBadge(wo.status)" class="px-2 py-1 text-xs font-semibold rounded-full">
              {{ wo.status }}
            </span>
          </div>

          <div class="grid grid-cols-3 gap-3 text-sm mb-3">
            <div>
              <p class="text-gray-500">Quantity</p>
              <p class="font-semibold">{{ wo.quantity }}</p>
            </div>
            <div>
              <p class="text-gray-500">Materials</p>
              <p class="font-semibold">{{ wo.materials_ready }}/{{ wo.materials_total }}</p>
            </div>
            <div>
              <p class="text-gray-500">Processes</p>
              <p class="font-semibold">{{ wo.process_count }}</p>
            </div>
          </div>

          <div class="text-xs text-gray-400 mb-3">
            <span v-if="wo.actual_start">Started: {{ formatDateTime(wo.actual_start) }}</span>
            <span v-else>Scheduled: {{ formatDate(wo.scheduled_start) }}</span>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-wrap gap-2">
            <button v-if="wo.status === 'pending' || wo.status === 'planned'"
              @click="doAction('start', wo.id)" class="px-3 py-1.5 bg-green-600 text-white text-xs rounded hover:bg-green-700">
              ▶ Start
            </button>
            <button v-if="wo.status === 'in_progress' || wo.status === 'in-progress'"
              @click="doAction('pause', wo.id)" class="px-3 py-1.5 bg-yellow-600 text-white text-xs rounded hover:bg-yellow-700">
              ⏸ Pause
            </button>
            <button v-if="wo.status === 'on_hold'"
              @click="doAction('resume', wo.id)" class="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
              ▶ Resume
            </button>
            <button v-if="wo.status === 'in_progress' || wo.status === 'in-progress'"
              @click="doAction('complete', wo.id)" class="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700">
              ✓ Complete
            </button>
            <button @click="openLogs(wo.id)" class="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300">
              Process Logs
            </button>
          </div>
        </div>
        <div v-if="!store.executionOrders.length" class="col-span-2 text-center py-12 text-gray-400">
          No active work orders
        </div>
      </div>

      <!-- Process Logs Modal -->
      <div v-if="showLogs" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-bold">Process Logs — WO #{{ selectedWoId }}</h3>
            <button @click="showLogs = false" class="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
          </div>

          <!-- Existing logs -->
          <div v-if="store.processLogs.length" class="space-y-2 mb-4">
            <div v-for="log in store.processLogs" :key="log.id" class="border rounded p-3 text-sm">
              <div class="flex justify-between">
                <span class="font-semibold">{{ log.process_name }}</span>
                <span :class="log.status === 'completed' ? 'text-green-600' : 'text-blue-600'" class="text-xs font-medium">{{ log.status }}</span>
              </div>
              <div class="text-xs text-gray-500 mt-1">
                <span v-if="log.duration_minutes">Duration: {{ log.duration_minutes }} min</span>
                <span v-if="log.recorded_by_name"> | By: {{ log.recorded_by_name }}</span>
              </div>
              <p v-if="log.notes" class="text-xs text-gray-400 mt-1">{{ log.notes }}</p>
            </div>
          </div>
          <p v-else class="text-sm text-gray-400 mb-4">No process logs yet</p>

          <!-- Add log form -->
          <div class="border-t pt-4">
            <h4 class="text-sm font-semibold mb-3">Add Process Log</h4>
            <div class="grid grid-cols-2 gap-3">
              <div class="col-span-2">
                <input v-model="logForm.process_name" placeholder="Process name" class="w-full px-3 py-2 border rounded text-sm" />
              </div>
              <div>
                <label class="text-xs text-gray-500">Start Time</label>
                <input v-model="logForm.start_time" type="datetime-local" class="w-full px-3 py-2 border rounded text-sm" />
              </div>
              <div>
                <label class="text-xs text-gray-500">End Time</label>
                <input v-model="logForm.end_time" type="datetime-local" class="w-full px-3 py-2 border rounded text-sm" />
              </div>
              <div>
                <select v-model="logForm.status" class="w-full px-3 py-2 border rounded text-sm">
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
              <div>
                <input v-model="logForm.notes" placeholder="Notes (optional)" class="w-full px-3 py-2 border rounded text-sm" />
              </div>
            </div>
            <button @click="addLog" class="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
              Add Log
            </button>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useProductionStore } from '../stores/production';

const store = useProductionStore();
const showLogs = ref(false);
const selectedWoId = ref<number>(0);
const logForm = ref({ process_name: '', start_time: '', end_time: '', status: 'in_progress', notes: '' });

onMounted(() => store.fetchExecution());

const doAction = async (action: string, woId: number) => {
  try {
    if (action === 'start') await store.startWO(woId);
    else if (action === 'pause') await store.pauseWO(woId);
    else if (action === 'resume') await store.resumeWO(woId);
    else if (action === 'complete') await store.completeWO(woId);
    await store.fetchExecution();
  } catch (e) { console.error(e); }
};

const openLogs = async (woId: number) => {
  selectedWoId.value = woId;
  await store.fetchProcessLogs(woId);
  logForm.value = { process_name: '', start_time: '', end_time: '', status: 'in_progress', notes: '' };
  showLogs.value = true;
};

const addLog = async () => {
  if (!logForm.value.process_name) return;
  await store.addProcessLog(selectedWoId.value, logForm.value);
  await store.fetchProcessLogs(selectedWoId.value);
  logForm.value = { process_name: '', start_time: '', end_time: '', status: 'in_progress', notes: '' };
};

const formatDate = (d: string | null) => d ? new Date(d).toLocaleDateString() : '-';
const formatDateTime = (d: string | null) => d ? new Date(d).toLocaleString() : '-';

const statusBadge = (s: string) => ({
  pending: 'bg-yellow-100 text-yellow-800', planned: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-blue-100 text-blue-800', 'in-progress': 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800', on_hold: 'bg-gray-100 text-gray-800',
}[s] || 'bg-gray-100 text-gray-800');

const borderColor = (s: string) => ({
  pending: 'border-yellow-400', planned: 'border-indigo-400',
  in_progress: 'border-blue-500', 'in-progress': 'border-blue-500',
  completed: 'border-green-500', on_hold: 'border-gray-400',
}[s] || 'border-gray-300');
</script>
