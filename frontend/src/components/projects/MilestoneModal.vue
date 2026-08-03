<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
      <h2 class="text-xl font-bold mb-4">{{ milestone?.id ? 'Edit Milestone' : 'New Milestone' }}</h2>
      
      <form @submit.prevent="save">
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input v-model="form.title" type="text" required class="w-full border rounded px-3 py-2">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea v-model="form.description" rows="3" class="w-full border rounded px-3 py-2"></textarea>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
            <input v-model="form.due_date" type="date" required class="w-full border rounded px-3 py-2">
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select v-model="form.status" class="w-full border rounded px-3 py-2">
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Delayed">Delayed</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Payment Amount (Optional)</label>
              <input v-model="form.amount" type="number" step="0.01" class="w-full border rounded px-3 py-2">
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button type="button" @click="$emit('close')" class="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
          <button type="submit" class="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

const props = defineProps<{
  milestone?: any;
}>();

const emit = defineEmits(['close', 'save']);

const form = ref({
  title: '',
  description: '',
  due_date: '',
  status: 'Pending',
  amount: 0
});

onMounted(() => {
  if (props.milestone) {
    form.value = { ...props.milestone };
    if (form.value.due_date) form.value.due_date = form.value.due_date.split('T')[0];
  }
});

const save = () => {
  emit('save', form.value);
};
</script>
