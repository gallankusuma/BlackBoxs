<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Escalation Rules</h1>
      <button @click="openCreate" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">+ Add Escalation Rule</button>
    </div>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>

    <!-- Escalation rules table -->
    <div v-else class="bg-white rounded shadow overflow-x-auto">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 border-b">
          <tr>
            <th class="px-4 py-3 text-left">Module</th>
            <th class="px-4 py-3 text-center">Hours Threshold</th>
            <th class="px-4 py-3 text-left">Escalate To</th>
            <th class="px-4 py-3 text-center">Notify Requester</th>
            <th class="px-4 py-3 text-center">Notify Admin</th>
            <th class="px-4 py-3 text-center">Active</th>
            <th class="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in store.escalations" :key="e.id" class="border-b hover:bg-gray-50">
            <td class="px-4 py-3">
              <span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">{{ e.module }}</span>
            </td>
            <td class="px-4 py-3 text-center font-medium">{{ e.hours_threshold }}h</td>
            <td class="px-4 py-3">{{ e.escalate_to_name || 'N/A' }}</td>
            <td class="px-4 py-3 text-center">
              <span :class="e.notify_requester ? 'text-green-600' : 'text-gray-400'">{{ e.notify_requester ? 'Yes' : 'No' }}</span>
            </td>
            <td class="px-4 py-3 text-center">
              <span :class="e.notify_admin ? 'text-green-600' : 'text-gray-400'">{{ e.notify_admin ? 'Yes' : 'No' }}</span>
            </td>
            <td class="px-4 py-3 text-center">
              <span :class="e.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'" class="px-2 py-0.5 rounded text-xs font-medium">
                {{ e.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-4 py-3 text-center space-x-2">
              <button @click="openEdit(e)" class="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
              <button @click="remove(e.id)" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
            </td>
          </tr>
          <tr v-if="store.escalations.length === 0">
            <td colspan="7" class="px-4 py-8 text-center text-gray-400">No escalation rules configured</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="showModal = false">
      <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
        <h3 class="text-lg font-semibold mb-4">{{ editMode ? 'Edit' : 'Add' }} Escalation Rule</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">Module</label>
            <select v-model="form.module" class="w-full border rounded px-3 py-2 text-sm">
              <option v-for="m in modules" :key="m" :value="m">{{ m }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Hours Threshold</label>
            <input v-model.number="form.hours_threshold" type="number" min="1" class="w-full border rounded px-3 py-2 text-sm" placeholder="e.g. 24" />
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Escalate To User</label>
            <select v-model="form.escalate_to_user_id" class="w-full border rounded px-3 py-2 text-sm">
              <option :value="null">-</option>
              <option v-for="u in store.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Escalate To Role</label>
            <select v-model="form.escalate_to_role_id" class="w-full border rounded px-3 py-2 text-sm">
              <option :value="null">-</option>
              <option v-for="r in store.roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </div>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="form.notify_requester" /> Notify Requester
            </label>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="form.notify_admin" /> Notify Admin
            </label>
          </div>
          <div>
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" v-model="form.is_active" /> Active
            </label>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-4">
          <button @click="showModal = false" class="px-4 py-2 border rounded text-sm">Cancel</button>
          <button @click="save" :disabled="!form.module || !form.hours_threshold" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">Save</button>
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
const editMode = ref(false);
const editId = ref<number | null>(null);

const defaultForm = () => ({
  module: 'pr',
  hours_threshold: 24,
  escalate_to_user_id: null as number | null,
  escalate_to_role_id: null as number | null,
  notify_requester: true,
  notify_admin: true,
  is_active: true,
});

const form = reactive(defaultForm());

const openCreate = () => {
  Object.assign(form, defaultForm());
  editMode.value = false;
  editId.value = null;
  showModal.value = true;
};

const openEdit = (e: any) => {
  Object.assign(form, {
    module: e.module,
    hours_threshold: e.hours_threshold,
    escalate_to_user_id: e.escalate_to_user_id,
    escalate_to_role_id: e.escalate_to_role_id,
    notify_requester: !!e.notify_requester,
    notify_admin: !!e.notify_admin,
    is_active: !!e.is_active,
  });
  editMode.value = true;
  editId.value = e.id;
  showModal.value = true;
};

const save = async () => {
  if (editMode.value && editId.value) {
    await store.updateEscalation(editId.value, { ...form });
  } else {
    await store.createEscalation({ ...form });
  }
  showModal.value = false;
};

const remove = async (id: number) => {
  if (confirm('Delete this escalation rule?')) {
    await store.deleteEscalation(id);
  }
};

onMounted(() => {
  store.fetchEscalations();
  store.fetchUsers();
  store.fetchRoles();
});
</script>
