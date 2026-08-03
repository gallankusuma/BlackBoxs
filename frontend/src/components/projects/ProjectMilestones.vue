<template>
  <div>
    <div class="flex justify-between items-center mb-6">
      <h3 class="text-lg font-bold">Milestones</h3>
      <button 
        @click="$emit('addMilestone')"
        class="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
      >
        + Add Milestone
      </button>
    </div>

    <div v-if="milestones.length === 0" class="text-center py-10 bg-gray-50 rounded border border-dashed border-gray-300">
      <p class="text-gray-500">No milestones yet.</p>
    </div>

    <div v-else class="space-y-4">
      <div 
        v-for="milestone in milestones" 
        :key="milestone.id"
        class="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
      >
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center gap-2">
              <h4 class="font-bold text-gray-800">{{ milestone.title }}</h4>
              <span 
                class="px-2 py-0.5 rounded text-xs font-semibold"
                :class="getStatusColor(milestone.status)"
              >
                {{ milestone.status }}
              </span>
            </div>
            <p class="text-sm text-gray-600 mt-1">{{ milestone.description }}</p>
            <div class="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <div class="flex items-center gap-1">
                <span>📅</span> Due: {{ formatDate(milestone.due_date) }}
              </div>
              <div v-if="milestone.amount > 0" class="flex items-center gap-1 font-medium text-gray-700">
                <span>💰</span> {{ formatCurrency(milestone.amount) }}
              </div>
            </div>
          </div>

          <div class="flex gap-2">
            <button @click="$emit('editMilestone', milestone)" class="text-blue-600 hover:text-blue-800 p-1">
              ✎
            </button>
            <button @click="$emit('deleteMilestone', milestone.id)" class="text-red-600 hover:text-red-800 p-1">
              ×
            </button>
          </div>
        </div>

        <!-- Progress Bar -->
        <div class="mt-4">
          <div class="flex justify-between text-xs text-gray-600 mb-1">
            <span>{{ milestone.completed_tasks }} / {{ milestone.total_tasks }} Tasks</span>
            <span>{{ calculateProgress(milestone) }}%</span>
          </div>
          <div class="w-full bg-gray-200 rounded-full h-2">
            <div 
              class="bg-green-500 h-2 rounded-full transition-all duration-300"
              :style="{ width: `${calculateProgress(milestone)}%` }"
            ></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { formatCurrency } from '@/utils/format';

defineProps<{
  milestones: any[];
}>();

const emit = defineEmits(['addMilestone', 'editMilestone', 'deleteMilestone']);

const getStatusColor = (status: string) => {
  switch (status) {
    case 'Pending': return 'bg-gray-100 text-gray-600';
    case 'In Progress': return 'bg-blue-100 text-blue-800';
    case 'Completed': return 'bg-green-100 text-green-800';
    case 'Delayed': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-600';
  }
};

const calculateProgress = (milestone: any) => {
  if (!milestone.total_tasks || milestone.total_tasks === 0) return 0;
  return Math.round((milestone.completed_tasks / milestone.total_tasks) * 100);
};

const formatDate = (date: string) => {
  if (!date) return '-';
  return new Date(date).toLocaleDateString();
};


</script>
