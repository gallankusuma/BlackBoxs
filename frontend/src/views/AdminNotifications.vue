<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Notification Settings</h1>

    <!-- Current notifications -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold">Recent Notifications</h3>
        <div class="flex gap-2">
          <button @click="loadNotifications()" class="text-blue-600 text-sm hover:underline">Refresh</button>
        </div>
      </div>

      <div v-if="store.loading" class="text-center py-8 text-gray-500">Loading...</div>

      <div v-else-if="store.notifications.length" class="space-y-2">
        <div v-for="n in store.notifications" :key="n.id" 
          :class="n.is_read ? 'bg-gray-50' : 'bg-blue-50 border-l-4 border-blue-500'"
          class="rounded px-4 py-3 flex items-start justify-between">
          <div>
            <p class="text-sm" :class="n.is_read ? 'text-gray-600' : 'font-medium'">{{ n.message || n.title }}</p>
            <p class="text-xs text-gray-400 mt-0.5">{{ n.type || 'System' }} · {{ formatDate(n.created_at) }}</p>
          </div>
          <span v-if="!n.is_read" class="w-2 h-2 bg-blue-500 rounded-full mt-1"></span>
        </div>
      </div>
      <p v-else class="text-sm text-gray-400 text-center py-4">No notifications</p>
    </div>

    <!-- Notification Preferences -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">Notification Preferences</h3>
      <div class="space-y-4">
        <div v-for="pref in preferences" :key="pref.key" class="flex items-center justify-between border-b pb-3">
          <div>
            <p class="text-sm font-medium">{{ pref.label }}</p>
            <p class="text-xs text-gray-400">{{ pref.description }}</p>
          </div>
          <label class="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" v-model="pref.enabled" class="sr-only peer" @change="savePref(pref)" />
            <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-blue-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
          </label>
        </div>
      </div>
    </div>

    <!-- Email Configuration -->
    <div class="bg-white rounded shadow p-5">
      <h3 class="font-semibold mb-4">Email Notification Settings</h3>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Notification Email</label>
          <input v-model="emailConfig.email" class="w-full border rounded px-3 py-2 text-sm" placeholder="admin@company.com" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Digest Frequency</label>
          <select v-model="emailConfig.frequency" class="w-full border rounded px-3 py-2 text-sm">
            <option value="immediate">Immediate</option>
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
      </div>
      <button @click="saveEmailConfig" class="mt-4 bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Save Email Settings</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useAdminStore } from '../stores/admin';

const store = useAdminStore();

const preferences = ref([
  { key: 'approval_pending', label: 'Approval Requests', description: 'Notify when a new approval request is assigned to you', enabled: true },
  { key: 'approval_completed', label: 'Approval Decisions', description: 'Notify when your request is approved or rejected', enabled: true },
  { key: 'low_stock', label: 'Low Stock Alerts', description: 'Notify when inventory falls below minimum level', enabled: true },
  { key: 'wo_completed', label: 'Work Order Completion', description: 'Notify when a work order is completed', enabled: false },
  { key: 'po_received', label: 'PO Goods Received', description: 'Notify when goods are received against a PO', enabled: false },
  { key: 'escalation', label: 'Escalation Alerts', description: 'Notify when an approval is escalated', enabled: true },
]);

const emailConfig = reactive({
  email: '',
  frequency: 'daily',
});

const formatDate = (d: string) => d ? new Date(d).toLocaleString() : '-';

const loadNotifications = () => store.fetchNotifications();

const savePref = (pref: any) => {
  // Save to settings backend
  store.updateSetting(`notification_${pref.key}`, pref.enabled ? 'true' : 'false').catch(() => {});
};

const saveEmailConfig = () => {
  store.updateSetting('notification_email', emailConfig.email).catch(() => {});
  store.updateSetting('notification_frequency', emailConfig.frequency).catch(() => {});
  alert('Email settings saved');
};

onMounted(() => {
  loadNotifications();
});
</script>
