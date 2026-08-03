<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex justify-between items-center">
      <h1 class="text-3xl font-bold text-gray-900">Users Management</h1>
      <button
          @click="handleExport"
          class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors flex items-center gap-2"
        >
          📥 Export
        </button>
        <button
        @click="openCreateModal"
        class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow transition"
      >
        + Add User
      </button>
    </div>

    <!-- Table -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="w-full">
        <thead class="bg-gray-50 border-b border-gray-200">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Name</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Email</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Department</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Role</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Phone</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Actions</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="user in userStore.users" :key="user.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm text-gray-900 font-medium">{{ user.name }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ user.email }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ user.department_name || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ user.role_name || '-' }}</td>
            <td class="px-6 py-4 text-sm text-gray-600">{{ user.phone || '-' }}</td>
            <td class="px-6 py-4 text-sm">
              <span
                :class="user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'"
                class="px-3 py-1 rounded-full text-xs font-medium"
              >
                {{ user.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm space-x-2">
              <button
                @click="openEditModal(user)"
                class="text-blue-600 hover:text-blue-800 font-medium"
              >
                Edit
              </button>
              <button
                @click="confirmDelete(user.id)"
                class="text-red-600 hover:text-red-800 font-medium"
              >
                Delete
              </button>
            </td>
          </tr>
          <tr v-if="userStore.users.length === 0">
            <td colspan="7" class="px-6 py-8 text-center text-gray-500">
              No users found
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Modal -->
    <div v-if="showModal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-auto">
      <div class="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4 my-8">
        <div class="flex justify-between items-center">
          <h2 class="text-2xl font-bold text-gray-900">
            {{ isEditing ? 'Edit User' : 'Add User' }}
          </h2>
          <button @click="closeModal" class="text-gray-500 hover:text-gray-700 text-2xl">×</button>
        </div>

        <div class="space-y-3">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              v-model="form.name"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Full name"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              v-model="form.email"
              type="email"
              :disabled="isEditing"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">
              {{ isEditing ? 'Password (leave blank to keep current)' : 'Password' }}
            </label>
            <input
              v-model="form.password"
              type="text"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              :placeholder="isEditing ? 'Leave blank to keep unchanged' : '••••••••'"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                v-model.number="form.department_id"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option :value="null">Select Department</option>
                <option v-for="dept in departmentStore.departments" :key="dept.id" :value="dept.id">
                  {{ dept.name }}
                </option>
              </select>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                v-model.number="form.role_id"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option :value="null">Select Role</option>
                <option v-for="role in roleStore.roles" :key="role.id" :value="role.id">
                  {{ role.name }}
                </option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                v-model="form.phone"
                type="tel"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="+62812345678"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">User Level</label>
              <input
                v-model.number="form.user_level"
                type="number"
                min="0"
                max="5"
                class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0-5"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea
              v-model="form.address"
              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Street address"
              rows="2"
            />
          </div>

          <div>
            <label class="flex items-center space-x-2">
              <input
                v-model="form.is_active"
                type="checkbox"
                class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span class="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>
        </div>

        <div class="flex gap-3 justify-end pt-4 border-t border-gray-200">
          <button
            @click="closeModal"
            class="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            @click="saveUser"
            :disabled="!form.name || !form.email || !form.department_id || !form.role_id || userStore.loading"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {{ userStore.loading ? 'Saving...' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { exportToCSV } from '../utils/export';
import { ref, reactive, onMounted } from 'vue';
import { useUserStore } from '../stores/users';
import { useDepartmentStore } from '../stores/departments';
import { useRoleStore } from '../stores/roles';

const userStore = useUserStore();
const departmentStore = useDepartmentStore();
const roleStore = useRoleStore();

const showModal = ref(false);
const isEditing = ref(false);
const editingId = ref<number | null>(null);

const form = reactive({
  name: '',
  email: '',
  password: '',
  department_id: null as number | null,
  role_id: null as number | null,
  user_level: 0,
  phone: '',
  address: '',
  is_active: true,
});

onMounted(async () => {
  await Promise.all([
    userStore.fetchUsers(),
    departmentStore.fetchDepartments(),
    roleStore.fetchRoles(),
  ]);
});

const openCreateModal = () => {
  isEditing.value = false;
  editingId.value = null;
  form.name = '';
  form.email = '';
  form.password = '';
  form.department_id = null;
  form.role_id = null;
  form.user_level = 0;
  form.phone = '';
  form.address = '';
  form.is_active = true;
  showModal.value = true;
};

const openEditModal = (user: any) => {
  isEditing.value = true;
  editingId.value = user.id;
  form.name = user.name;
  form.email = user.email;
  form.password = '';
  form.department_id = user.department_id;
  form.role_id = user.role_id;
  form.user_level = user.user_level || 0;
  form.phone = user.phone || '';
  form.address = user.address || '';
  form.is_active = user.is_active;
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
  isEditing.value = false;
  editingId.value = null;
};

const saveUser = async () => {
  try {
    if (isEditing.value && editingId.value) {
      const updatePayload: any = {
        name: form.name,
        email: form.email,
        department_id: form.department_id!,
        role_id: form.role_id!,
        user_level: form.user_level,
        phone: form.phone,
        address: form.address,
        is_active: form.is_active,
      };
      if (form.password) {
        updatePayload.password = form.password;
      }
      await userStore.updateUser(editingId.value, updatePayload);
    } else {
      await userStore.createUser({
        name: form.name,
        email: form.email,
        password: form.password,
        department_id: form.department_id!,
        role_id: form.role_id!,
        user_level: form.user_level,
        phone: form.phone,
        address: form.address,
      });
    }
    closeModal();
  } catch (error) {
    console.error('Error saving user:', error);
  }
};

const confirmDelete = async (id: number) => {
  if (confirm('Are you sure you want to delete this user?')) {
    try {
      await userStore.deleteUser(id);
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  }
};

function handleExport() {
  exportToCSV(userStore.users, 'Users_Export');
}

</script>
