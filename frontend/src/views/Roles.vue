<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <div>
        <h1 class="text-2xl font-bold text-gray-900">🔐 Roles & Permissions</h1>
        <p class="text-gray-500 text-sm mt-1">Manage roles and configure module access permissions</p>
      </div>
      <div class="flex gap-2">
        <button @click="handleExport" class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2">
          📥 Export
        </button>
        <button @click="openCreateModal" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors flex items-center gap-2">
          + Add Role
        </button>
      </div>
    </div>

    <!-- Roles Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <div v-for="role in roleStore.roles" :key="role.id"
        class="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md transition-shadow p-5">
        <div class="flex items-start justify-between mb-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-white font-black text-sm tracking-wider">
              {{ role.code || '?' }}
            </div>
            <div>
              <h3 class="font-bold text-gray-900">{{ role.name }}</h3>
              <span class="text-xs text-gray-500">Level {{ role.level ?? 0 }}</span>
            </div>
          </div>
          <span :class="role.active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
            class="px-2 py-0.5 rounded-full text-xs font-medium">
            {{ role.active ? 'Active' : 'Inactive' }}
          </span>
        </div>
        <p class="text-sm text-gray-500 mb-4 min-h-[2rem]">{{ role.description || 'No description' }}</p>
        <div class="flex gap-2 border-t pt-3">
          <button @click="openPermissionsModal(role)"
            class="flex-1 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium hover:bg-amber-100 transition-colors flex items-center justify-center gap-1">
            🔑 Permissions
          </button>
          <button @click="openEditModal(role)"
            class="px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
            Edit
          </button>
          <button @click="confirmDelete(role)"
            class="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">
            Delete
          </button>
        </div>
      </div>
      <div v-if="roleStore.roles.length === 0" class="col-span-3 py-16 text-center text-gray-400">
        No roles found. Click "+ Add Role" to create one.
      </div>
    </div>

    <!-- Role Create/Edit Modal -->
    <div v-if="showRoleModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" @click.self="closeRoleModal">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div class="px-6 py-4 border-b flex items-center justify-between bg-slate-50">
          <h2 class="font-bold text-lg text-gray-900">{{ isEditing ? '✏️ Edit Role' : '+ Add Role' }}</h2>
          <button @click="closeRoleModal" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <form @submit.prevent="saveRole" class="p-6 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input v-model="form.code" type="text" placeholder="e.g., MGR" maxlength="10"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent uppercase" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Level</label>
              <input v-model.number="form.level" type="number" min="0" max="10"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input v-model="form.name" type="text" placeholder="e.g., Manager"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea v-model="form.description" rows="2" placeholder="Role description"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" />
          </div>
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="form.active" type="checkbox" class="w-4 h-4 text-blue-600 rounded" />
            <span class="text-sm font-medium text-gray-700">Active</span>
          </label>
          <p v-if="formError" class="text-sm text-red-600">{{ formError }}</p>
          <div class="flex justify-end gap-3 pt-2 border-t">
            <button type="button" @click="closeRoleModal" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" :disabled="saving" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Permissions Modal -->
    <div v-if="showPermModal" class="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div class="flex justify-between items-center px-6 py-4 border-b bg-slate-800 rounded-t-xl">
          <div>
            <h2 class="text-lg font-bold text-white">🔑 Permissions — <span class="text-amber-400">{{ permRole?.name }}</span></h2>
            <p class="text-slate-400 text-xs mt-0.5">Centang modul dan aksi yang dapat diakses oleh role ini</p>
          </div>
          <button @click="closePermModal" class="text-slate-400 hover:text-white text-2xl">&times;</button>
        </div>

        <div class="px-6 py-3 border-b bg-gray-50 flex items-center justify-between flex-shrink-0">
          <div class="flex items-center gap-4">
            <button @click="selectAll" class="text-xs text-blue-600 hover:text-blue-800 font-medium">✓ Select All</button>
            <button @click="deselectAll" class="text-xs text-red-600 hover:text-red-800 font-medium">✗ Deselect All</button>
            <span class="text-xs text-gray-500 bg-white border rounded px-2 py-0.5">{{ selectedCount }} / {{ totalCount }} selected</span>
          </div>
        </div>

        <div class="overflow-auto flex-1 px-6 py-4">
          <table class="w-full text-sm">
            <thead class="sticky top-0 bg-white z-10">
              <tr class="border-b-2 border-gray-200">
                <th class="text-left py-3 px-3 font-semibold text-gray-700 w-52">Module / Sub-menu</th>
                <th v-for="action in allActions" :key="action" class="text-center py-3 px-2 font-semibold text-gray-700 w-20">
                  <div class="flex flex-col items-center gap-1">
                    <span class="capitalize text-xs">{{ action }}</span>
                    <button @click="toggleColumn(action)" class="text-[10px] text-blue-500 hover:text-blue-700 bg-blue-50 rounded px-1">All</button>
                  </div>
                </th>
                <th class="text-center py-3 px-2 font-semibold text-gray-700 w-20">Row</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <template v-for="(subModules, menuName) in groupedPermissions" :key="menuName">
                <tr class="bg-slate-800/5 border-y border-slate-200">
                  <td :colspan="allActions.length + 2" class="py-2 px-3 font-bold text-slate-700 text-sm">
                    {{ moduleIcons[menuName as string] || '📁' }} {{ menuName }}
                  </td>
                </tr>
                <tr v-for="(_perms, subMenuName) in subModules" :key="subMenuName" class="hover:bg-blue-50/30 transition-colors">
                  <td class="py-2.5 px-3 pl-8 text-gray-700">{{ subMenuName }}</td>
                  <td v-for="action in allActions" :key="action" class="text-center py-2.5 px-2">
                    <label v-if="getPermission(menuName as string, subMenuName as string, action)" class="inline-flex items-center justify-center cursor-pointer">
                      <input type="checkbox"
                        :checked="selectedPermIds.has(getPermission(menuName as string, subMenuName as string, action)!.id)"
                        @change="togglePerm(getPermission(menuName as string, subMenuName as string, action)!.id)"
                        class="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer" />
                    </label>
                    <span v-else class="text-gray-300 text-xs">—</span>
                  </td>
                  <td class="text-center py-2.5 px-2">
                    <button @click="toggleRow(menuName as string, subMenuName as string)"
                      class="text-xs px-2 py-0.5 rounded font-medium transition-colors"
                      :class="isRowFullySelected(menuName as string, subMenuName as string) ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'">
                      {{ isRowFullySelected(menuName as string, subMenuName as string) ? '✓' : 'All' }}
                    </button>
                  </td>
                </tr>
              </template>
              <tr v-if="allPermissions.length === 0">
                <td :colspan="allActions.length + 2" class="py-8 text-center text-gray-400">No permissions data found</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="px-6 py-4 border-t bg-gray-50 flex justify-between items-center rounded-b-xl flex-shrink-0">
          <span class="text-sm text-gray-500"><strong class="text-gray-800">{{ selectedCount }}</strong> permissions akan di-assign</span>
          <div class="flex gap-3">
            <button @click="closePermModal" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
            <button @click="savePermissions" :disabled="savingPerms" class="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium">
              {{ savingPerms ? 'Saving...' : '💾 Save Permissions' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation -->
    <div v-if="showDeleteConfirm" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 class="text-lg font-bold text-gray-900">🗑️ Delete Role</h3>
        <p class="text-gray-600">Hapus role <strong>{{ deleteTarget?.name }}</strong>? Semua permission assignment untuk role ini akan ikut terhapus.</p>
        <div class="flex justify-end gap-3">
          <button @click="showDeleteConfirm = false" class="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button>
          <button @click="doDelete" class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium">Hapus</button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div v-if="toast" class="fixed bottom-4 right-4 z-50 animate-fade-in">
      <div :class="toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'"
        class="text-white px-5 py-3 rounded-lg shadow-lg flex items-center gap-2">
        {{ toast.type === 'success' ? '✅' : '❌' }} {{ toast.message }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoleStore } from '../stores/roles';
import { api } from '../lib/api';

interface Permission {
  id: number;
  resource: string;
  action: string;
  module: string;
  name: string;
  description: string;
}

const roleStore = useRoleStore();

// Role form
const showRoleModal = ref(false);
const isEditing     = ref(false);
const editingId     = ref<number | null>(null);
const saving        = ref(false);
const formError     = ref('');
const form = reactive({ code: '', name: '', description: '', level: 1, active: true });

// Permissions modal
const showPermModal   = ref(false);
const permRole        = ref<any>(null);
const allPermissions  = ref<Permission[]>([]);
const selectedPermIds = ref<Set<number>>(new Set());
const savingPerms     = ref(false);

// Delete
const showDeleteConfirm = ref(false);
const deleteTarget      = ref<any>(null);

// Toast
const toast = ref<{ type: string; message: string } | null>(null);

const moduleIcons: Record<string, string> = {
  'Estimator':   '🧮',
  'Project':     '📌',
  'Procurement': '🛒',
  'HR':          '👷',
  'Finance':     '💳',
  'Master Data': '📦',
  'Admin':       '⚙️',
  'Dashboard':   '📊',
  'Approval':    '✅',
  'Reports':     '📈',
};

const allActions = ['view', 'create', 'edit', 'delete', 'approve', 'export'];

const groupedPermissions = computed(() => {
  const grouped: Record<string, Record<string, Permission[]>> = {};
  for (const p of allPermissions.value) {
    const mod = p.module || p.resource;
    const parts = mod.split(' - ');
    const menuName    = parts[0]?.trim() || 'Other';
    const subMenuName = parts.slice(1).join(' - ')?.trim() || 'General';
    if (!grouped[menuName]) grouped[menuName] = {};
    if (!grouped[menuName][subMenuName]) grouped[menuName][subMenuName] = [];
    grouped[menuName][subMenuName].push(p);
  }
  return grouped;
});

const totalCount    = computed(() => allPermissions.value.length);
const selectedCount = computed(() => selectedPermIds.value.size);

const getPermission = (menuName: string, subMenuName: string, action: string) =>
  (groupedPermissions.value[menuName]?.[subMenuName] || []).find(p => p.action === action);

const isRowFullySelected = (menuName: string, subMenuName: string) => {
  const perms = groupedPermissions.value[menuName]?.[subMenuName] || [];
  return perms.length > 0 && perms.every(p => selectedPermIds.value.has(p.id));
};

const togglePerm = (id: number) => {
  const s = new Set(selectedPermIds.value);
  s.has(id) ? s.delete(id) : s.add(id);
  selectedPermIds.value = s;
};

const toggleRow = (menuName: string, subMenuName: string) => {
  const perms = groupedPermissions.value[menuName]?.[subMenuName] || [];
  const allSel = perms.every(p => selectedPermIds.value.has(p.id));
  const s = new Set(selectedPermIds.value);
  for (const p of perms) allSel ? s.delete(p.id) : s.add(p.id);
  selectedPermIds.value = s;
};

const toggleColumn = (action: string) => {
  const perms = allPermissions.value.filter(p => p.action === action);
  const allSel = perms.every(p => selectedPermIds.value.has(p.id));
  const s = new Set(selectedPermIds.value);
  for (const p of perms) allSel ? s.delete(p.id) : s.add(p.id);
  selectedPermIds.value = s;
};

const selectAll   = () => { selectedPermIds.value = new Set(allPermissions.value.map(p => p.id)); };
const deselectAll = () => { selectedPermIds.value = new Set(); };

const showToast = (type: string, message: string) => {
  toast.value = { type, message };
  setTimeout(() => { toast.value = null; }, 3000);
};

const fetchPermissions = async () => {
  try {
    const res = await api.get('/permissions');
    allPermissions.value = res.data.data || [];
  } catch (e) { console.error(e); }
};

const fetchRolePermissions = async (roleId: number) => {
  try {
    const res = await api.get(`/roles/${roleId}`);
    selectedPermIds.value = new Set((res.data.data?.permissions || []).map((p: any) => p.id));
  } catch { selectedPermIds.value = new Set(); }
};

// Role CRUD
const openCreateModal = () => {
  isEditing.value = false; editingId.value = null; formError.value = '';
  Object.assign(form, { code: '', name: '', description: '', level: 1, active: true });
  showRoleModal.value = true;
};
const openEditModal = (role: any) => {
  isEditing.value = true; editingId.value = role.id; formError.value = '';
  Object.assign(form, { code: role.code || '', name: role.name, description: role.description || '', level: role.level ?? 1, active: !!role.active });
  showRoleModal.value = true;
};
const closeRoleModal = () => { showRoleModal.value = false; };

const saveRole = async () => {
  formError.value = '';
  if (!form.code.trim() || !form.name.trim()) { formError.value = 'Code dan Name wajib diisi'; return; }
  saving.value = true;
  try {
    if (isEditing.value && editingId.value) {
      await roleStore.updateRole(editingId.value, { ...form });
      showToast('success', 'Role berhasil diupdate');
    } else {
      await roleStore.createRole({ ...form });
      showToast('success', 'Role berhasil dibuat');
    }
    closeRoleModal();
  } catch (e: any) {
    showToast('error', e.response?.data?.error || 'Gagal menyimpan role');
  } finally { saving.value = false; }
};

const confirmDelete = (role: any) => {
  if (role.code === 'ADM') { showToast('error', 'Admin role tidak bisa dihapus'); return; }
  deleteTarget.value = role; showDeleteConfirm.value = true;
};
const doDelete = async () => {
  if (!deleteTarget.value) return;
  try {
    await roleStore.deleteRole(deleteTarget.value.id);
    showToast('success', 'Role dihapus');
  } catch (e: any) { showToast('error', e.response?.data?.error || 'Gagal menghapus'); }
  showDeleteConfirm.value = false; deleteTarget.value = null;
};

// Permissions modal
const openPermissionsModal = async (role: any) => {
  permRole.value = role; selectedPermIds.value = new Set(); showPermModal.value = true;
  await fetchRolePermissions(role.id);
};
const closePermModal = () => { showPermModal.value = false; permRole.value = null; };

const savePermissions = async () => {
  if (!permRole.value) return;
  savingPerms.value = true;
  try {
    await roleStore.assignPermissions(permRole.value.id, Array.from(selectedPermIds.value));
    showToast('success', `Permissions disimpan untuk ${permRole.value.name}`);
    closePermModal();
  } catch (e: any) {
    showToast('error', e.response?.data?.error || 'Gagal menyimpan permissions');
  } finally { savingPerms.value = false; }
};

onMounted(async () => {
  await Promise.all([roleStore.fetchRoles(), fetchPermissions()]);
});

function handleExport() { exportToCSV(roleStore.roles, 'Roles_Export'); }
</script>

<style scoped>
@keyframes fade-in {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.animate-fade-in { animation: fade-in 0.2s ease-out; }
</style>
