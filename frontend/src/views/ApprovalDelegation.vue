<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Approval Delegation</h1>
      <button @click="openCreate" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">+ Create Delegation</button>
    </div>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>

    <!-- Delegations table -->
    <div v-else class="bg-white rounded shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-4 py-3 text-left">From</th>
            <th class="px-4 py-3 text-left">To</th>
            <th class="px-4 py-3 text-left">Module</th>
            <th class="px-4 py-3 text-left">Start Date</th>
            <th class="px-4 py-3 text-left">End Date</th>
            <th class="px-4 py-3 text-center">Status</th>
            <th class="px-4 py-3 text-left">Reason</th>
            <th class="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in store.delegations" :key="d.id" class="border-b hover:bg-gray-50">
            <td class="px-4 py-3">{{ d.from_user_name || '-' }}</td>
            <td class="px-4 py-3">{{ d.to_user_name || '-' }}</td>
            <td class="px-4 py-3">{{ d.module || 'All Modules' }}</td>
            <td class="px-4 py-3">{{ formatDate(d.start_date) }}</td>
            <td class="px-4 py-3">{{ formatDate(d.end_date) }}</td>
            <td class="px-4 py-3 text-center">
              <span :class="d.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'" class="px-2 py-0.5 rounded text-xs font-medium">
                {{ d.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-4 py-3 text-xs text-gray-500 max-w-xs truncate">{{ d.reason || '-' }}</td>
            <td class="px-4 py-3 text-center">
              <button v-if="d.is_active" @click="deactivate(d.id)" class="text-yellow-600 hover:text-yellow-800 text-sm mr-2">Deactivate</button>
              <button @click="remove(d.id)" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
            </td>
          </tr>
          <tr v-if="store.delegations.length === 0">
            <td colspan="8" class="px-4 py-8 text-center text-gray-400">No delegations found</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="showModal = false">
      <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold mb-4">Create Delegation</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">Delegate To</label>
            <select v-model="form.to_user_id" class="w-full border rounded px-3 py-2 text-sm">
              <option :value="null" disabled>Select user...</option>
              <option v-for="u in store.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Module (optional)</label>
            <select v-model="form.module" class="w-full border rounded px-3 py-2 text-sm">
              <option value="">All Modules</option>
              <option v-for="m in modules" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium mb-1">Start Date</label>
              <input type="date" v-model="form.start_date" class="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">End Date</label>
              <input type="date" v-model="form.end_date" class="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Reason</label>
            <textarea v-model="form.reason" rows="2" class="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. On leave..."></textarea>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-4">
          <button @click="showModal = false" class="px-4 py-2 border rounded text-sm">Cancel</button>
          <button @click="saveDelegation" :disabled="!form.to_user_id || !form.start_date || !form.end_date" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { useApprovalStore } from '../stores/approval';

const store = useApprovalStore();
const modules = ['pr', 'po', 'so', 'wo', 'batch_release', 'grn'];
const showModal = ref(false);

const form = reactive({
  to_user_id: null as number | null,
  module: '',
  start_date: '',
  end_date: '',
  reason: '',
});

const formatDate = (d: string) => d ? new Date(d).toLocaleDateString() : '-';

const openCreate = () => {
  form.to_user_id = null;
  form.module = '';
  form.start_date = '';
  form.end_date = '';
  form.reason = '';
  showModal.value = true;
};

const saveDelegation = async () => {
  await store.createDelegation({
    to_user_id: form.to_user_id,
    module: form.module || null,
    start_date: form.start_date,
    end_date: form.end_date,
    reason: form.reason || null,
  });
  showModal.value = false;
};

const deactivate = async (id: number) => {
  if (confirm('Deactivate this delegation?')) {
    await store.deactivateDelegation(id);
  }
};

const remove = async (id: number) => {
  if (confirm('Delete this delegation?')) {
    await store.deleteDelegation(id);
  }
};

onMounted(() => {
  store.fetchDelegations();
  store.fetchUsers();
});
</script>
