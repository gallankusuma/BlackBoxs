<template>
  <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 min-h-[500px]">
    <div class="flex justify-between items-center mb-6">
      <h3 class="text-lg font-bold text-gray-800">Gantt Chart</h3>
      <div class="flex gap-2">
        <select v-model="viewMode" class="border border-gray-300 rounded px-3 py-1 text-sm bg-white">
          <option value="month">Month</option>
          <option value="week">Week</option>
          <option value="2weeks">2 Weeks</option>
        </select>
      </div>
    </div>
    
    <!-- Timeline Grid -->
    <div class="overflow-x-auto">
      <div class="min-w-[1200px]">
        <!-- Timeline Header -->
        <div class="flex border-b border-gray-200">
          <div class="w-48 flex-shrink-0 p-3 font-semibold text-gray-700 bg-gray-50 border-r border-gray-200">
            Task / Milestone
          </div>
          <div class="flex-1 flex">
            <div 
              v-for="(date, dIdx) in dateRange" 
              :key="dIdx"
              class="border-r border-gray-200 p-2 text-center text-xs font-semibold text-gray-600 bg-gray-50"
              :style="{ width: getDateWidth() }"
            >
              {{ formatDateHeader(date) }}
            </div>
          </div>
        </div>

        <!-- Tasks Bars -->
        <div class="bg-white">
          <!-- Task Rows -->
          <div 
            v-for="task in tasks" 
            :key="task.id"
            class="flex border-b border-gray-100 hover:bg-blue-50 transition-colors"
          >
            <!-- Task Name -->
            <div class="w-48 flex-shrink-0 p-3 border-r border-gray-200">
              <div class="flex items-center gap-2">
                <div class="text-xs font-bold px-2 py-0.5 rounded" :class="getStatusColor(task.status)">
                  {{ getStatusBadge(task.status) }}
                </div>
              </div>
              <p class="text-sm font-medium text-gray-800 truncate mt-1">{{ task.title }}</p>
              <p class="text-xs text-gray-500">{{ task.assigned_to || 'Unassigned' }}</p>
            </div>

            <!-- Timeline Bar -->
            <div class="flex-1 relative p-2" :style="{ height: '60px' }">
              <div 
                v-if="task.due_date"
                class="absolute top-2 h-8 rounded flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:opacity-80 transition-opacity"
                :class="getTaskBarColor(task.status)"
                :style="getTaskBarStyle(task.due_date)"
                :title="`${task.title} - Due: ${formatDate(task.due_date)}`"
              >
                <span class="px-1 truncate">{{ task.priority }}</span>
              </div>
            </div>
          </div>

          <!-- Milestones -->
          <div 
            v-if="milestones && milestones.length > 0"
            class="border-t-2 border-gray-300 mt-4 pt-4"
          >
            <h4 class="text-sm font-semibold text-gray-700 mb-3 px-3">Milestones</h4>
            <div 
              v-for="milestone in milestones" 
              :key="milestone.id"
              class="flex border-b border-gray-100 hover:bg-purple-50 transition-colors"
            >
              <!-- Milestone Name -->
              <div class="w-48 flex-shrink-0 p-3 border-r border-gray-200">
                <p class="text-sm font-semibold text-gray-800">{{ milestone.title }}</p>
                <p class="text-xs text-gray-500">{{ formatDate(milestone.due_date) }}</p>
              </div>

              <!-- Milestone Marker -->
              <div class="flex-1 relative p-2" :style="{ height: '40px' }">
                <div 
                  v-if="milestone.due_date"
                  class="absolute top-1 h-6 w-6 rounded-full border-4 border-purple-600 bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-600 cursor-pointer hover:scale-125 transition-transform"
                  :style="getMilestonePosition(milestone.due_date)"
                  :title="milestone.title"
                >
                  🎯
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Legend -->
    <div class="mt-6 flex gap-6 text-sm">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded bg-blue-500"></div>
        <span class="text-gray-600">In Progress</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded bg-green-500"></div>
        <span class="text-gray-600">Done</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded bg-gray-400"></div>
        <span class="text-gray-600">To Do</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded bg-yellow-500"></div>
        <span class="text-gray-600">Review</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

defineProps<{
  tasks?: any[];
  milestones?: any[];
}>();

const viewMode = ref('month');

// Generate date range for timeline
const dateRange = computed(() => {
  const start = new Date(2026, 0, 1); // Jan 1, 2026
  const end = new Date(2026, 5, 30);   // Jun 30, 2026
  const dates = [];
  let current = new Date(start);
  
  while (current <= end) {
    dates.push(new Date(current));
    if (viewMode.value === 'month') {
      current.setMonth(current.getMonth() + 1);
    } else if (viewMode.value === 'week') {
      current.setDate(current.getDate() + 7);
    } else {
      current.setDate(current.getDate() + 14);
    }
  }
  return dates;
});

const getDateWidth = () => {
  return viewMode.value === 'month' ? '120px' : viewMode.value === 'week' ? '100px' : '110px';
};

const formatDateHeader = (date: Date) => {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
};

const formatDate = (date: string) => {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getTaskBarStyle = (dueDate: string) => {
  if (!dueDate) return {};
  
  const taskDate = new Date(dueDate);
  const startDate = new Date(2026, 0, 1);
  const daysDiff = Math.floor((taskDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const dateWidth = viewMode.value === 'month' ? 120 : viewMode.value === 'week' ? 100 : 110;
  const pxLeft = Math.max(0, daysDiff * (dateWidth / 30));
  
  return {
    left: pxLeft + 'px',
    width: '80px'
  };
};

const getMilestonePosition = (dueDate: string) => {
  if (!dueDate) return {};
  
  const taskDate = new Date(dueDate);
  const startDate = new Date(2026, 0, 1);
  const daysDiff = Math.floor((taskDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    left: 'calc(' + (daysDiff * 4) + 'px - 12px)'
  };
};

const getStatusColor = (status: string) => {
  switch (status) {
    case 'To Do': return 'bg-gray-100 text-gray-800';
    case 'In Progress': return 'bg-blue-100 text-blue-800';
    case 'Review': return 'bg-yellow-100 text-yellow-800';
    case 'Done': return 'bg-green-100 text-green-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'To Do': return '●';
    case 'In Progress': return '⟳';
    case 'Review': return '⧕';
    case 'Done': return '✓';
    default: return '○';
  }
};

const getTaskBarColor = (status: string) => {
  switch (status) {
    case 'To Do': return 'bg-gray-400';
    case 'In Progress': return 'bg-blue-500';
    case 'Review': return 'bg-yellow-500';
    case 'Done': return 'bg-green-500';
    default: return 'bg-gray-300';
  }
};
</script>

<style scoped>
::-webkit-scrollbar {
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #ccc;
  border-radius: 3px;
}
</style>
