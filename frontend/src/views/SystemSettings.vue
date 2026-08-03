<template>
  <div class="space-y-6">
    <h1 class="text-3xl font-bold text-gray-900">System Settings</h1>

    <!-- Tabs for Categories -->
    <div class="border-b border-gray-200 flex gap-8 overflow-x-auto">
      <button
        v-for="category in categories"
        :key="category"
        @click="selectedCategory = category"
        :class="{
          'pb-4 px-2 font-semibold border-b-2 whitespace-nowrap': true,
          'border-blue-600 text-blue-600': selectedCategory === category,
          'border-transparent text-gray-500 hover:text-gray-700': selectedCategory !== category,
        }"
      >
        {{ formatCategory(category) }}
      </button>
    </div>

    <!-- Settings for Selected Category -->
    <div class="bg-white rounded-lg shadow p-6 space-y-6">
      <div v-for="setting in categorySettings" :key="setting.id" class="border-b pb-6">
        <div class="flex justify-between items-start mb-2">
          <div>
            <h3 class="font-semibold text-gray-900">{{ setting.setting_key }}</h3>
            <p class="text-sm text-gray-500 mt-1">{{ setting.description }}</p>
          </div>
        </div>
        <div class="flex items-center gap-4">
          <input
            v-if="setting.data_type === 'string'"
            v-model="editValues[setting.id]"
            type="text"
            class="flex-1 px-3 py-2 border border-gray-300 rounded"
          />
          <input
            v-else-if="setting.data_type === 'integer'"
            v-model.number="editValues[setting.id]"
            type="number"
            class="flex-1 px-3 py-2 border border-gray-300 rounded"
          />
          <input
            v-else-if="setting.data_type === 'decimal'"
            v-model.number="editValues[setting.id]"
            type="number"
            step="0.01"
            class="flex-1 px-3 py-2 border border-gray-300 rounded"
          />
          <select
            v-else-if="setting.data_type === 'boolean'"
            v-model="editValues[setting.id]"
            class="flex-1 px-3 py-2 border border-gray-300 rounded"
          >
            <option :value="true">True</option>
            <option :value="false">False</option>
          </select>
          <textarea
            v-else-if="setting.data_type === 'json'"
            v-model="editValues[setting.id]"
            class="flex-1 px-3 py-2 border border-gray-300 rounded"
            rows="3"
          ></textarea>
          <button
            @click="saveSetting(setting.setting_key)"
            class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>

      <div v-if="categorySettings.length === 0" class="text-center text-gray-500 py-8">
        No settings found in this category
      </div>
    </div>

    <!-- KPI Dashboard Section -->
    <div v-if="selectedCategory === 'dashboard'" class="space-y-6">
      <h2 class="text-2xl font-bold text-gray-900 mt-8">KPI Dashboard</h2>

      <!-- Overview Cards -->
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-gray-500 text-sm font-semibold">Total Work Orders</div>
          <div class="text-3xl font-bold text-gray-900 mt-2">{{ overview.production?.total_orders || 0 }}</div>
          <div class="text-xs text-green-600 mt-2">
            {{ overview.production?.completed || 0 }} completed
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-gray-500 text-sm font-semibold">Low Stock Items</div>
          <div class="text-3xl font-bold text-red-600 mt-2">
            {{ overview.inventory?.low_stock_count || 0 }}
          </div>
          <div class="text-xs text-gray-600 mt-2">
            / {{ overview.inventory?.total_items || 0 }} total
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-gray-500 text-sm font-semibold">Sales This Month</div>
          <div class="text-3xl font-bold text-blue-600 mt-2">
            {{ overview.sales?.total_orders || 0 }} orders
          </div>
          <div class="text-xs text-green-600 mt-2">
            {{ formatCurrency(overview.sales?.total_revenue) }}
          </div>
        </div>

        <div class="bg-white rounded-lg shadow p-6">
          <div class="text-gray-500 text-sm font-semibold">Pending Approvals</div>
          <div class="text-3xl font-bold text-yellow-600 mt-2">
            {{ overview.approvals?.pending_count || 0 }}
          </div>
        </div>
      </div>

      <!-- Production KPI -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-xl font-bold mb-4">Production Status</h3>
        <div class="space-y-3">
          <div v-for="stat in productionStats" :key="stat.status" class="flex items-center justify-between">
            <span class="text-gray-700">{{ stat.status }}</span>
            <div class="flex items-center gap-4">
              <div class="w-32 bg-gray-200 rounded-full h-2">
                <div
                  :class="{
                    'h-full rounded-full': true,
                    'bg-green-500': stat.status === 'completed',
                    'bg-blue-500': stat.status === 'in_progress',
                    'bg-yellow-500': stat.status === 'pending',
                  }"
                  :style="{ width: productionTotal > 0 ? (stat.count / productionTotal) * 100 + '%' : '0%' }"
                ></div>
              </div>
              <span class="font-semibold w-16 text-right">{{ stat.count }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quality KPI -->
      <div class="bg-white rounded-lg shadow p-6">
        <h3 class="text-xl font-bold mb-4">QC Results Summary</h3>
        <div class="space-y-3">
          <div v-for="stat in qualityStats" :key="stat.result_status" class="flex items-center justify-between">
            <span class="text-gray-700">{{ stat.result_status }}</span>
            <span class="font-semibold">{{ stat.count }} tests</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useApi } from '@/lib/api';
import { formatCurrency } from '@/utils/format';

interface Setting {
  id: number;
  setting_key: string;
  setting_value: string;
  category: string;
  description?: string;
  data_type: string;
}

const { api } = useApi();

const selectedCategory = ref('general');
const categories = ref<string[]>(['general', 'approval', 'finance', 'inventory', 'production', 'dashboard']);
const allSettings = ref<Setting[]>([]);
const editValues = ref<Record<number, any>>({});

const overview = ref<any>({});
const productionStats = ref<any[]>([]);
const qualityStats = ref<any[]>([]);
const productionTotal = computed(() =>
  productionStats.value.reduce((sum, stat) => sum + stat.count, 0)
);

const categorySettings = computed(() =>
  allSettings.value.filter((s) => s.category === selectedCategory.value)
);

onMounted(async () => {
  await fetchSettings();
  await fetchKpiDashboard();
});

const fetchSettings = async () => {
  try {
    const response = await api.get('/settings/all');
    allSettings.value = response.data;

    // Initialize edit values
    allSettings.value.forEach((setting) => {
      editValues.value[setting.id] = setting.setting_value;
    });
  } catch (error) {
    console.error('Failed to fetch settings:', error);
  }
};

const fetchKpiDashboard = async () => {
  try {
    const [overviewRes, productionRes, qualityRes] = await Promise.all([
      api.get('/settings/dashboard/overview'),
      api.get('/settings/dashboard/production'),
      api.get('/settings/dashboard/quality'),
    ]);

    overview.value = overviewRes.data;
    productionStats.value = productionRes.data;
    qualityStats.value = qualityRes.data.summary || [];
  } catch (error) {
    console.error('Failed to fetch KPI dashboard:', error);
  }
};

const saveSetting = async (key: string) => {
  try {
    const setting = allSettings.value.find((s) => s.setting_key === key);
    if (!setting) return;

    await api.put(`/settings/${key}`, {
      setting_value: editValues.value[setting.id],
    });

    // Update the local value
    setting.setting_value = editValues.value[setting.id];
    alert('Setting saved successfully');
  } catch (error) {
    console.error('Failed to save setting:', error);
    alert('Failed to save setting');
  }
};

const formatCategory = (category: string) => {
  return category
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};
</script>
