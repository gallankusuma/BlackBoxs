<template>
  <div class="flex overflow-x-auto gap-4 pb-4 h-full min-h-[500px]">
    <!-- Kanban Columns -->
    <div 
      v-for="status in statuses" 
      :key="status.key" 
      class="flex-shrink-0 w-80 bg-gray-50 rounded-lg flex flex-col max-h-[700px] border border-gray-200"
    >
      <!-- Column Header -->
      <div 
        class="p-3 font-semibold text-gray-700 flex justify-between items-center border-b border-gray-200"
        :class="status.headerClass"
      >
        <span>{{ status.label }}</span>
        <span class="text-xs bg-white bg-opacity-50 px-2 py-0.5 rounded-full text-gray-600 font-bold">
          {{ getTasksByStatus(status.key).length }}
        </span>
      </div>

      <!-- Tasks List -->
      <div 
        class="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar"
        @dragover.prevent
        @drop="onDrop($event, status.key)"
      >
        <div 
          v-for="task in getTasksByStatus(status.key)" 
          :key="task.id"
          class="bg-white p-3 rounded shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing group relative"
          draggable="true"
          @dragstart="onDragStart($event, task)"
          @click="$emit('editTask', task)"
        >
          <!-- Priority Badge -->
          <div class="flex justify-between items-start mb-2">
            <span 
              class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-sm"
              :class="getPriorityColor(task.priority)"
            >
              {{ task.priority }}
            </span>
            <button 
              @click.stop="$emit('deleteTask', task.id)"
              class="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              ×
            </button>
          </div>
          
          <h4 class="text-sm font-semibold text-gray-800 mb-1 leading-snug">{{ task.title }}</h4>
          
          <div class="text-xs text-gray-500 line-clamp-2 mb-3">
            {{ task.description || 'No description' }}
          </div>

          <div class="flex justify-between items-center pt-2 border-t border-gray-50">
            <!-- Assignee -->
            <div class="flex items-center gap-1" title="Assignee">
              <div class="w-5 h-5 rounded-full bg-blue-100 text-[10px] flex items-center justify-center text-blue-700 font-bold">
                {{ getInitials(task.assigned_to_name) }}
              </div>
            </div>

            <!-- Due Date -->
            <div 
              class="text-[10px] flex items-center gap-1 font-medium"
              :class="isOverdue(task.due_date) ? 'text-red-600' : 'text-gray-400'"
            >
              <span>📅</span>
              {{ formatDate(task.due_date) }}
            </div>
          </div>
        </div>

        <!-- Empty State in Column -->
        <div v-if="getTasksByStatus(status.key).length === 0" class="text-center py-8 opacity-50 text-sm italic text-gray-400">
          No tasks
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  tasks: any[];
}>();

const emit = defineEmits(['updateTaskStatus', 'editTask', 'deleteTask']);

const statuses = [
  { key: 'To Do', label: 'To Do', headerClass: 'bg-gray-100' },
  { key: 'In Progress', label: 'In Progress', headerClass: 'bg-blue-50 text-blue-800' },
  { key: 'Review', label: 'Review', headerClass: 'bg-yellow-50 text-yellow-800' },
  { key: 'Done', label: 'Done', headerClass: 'bg-green-50 text-green-800' }
];

const getTasksByStatus = (status: string) => {
  return props.tasks.filter(t => t.status === status);
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'Urgent': return 'bg-red-100 text-red-700';
    case 'High': return 'bg-orange-100 text-orange-700';
    case 'Medium': return 'bg-blue-50 text-blue-700';
    case 'Low': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const getInitials = (name: string) => {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
};

const formatDate = (date: string) => {
  if (!date) return '-';
  const d = new Date(date);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

const isOverdue = (date: string) => {
  if (!date) return false;
  return new Date(date) < new Date() && new Date(date).toDateString() !== new Date().toDateString();
};

const onDragStart = (event: DragEvent, task: any) => {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('taskId', task.id.toString());
  }
};

const onDrop = (event: DragEvent, newStatus: string) => {
  const taskId = event.dataTransfer?.getData('taskId');
  if (taskId) {
    emit('updateTaskStatus', parseInt(taskId), newStatus);
  }
};
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 20px;
}
</style>
