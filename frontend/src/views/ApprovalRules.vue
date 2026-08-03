<template>
  <div class="p-6 max-w-7xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">Approval Rules</h1>
      <button @click="openCreate" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700">+ Add Rule</button>
    </div>

    <div v-if="store.loading" class="text-center py-12 text-gray-500">Loading...</div>

    <!-- Rules list -->
    <div v-else class="space-y-4">
      <div v-for="rule in store.rules" :key="rule.id" class="bg-white rounded shadow p-5">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center gap-3 mb-1">
              <h3 class="font-semibold">{{ rule.name }}</h3>
              <span class="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded">{{ rule.module }}</span>
              <span v-if="!rule.is_active" class="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">Inactive</span>
            </div>
            <p class="text-sm text-gray-500">
              <span v-if="rule.condition_field">Condition: {{ rule.condition_field }}</span>
              <span v-if="rule.min_value != null"> &ge; {{ rule.min_value }}</span>
              <span v-if="rule.max_value != null"> &le; {{ rule.max_value }}</span>
              <span v-if="rule.approver_role_name"> &middot; Role: {{ rule.approver_role_name }}</span>
              <span> &middot; Sequence: {{ rule.sequence }}</span>
            </p>
          </div>
          <div class="flex gap-2">
            <button @click="openEdit(rule)" class="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
            <button @click="deleteRule(rule.id)" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
          </div>
        </div>

        <!-- Steps -->
        <div v-if="rule.steps && rule.steps.length" class="mt-3 border-t pt-3">
          <p class="text-xs text-gray-400 mb-2 font-medium">Approval Steps:</p>
          <div class="flex gap-2 flex-wrap">
            <div v-for="step in rule.steps" :key="step.id" class="bg-gray-50 border rounded px-3 py-2 text-xs">
              <span class="font-medium">Step {{ step.step_order }}:</span>
              {{ step.user_name || step.role_name || 'Any' }}
              <span v-if="step.is_parallel" class="text-blue-600 ml-1">(parallel)</span>
              <span v-if="!step.can_reject" class="text-gray-400 ml-1">(no reject)</span>
            </div>
          </div>
        </div>
      </div>

      <div v-if="store.rules.length === 0" class="text-center py-12 text-gray-400 bg-white rounded shadow">
        No approval rules configured
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black/40 flex items-center justify-center z-50" @click.self="showModal = false">
      <div class="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <h3 class="text-lg font-semibold mb-4">{{ editMode ? 'Edit' : 'Add' }} Approval Rule</h3>
        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium mb-1">Name</label>
            <input v-model="form.name" class="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium mb-1">Module</label>
              <select v-model="form.module" class="w-full border rounded px-3 py-2 text-sm">
                <option v-for="m in modules" :key="m" :value="m">{{ m }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Sequence</label>
              <input v-model.number="form.sequence" type="number" min="1" class="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Condition Field</label>
            <input v-model="form.condition_field" placeholder="e.g. amount, quantity" class="w-full border rounded px-3 py-2 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-sm font-medium mb-1">Min Value</label>
              <input v-model.number="form.min_value" type="number" class="w-full border rounded px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="block text-sm font-medium mb-1">Max Value</label>
              <input v-model.number="form.max_value" type="number" class="w-full border rounded px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Approver Role</label>
            <select v-model="form.approver_role_id" class="w-full border rounded px-3 py-2 text-sm">
              <option :value="null">-</option>
              <option v-for="r in store.roles" :key="r.id" :value="r.id">{{ r.name }}</option>
            </select>
          </div>

          <!-- Steps -->
          <div class="border-t pt-3">
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium">Approval Steps</label>
              <button @click="addStep" class="text-blue-600 text-sm hover:underline">+ Add Step</button>
            </div>
            <div v-for="(step, i) in form.steps" :key="i" class="flex items-center gap-2 mb-2">
              <span class="text-xs text-gray-400 w-12">Step {{ step.step_order }}</span>
              <select v-model="step.approver_role_id" class="flex-1 border rounded px-2 py-1 text-sm">
                <option :value="null">Any Role</option>
                <option v-for="r in store.roles" :key="r.id" :value="r.id">{{ r.name }}</option>
              </select>
              <select v-model="step.approver_user_id" class="flex-1 border rounded px-2 py-1 text-sm">
                <option :value="null">Any User</option>
                <option v-for="u in store.users" :key="u.id" :value="u.id">{{ u.full_name }}</option>
              </select>
              <label class="text-xs flex items-center gap-1"><input type="checkbox" v-model="step.is_parallel" /> Parallel</label>
              <button @click="form.steps.splice(i, 1)" class="text-red-500 text-sm">×</button>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-3 mt-4">
          <button @click="showModal = false" class="px-4 py-2 border rounded text-sm">Cancel</button>
          <button @click="saveRule" :disabled="!form.name || !form.module" class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50">Save</button>
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
  name: '',
  module: 'pr',
  condition_field: '',
  min_value: null as number | null,
  max_value: null as number | null,
  approver_role_id: null as number | null,
  sequence: 1,
  is_active: true,
  steps: [] as any[],
});

const form = reactive(defaultForm());

const openCreate = () => {
  Object.assign(form, defaultForm());
  editMode.value = false;
  editId.value = null;
  showModal.value = true;
};

const openEdit = (rule: any) => {
  Object.assign(form, {
    name: rule.name,
    module: rule.module,
    condition_field: rule.condition_field || '',
    min_value: rule.min_value,
    max_value: rule.max_value,
    approver_role_id: rule.approver_role_id,
    sequence: rule.sequence,
    is_active: rule.is_active,
    steps: (rule.steps || []).map((s: any) => ({ ...s })),
  });
  editMode.value = true;
  editId.value = rule.id;
  showModal.value = true;
};

const addStep = () => {
  form.steps.push({
    step_order: form.steps.length + 1,
    approver_role_id: null,
    approver_user_id: null,
    can_reject: true,
    is_parallel: false,
  });
};

const saveRule = async () => {
  const data = { ...form };
  if (editMode.value && editId.value) {
    await store.updateRule(editId.value, data);
  } else {
    await store.createRule(data);
  }
  showModal.value = false;
};

const deleteRule = async (id: number) => {
  if (confirm('Delete this rule?')) {
    await store.deleteRule(id);
  }
};

onMounted(() => {
  store.fetchRules();
  store.fetchRoles();
  store.fetchUsers();
});
</script>
