<template>
  <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div class="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
      <h2 class="text-xl font-bold mb-4">{{ task?.id ? 'Edit Task' : 'New Task' }}</h2>
      
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

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select v-model="form.status" class="w-full border rounded px-3 py-2">
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="Review">Review</option>
                <option value="Done">Done</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select v-model="form.priority" class="w-full border rounded px-3 py-2">
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input v-model="form.start_date" type="date" class="w-full border rounded px-3 py-2">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <input v-model="form.due_date" type="date" class="w-full border rounded px-3 py-2">
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
            <select v-model="form.assigned_to" class="w-full border rounded px-3 py-2">
              <option :value="null">Unassigned</option>
              <option v-for="user in users" :key="user.id" :value="user.id">{{ user.name }}</option>
            </select>
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
  task?: any;
  users: any[];
}>();

const emit = defineEmits(['close', 'save']);

const form = ref({
  title: '',
  description: '',
  status: 'To Do',
  priority: 'Medium',
  start_date: '',
  due_date: '',
  assigned_to: null,
  milestone_id: null
});

onMounted(() => {
  if (props.task) {
    form.value = { ...props.task };
    // Format dates for input type="date"
    if (form.value.start_date) form.value.start_date = form.value.start_date.split('T')[0];
    if (form.value.due_date) form.value.due_date = form.value.due_date.split('T')[0];
  }
});

const save = () => {
  emit('save', form.value);
};
</script>
