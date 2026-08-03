<template>
  <div class="overflow-x-auto">
    <table class="min-w-full bg-white border border-gray-200 rounded-lg">
      <thead class="bg-gray-50 text-gray-600 uppercase text-xs">
        <tr>
          <th class="py-3 px-4 text-left">Title</th>
          <th class="py-3 px-4 text-left">Assignee</th>
          <th class="py-3 px-4 text-center">Status</th>
          <th class="py-3 px-4 text-center">Priority</th>
          <th class="py-3 px-4 text-left">Due Date</th>
          <th class="py-3 px-4 text-center">Action</th>
        </tr>
      </thead>
      <tbody class="text-sm divide-y divide-gray-100">
        <tr v-for="task in tasks" :key="task.id" class="hover:bg-gray-50 transition-colors">
          <td class="py-3 px-4 font-medium text-gray-800">
            {{ task.title }}
          </td>
          <td class="py-3 px-4 text-gray-600">
            {{ task.assigned_to_name || 'Unassigned' }}
          </td>
          <td class="py-3 px-4 text-center">
             <span 
              class="px-2 py-1 rounded-full text-xs font-semibold"
              :class="getStatusColor(task.status)"
            >
              {{ task.status }}
            </span>
          </td>
          <td class="py-3 px-4 text-center">
            <span 
              class="px-2 py-1 rounded text-xs font-semibold"
              :class="getPriorityColor(task.priority)"
            >
              {{ task.priority }}
            </span>
          </td>
          <td class="py-3 px-4 text-gray-600">
            {{ formatDate(task.due_date) }}
          </td>
          <td class="py-3 px-4 text-center flex justify-center gap-2">
            <button @click="$emit('editTask', task)" class="text-blue-600 hover:text-blue-800">
              ✎
            </button>
            <button @click="$emit('deleteTask', task.id)" class="text-red-600 hover:text-red-800">
              🗑
            </button>
          </td>
        </tr>
        <tr v-if="tasks.length === 0">
          <td colspan="6" class="py-8 text-center text-gray-500">
            No tasks found.
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tasks: any[];
}>();

const emit = defineEmits(['editTask', 'deleteTask']);

const getStatusColor = (status: string) => {
  switch (status) {
    case 'To Do': return 'bg-gray-100 text-gray-800';
    case 'In Progress': return 'bg-blue-100 text-blue-800';
    case 'Review': return 'bg-yellow-100 text-yellow-800';
    case 'Done': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'Urgent': return 'text-red-700 bg-red-50';
    case 'High': return 'text-orange-700 bg-orange-50';
    case 'Medium': return 'text-blue-700 bg-blue-50';
    case 'Low': return 'text-gray-600 bg-gray-50';
    default: return 'text-gray-600 bg-gray-50';
  }
};

const formatDate = (date: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
</script>
