<template>
  <div class="space-y-6">
    <h1 class="text-3xl font-bold text-gray-900">Audit Log</h1>

    <!-- Filters -->
    <div class="bg-white rounded-lg shadow p-4 space-y-4">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <input
          v-model="filters.action"
          type="text"
          placeholder="Filter by action"
          class="px-3 py-2 border border-gray-300 rounded"
        />
        <input
          v-model="filters.entity_type"
          type="text"
          placeholder="Filter by entity type"
          class="px-3 py-2 border border-gray-300 rounded"
        />
        <select
          v-model="filters.user_id"
          class="px-3 py-2 border border-gray-300 rounded"
        >
          <option value="">All Users</option>
          <option v-for="user in users" :key="user.id" :value="user.id">
            {{ user.username }}
          </option>
        </select>
        <button
          @click="search"
          class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Search
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-sm font-semibold text-gray-700">From Date</label>
          <input
            v-model="filters.start_date"
            type="datetime-local"
            class="w-full px-3 py-2 border border-gray-300 rounded"
          />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700">To Date</label>
          <input
            v-model="filters.end_date"
            type="datetime-local"
            class="w-full px-3 py-2 border border-gray-300 rounded"
          />
        </div>
      </div>
    </div>

    <!-- Audit Log Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-6 py-3 text-left text-sm font-semibold">Timestamp</th>
            <th class="px-6 py-3 text-left text-sm font-semibold">User</th>
            <th class="px-6 py-3 text-left text-sm font-semibold">Action</th>
            <th class="px-6 py-3 text-left text-sm font-semibold">Entity Type</th>
            <th class="px-6 py-3 text-left text-sm font-semibold">Entity ID</th>
            <th class="px-6 py-3 text-left text-sm font-semibold">Details</th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr v-for="log in logs" :key="log.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDateTime(log.created_at) }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-900">{{ log.username || 'System' }}</td>
            <td class="px-6 py-4 text-sm">
              <span
                :class="{
                  'px-2 py-1 rounded text-xs font-semibold': true,
                  'bg-blue-100 text-blue-800': log.action === 'CREATE',
                  'bg-green-100 text-green-800': log.action === 'UPDATE',
                  'bg-red-100 text-red-800': log.action === 'DELETE',
                  'bg-yellow-100 text-yellow-800': log.action === 'VIEW',
                }"
              >
                {{ log.action }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ log.entity_type || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ log.entity_id || '-' }}</td>
            <td class="px-6 py-4 text-sm">
              <button
                @click="showDetails(log)"
                class="text-blue-600 hover:text-blue-900 font-semibold"
              >
                View
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div class="flex justify-between items-center">
      <div class="text-sm text-gray-600">
        Showing {{ (pagination.page - 1) * pagination.limit + 1 }} to
        {{ Math.min(pagination.page * pagination.limit, pagination.total) }} of
        {{ pagination.total }} logs
      </div>
      <div class="flex gap-2">
        <button
          @click="previousPage"
          :disabled="pagination.page === 1"
          class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Previous
        </button>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600">Page {{ pagination.page }} of {{ pagination.pages }}</span>
        </div>
        <button
          @click="nextPage"
          :disabled="pagination.page >= pagination.pages"
          class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>

    <!-- Details Modal -->
    <div v-if="selectedLog" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div class="bg-white rounded-lg p-6 w-96 max-h-96 overflow-auto">
        <h2 class="text-xl font-bold mb-4">Audit Details</h2>
        <div class="space-y-4 text-sm">
          <div>
            <label class="font-semibold text-gray-700">Timestamp:</label>
            <div class="text-gray-600">{{ formatDateTime(selectedLog.created_at) }}</div>
          </div>
          <div>
            <label class="font-semibold text-gray-700">User:</label>
            <div class="text-gray-600">{{ selectedLog.username || 'System' }}</div>
          </div>
          <div>
            <label class="font-semibold text-gray-700">Action:</label>
            <div class="text-gray-600">{{ selectedLog.action }}</div>
          </div>
          <div>
            <label class="font-semibold text-gray-700">Entity Type:</label>
            <div class="text-gray-600">{{ selectedLog.entity_type || '-' }}</div>
          </div>
          <div>
            <label class="font-semibold text-gray-700">Entity ID:</label>
            <div class="text-gray-600">{{ selectedLog.entity_id || '-' }}</div>
          </div>
          <div v-if="selectedLog.old_values">
            <label class="font-semibold text-gray-700">Old Values:</label>
            <pre class="text-gray-600 text-xs bg-gray-50 p-2 rounded overflow-auto">
{{ JSON.stringify(selectedLog.old_values, null, 2) }}
            </pre>
          </div>
          <div v-if="selectedLog.new_values">
            <label class="font-semibold text-gray-700">New Values:</label>
            <pre class="text-gray-600 text-xs bg-gray-50 p-2 rounded overflow-auto">
{{ JSON.stringify(selectedLog.new_values, null, 2) }}
            </pre>
          </div>
        </div>
        <button
          @click="selectedLog = null"
          class="w-full mt-4 bg-gray-400 text-white px-4 py-2 rounded hover:bg-gray-500"
        >
          Close
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useApi } from '@/lib/api';

interface AuditLog {
  id: number;
  user_id?: number;
  username?: string;
  action: string;
  entity_type?: string;
  entity_id?: number;
  old_values?: any;
  new_values?: any;
  metadata?: any;
  created_at: string;
}

interface User {
  id: number;
  username: string;
}

const { api } = useApi();

const logs = ref<AuditLog[]>([]);
const users = ref<User[]>([]);
const selectedLog = ref<AuditLog | null>(null);

const filters = ref({
  action: '',
  entity_type: '',
  user_id: '',
  start_date: '',
  end_date: '',
  page: 1,
  limit: 50,
});

const pagination = ref({
  page: 1,
  limit: 50,
  total: 0,
  pages: 0,
});

onMounted(async () => {
  await fetchUsers();
  await search();
});

const fetchUsers = async () => {
  try {
    const response = await api.get('/users');
    users.value = response.data;
  } catch (error) {
    console.error('Failed to fetch users:', error);
  }
};

const search = async () => {
  try {
    const response = await api.post('/audit/search', {
      action: filters.value.action || undefined,
      entity_type: filters.value.entity_type || undefined,
      user_id: filters.value.user_id ? parseInt(filters.value.user_id) : undefined,
      start_date: filters.value.start_date || undefined,
      end_date: filters.value.end_date || undefined,
      page: filters.value.page,
      limit: filters.value.limit,
    });

    logs.value = response.data.data;
    pagination.value = response.data.pagination;
  } catch (error) {
    console.error('Failed to search audit logs:', error);
  }
};

const showDetails = (log: AuditLog) => {
  selectedLog.value = log;
};

const nextPage = () => {
  if (pagination.value.page < pagination.value.pages) {
    filters.value.page += 1;
    search();
  }
};

const previousPage = () => {
  if (pagination.value.page > 1) {
    filters.value.page -= 1;
    search();
  }
};

const formatDateTime = (dateTime: string) => {
  return new Date(dateTime).toLocaleString();
};
</script>
