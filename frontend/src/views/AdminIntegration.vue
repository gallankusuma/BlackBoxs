<template>
  <div class="p-6 max-w-7xl mx-auto">
    <h1 class="text-2xl font-bold mb-6">Integrations</h1>

    <!-- Active Integrations -->
    <div class="grid grid-cols-3 gap-4 mb-6">
      <div v-for="integ in integrations" :key="integ.key"
        class="bg-white rounded shadow p-5 border-l-4"
        :class="integ.enabled ? 'border-green-500' : 'border-gray-300'">
        <div class="flex items-center justify-between mb-2">
          <span class="font-semibold">{{ integ.name }}</span>
          <span :class="integ.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'" class="text-xs px-2 py-0.5 rounded-full">
            {{ integ.enabled ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <p class="text-xs text-gray-500 mb-3">{{ integ.description }}</p>
        <button @click="toggleInteg(integ)" class="text-sm px-3 py-1 rounded"
          :class="integ.enabled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'">
          {{ integ.enabled ? 'Disable' : 'Enable' }}
        </button>
      </div>
    </div>

    <!-- API Configuration -->
    <div class="bg-white rounded shadow p-5 mb-6">
      <h3 class="font-semibold mb-4">API Configuration</h3>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">API Base URL</label>
            <input v-model="apiConfig.baseUrl" class="w-full border rounded px-3 py-2 text-sm" placeholder="https://api.example.com" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">API Key</label>
            <div class="relative">
              <input :type="showApiKey ? 'text' : 'password'" v-model="apiConfig.apiKey" class="w-full border rounded px-3 py-2 text-sm pr-10" placeholder="Enter API key" />
              <button @click="showApiKey = !showApiKey" class="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                {{ showApiKey ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium mb-1">Timeout (ms)</label>
            <input type="number" v-model.number="apiConfig.timeout" class="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Retry Attempts</label>
            <input type="number" v-model.number="apiConfig.retries" class="w-full border rounded px-3 py-2 text-sm" />
          </div>
        </div>
        <button @click="saveApiConfig" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">Save API Config</button>
      </div>
    </div>

    <!-- Webhook Configuration -->
    <div class="bg-white rounded shadow p-5">
      <h3 class="font-semibold mb-4">Webhooks</h3>
      <div class="space-y-2 mb-4">
        <div v-for="(wh, i) in webhooks" :key="i" class="flex items-center gap-3 border rounded p-3">
          <div class="flex-1">
            <p class="text-sm font-medium">{{ wh.event }}</p>
            <p class="text-xs text-gray-400 truncate">{{ wh.url }}</p>
          </div>
          <span :class="wh.active ? 'text-green-600' : 'text-gray-400'" class="text-xs">
            {{ wh.active ? 'Active' : 'Inactive' }}
          </span>
          <button @click="webhooks.splice(i, 1)" class="text-red-400 text-xs hover:text-red-600">Remove</button>
        </div>
        <p v-if="!webhooks.length" class="text-sm text-gray-400 text-center py-2">No webhooks configured</p>
      </div>

      <div class="border-t pt-4">
        <h4 class="text-sm font-medium mb-2">Add Webhook</h4>
        <div class="grid grid-cols-3 gap-3">
          <select v-model="newWebhook.event" class="border rounded px-3 py-2 text-sm">
            <option value="">Select event</option>
            <option value="approval.created">Approval Created</option>
            <option value="approval.completed">Approval Completed</option>
            <option value="po.created">PO Created</option>
            <option value="grn.received">GRN Received</option>
            <option value="wo.completed">WO Completed</option>
            <option value="inventory.low_stock">Low Stock</option>
          </select>
          <input v-model="newWebhook.url" class="border rounded px-3 py-2 text-sm" placeholder="https://hooks.example.com/..." />
          <button @click="addWebhook" :disabled="!newWebhook.event || !newWebhook.url"
            class="bg-green-600 text-white px-4 py-2 rounded text-sm hover:bg-green-700 disabled:opacity-50">
            Add
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useAdminStore } from '../stores/admin';

const store = useAdminStore();
const showApiKey = ref(false);

const integrations = ref([
  { key: 'email', name: 'Email (SMTP)', description: 'Send email notifications and reports via SMTP server', enabled: false },
  { key: 'accounting', name: 'Accounting Software', description: 'Sync financial data with external accounting system', enabled: false },
  { key: 'ecommerce', name: 'E-Commerce', description: 'Import sales orders from online store', enabled: false },
  { key: 'shipping', name: 'Shipping / Logistics', description: 'Integrate with shipping carriers for tracking', enabled: false },
  { key: 'barcode', name: 'Barcode Scanner', description: 'Enable barcode scanning for inventory operations', enabled: false },
  { key: 'bi_tool', name: 'BI / Analytics', description: 'Export data to business intelligence platform', enabled: false },
]);

const apiConfig = reactive({
  baseUrl: '',
  apiKey: '',
  timeout: 30000,
  retries: 3,
});

const webhooks = ref<Array<{ event: string; url: string; active: boolean }>>([]);
const newWebhook = reactive({ event: '', url: '' });

const toggleInteg = (integ: any) => {
  integ.enabled = !integ.enabled;
  store.updateSetting(`integration_${integ.key}`, integ.enabled ? 'true' : 'false').catch(() => {});
};

const saveApiConfig = () => {
  store.updateSetting('api_base_url', apiConfig.baseUrl).catch(() => {});
  store.updateSetting('api_timeout', String(apiConfig.timeout)).catch(() => {});
  store.updateSetting('api_retries', String(apiConfig.retries)).catch(() => {});
  alert('API configuration saved');
};

const addWebhook = () => {
  if (!newWebhook.event || !newWebhook.url) return;
  webhooks.value.push({ event: newWebhook.event, url: newWebhook.url, active: true });
  newWebhook.event = '';
  newWebhook.url = '';
};
</script>
