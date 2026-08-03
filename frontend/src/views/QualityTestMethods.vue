<template>
  <div class="min-h-screen bg-gray-50">
    <main class="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center mb-6">
        <div>
          <h2 class="text-2xl font-bold text-gray-900">QC Test Methods</h2>
          <p class="text-sm text-gray-500 mt-1">Define test methods and acceptance criteria</p>
        </div>
        <button @click="showAdd = true" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">+ Add Test</button>
      </div>

      <div v-if="store.loading" class="text-center py-10"><div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>

      <div v-else class="bg-white shadow rounded-lg overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acceptance Criteria</th>
              <th class="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200">
            <tr v-for="t in store.qcTests" :key="t.id" class="hover:bg-gray-50">
              <td class="px-4 py-3 text-sm font-medium text-blue-600">{{ t.code }}</td>
              <td class="px-4 py-3 text-sm text-gray-900">{{ t.name }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ t.test_type || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ t.test_method || '-' }}</td>
              <td class="px-4 py-3 text-sm text-gray-600">{{ t.acceptance_criteria || '-' }}</td>
              <td class="px-4 py-3 text-right">
                <button @click="deleteTest(t.id)" class="text-red-600 hover:text-red-800 text-sm">Delete</button>
              </td>
            </tr>
            <tr v-if="!store.qcTests.length"><td colspan="6" class="text-center py-8 text-gray-400">No QC tests defined</td></tr>
          </tbody>
        </table>
      </div>

      <!-- Add Modal -->
      <div v-if="showAdd" class="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
          <h3 class="text-lg font-bold mb-4">Add QC Test Method</h3>
          <form @submit.prevent="createTest" class="space-y-3">
            <div><label class="block text-sm font-medium text-gray-700">Name</label><input v-model="form.name" required class="mt-1 block w-full px-3 py-2 border rounded-md text-sm" /></div>
            <div><label class="block text-sm font-medium text-gray-700">Description</label><input v-model="form.description" class="mt-1 block w-full px-3 py-2 border rounded-md text-sm" /></div>
            <div class="flex justify-end gap-3 pt-2">
              <button type="button" @click="showAdd = false" class="px-4 py-2 bg-gray-200 text-gray-700 rounded-md text-sm">Cancel</button>
              <button type="submit" class="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">Create</button>
            </div>
          </form>
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useQualityStore } from '../stores/quality';
import { api } from '../lib/api';

const store = useQualityStore();
const showAdd = ref(false);
const form = ref({ name: '', description: '' });

onMounted(() => store.fetchQcTests());

const createTest = async () => {
  await store.createQcTest(form.value);
  showAdd.value = false;
  form.value = { name: '', description: '' };
};

const deleteTest = async (id: number) => {
  if (!confirm('Delete this test method?')) return;
  await api.delete(`/quality/qc-tests/${id}`);
  await store.fetchQcTests();
};
</script>
