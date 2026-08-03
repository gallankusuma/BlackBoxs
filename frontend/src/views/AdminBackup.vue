<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Backup & Restore</h1>

    <!-- Backup Status -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div class="bg-white rounded shadow p-5">
        <p class="text-xs text-gray-400 uppercase">Last Backup</p>
        <p class="text-lg font-bold mt-1">{{ lastBackup || 'Never' }}</p>
      </div>
      <div class="bg-white rounded shadow p-5">
        <p class="text-xs text-gray-400 uppercase">Backup Size</p>
        <p class="text-lg font-bold mt-1">{{ lastBackupSize || '-' }}</p>
      </div>
      <div class="bg-white rounded shadow p-5">
        <p class="text-xs text-gray-400 uppercase">Auto-Backup</p>
        <p class="text-lg font-bold mt-1" :class="autoBackup ? 'text-green-600' : 'text-gray-400'">
          {{ autoBackup ? 'Enabled' : 'Disabled' }}
        </p>
      </div>
    </div>

    <!-- Manual Backup -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">Manual Backup</h3>
      <p class="text-sm text-gray-500 mb-4">Create a full database backup now. This includes all tables, configurations, and transaction data.</p>
      <div class="flex gap-3">
        <button @click="createBackup('full')" :disabled="backupInProgress"
          class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">
          {{ backupInProgress ? 'Creating...' : 'Full Backup' }}
        </button>
        <button @click="createBackup('data')" :disabled="backupInProgress"
          class="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50">
          Data Only
        </button>
        <button @click="createBackup('schema')" :disabled="backupInProgress"
          class="bg-purple-600 text-white px-4 py-2 rounded text-sm hover:bg-purple-700 disabled:opacity-50">
          Schema Only
        </button>
      </div>
    </div>

    <!-- Auto-Backup Schedule -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">Auto-Backup Schedule</h3>
      <div class="grid grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Enable Auto-Backup</label>
          <label class="relative inline-flex items-center cursor-pointer mt-1">
            <input type="checkbox" v-model="autoBackup" class="sr-only peer" @change="saveSchedule" />
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Frequency</label>
          <select v-model="scheduleFrequency" class="w-full border rounded px-3 py-2 text-sm" @change="saveSchedule">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Time</label>
          <input type="time" v-model="scheduleTime" class="w-full border rounded px-3 py-2 text-sm" @change="saveSchedule" />
        </div>
      </div>
      <div class="mt-4">
        <label class="block text-sm font-medium mb-1">Retention Period</label>
        <select v-model="retentionDays" class="border rounded px-3 py-2 text-sm" @change="saveSchedule">
          <option :value="7">7 days</option>
          <option :value="14">14 days</option>
          <option :value="30">30 days</option>
          <option :value="60">60 days</option>
          <option :value="90">90 days</option>
        </select>
      </div>
    </div>

    <!-- Backup History -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">Backup History</h3>
      <table v-if="backupHistory.length" class="w-full text-sm">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-3 py-2 text-left">Date</th>
            <th class="px-3 py-2 text-left">Type</th>
            <th class="px-3 py-2 text-left">Size</th>
            <th class="px-3 py-2 text-left">Status</th>
            <th class="px-3 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="b in backupHistory" :key="b.id" class="border-t">
            <td class="px-3 py-2">{{ b.date }}</td>
            <td class="px-3 py-2 capitalize">{{ b.type }}</td>
            <td class="px-3 py-2">{{ b.size }}</td>
            <td class="px-3 py-2">
              <span :class="b.status === 'completed' ? 'text-green-600' : 'text-red-600'" class="text-xs font-medium">
                {{ b.status }}
              </span>
            </td>
            <td class="px-3 py-2 flex gap-2">
              <button class="text-blue-600 text-xs hover:underline">Download</button>
              <button @click="restoreBackup(b)" class="text-orange-600 text-xs hover:underline">Restore</button>
              <button @click="deleteBackup(b)" class="text-red-600 text-xs hover:underline">Delete</button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="text-sm text-gray-400 text-center py-4">No backups found</p>
    </div>

    <!-- Restore -->
    <div class="bg-white rounded shadow p-5">
      <h3 class="font-semibold mb-4">Restore from File</h3>
      <p class="text-sm text-gray-500 mb-3">Upload a backup file to restore the database. <span class="text-red-600 font-medium">Warning: This will overwrite current data.</span></p>
      <div class="flex items-center gap-3">
        <input type="file" ref="fileInput" accept=".sql,.gz,.zip" class="text-sm" />
        <button @click="uploadRestore" class="bg-orange-600 text-white px-4 py-2 rounded text-sm hover:bg-orange-700">
          Restore
        </button>
      </div>
    </div>

    <!-- Confirm Restore Modal -->
    <div v-if="restoreTarget" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-full max-w-md">
        <h3 class="font-bold text-lg mb-2 text-red-600">Confirm Restore</h3>
        <p class="text-sm text-gray-600 mb-4">
          Are you sure you want to restore from backup <strong>{{ restoreTarget.date }}</strong>?
          This will overwrite all current data and cannot be undone.
        </p>
        <div class="flex gap-3 justify-end">
          <button @click="restoreTarget = null" class="px-4 py-2 border rounded text-sm">Cancel</button>
          <button @click="confirmRestore" class="bg-red-600 text-white px-4 py-2 rounded text-sm hover:bg-red-700">
            Yes, Restore
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAdminStore } from '../stores/admin';

const store = useAdminStore();

const lastBackup = ref('2025-01-15 02:00');
const lastBackupSize = ref('24.5 MB');
const autoBackup = ref(true);
const scheduleFrequency = ref('daily');
const scheduleTime = ref('02:00');
const retentionDays = ref(30);
const backupInProgress = ref(false);
const restoreTarget = ref<any>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const backupHistory = ref([
  { id: 1, date: '2025-01-15 02:00', type: 'full', size: '24.5 MB', status: 'completed' },
  { id: 2, date: '2025-01-14 02:00', type: 'full', size: '24.3 MB', status: 'completed' },
  { id: 3, date: '2025-01-13 02:00', type: 'full', size: '24.1 MB', status: 'completed' },
]);

const createBackup = (type: string) => {
  backupInProgress.value = true;
  // Simulate backup creation
  setTimeout(() => {
    backupHistory.value.unshift({
      id: Date.now(),
      date: new Date().toLocaleString(),
      type,
      size: '24.7 MB',
      status: 'completed',
    });
    lastBackup.value = new Date().toLocaleString();
    backupInProgress.value = false;
    alert(`${type} backup created successfully`);
  }, 2000);
};

const saveSchedule = () => {
  store.updateSetting('backup_auto', autoBackup.value ? 'true' : 'false').catch(() => {});
  store.updateSetting('backup_frequency', scheduleFrequency.value).catch(() => {});
  store.updateSetting('backup_time', scheduleTime.value).catch(() => {});
  store.updateSetting('backup_retention', String(retentionDays.value)).catch(() => {});
};

const restoreBackup = (b: any) => {
  restoreTarget.value = b;
};

const confirmRestore = () => {
  alert('Restore started from: ' + restoreTarget.value.date);
  restoreTarget.value = null;
};

const deleteBackup = (b: any) => {
  if (confirm('Delete this backup?')) {
    backupHistory.value = backupHistory.value.filter(x => x.id !== b.id);
  }
};

const uploadRestore = () => {
  const file = fileInput.value?.files?.[0];
  if (!file) { alert('Please select a backup file'); return; }
  if (!confirm('This will overwrite current data. Continue?')) return;
  alert('Restore from uploaded file started: ' + file.name);
};
</script>
