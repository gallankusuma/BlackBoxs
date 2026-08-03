<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-3xl font-bold text-gray-800">✅ Production Tasks</h1>
      <p class="text-gray-600">Manage work order tasks and assignments</p>
    </div>

    <!-- Task Summary -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      <div class="bg-yellow-50 rounded-lg p-4">
        <div class="text-sm text-yellow-600 font-medium">Pending</div>
        <div class="text-2xl font-bold text-yellow-900">{{ summary.pending }}</div>
      </div>
      <div class="bg-blue-50 rounded-lg p-4">
        <div class="text-sm text-blue-600 font-medium">In Progress</div>
        <div class="text-2xl font-bold text-blue-900">{{ summary.in_progress }}</div>
      </div>
      <div class="bg-green-50 rounded-lg p-4">
        <div class="text-sm text-green-600 font-medium">Completed</div>
        <div class="text-2xl font-bold text-green-900">{{ summary.completed }}</div>
      </div>
      <div class="bg-gray-50 rounded-lg p-4">
        <div class="text-sm text-gray-600 font-medium">Total</div>
        <div class="text-2xl font-bold text-gray-900">{{ summary.total }}</div>
      </div>
    </div>

    <!-- Filter Tabs -->
    <div class="flex space-x-2 mb-6">
      <button @click="filterStatus = 'all'" :class="filterStatus === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'" class="px-4 py-2 rounded-lg font-medium">
        All Tasks
      </button>
      <button @click="filterStatus = 'pending'" :class="filterStatus === 'pending' ? 'bg-yellow-600 text-white' : 'bg-gray-200 text-gray-700'" class="px-4 py-2 rounded-lg font-medium">
        Pending
      </button>
      <button @click="filterStatus = 'in_progress'" :class="filterStatus === 'in_progress' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'" class="px-4 py-2 rounded-lg font-medium">
        In Progress
      </button>
      <button @click="filterStatus = 'completed'" :class="filterStatus === 'completed' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700'" class="px-4 py-2 rounded-lg font-medium">
        Completed
      </button>
    </div>

    <!-- Tasks List -->
    <div class="bg-white rounded-lg shadow overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Work Order</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assigned To</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Priority</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
          <tr v-for="task in filteredTasks" :key="task.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-medium text-gray-900">
              {{ task.task_name }}
            </td>
            <td class="px-6 py-4 text-sm text-blue-600">
              {{ task.wo_number }}
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ task.assigned_to }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span :class="priorityBadgeClass(task.priority)" class="px-2 py-1 text-xs font-semibold rounded-full">
                {{ task.priority }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm text-gray-500">
              {{ formatDate(task.due_date) }}
            </td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span :class="statusBadgeClass(task.status)" class="px-2 py-1 text-xs font-semibold rounded-full">
                {{ task.status }}
              </span>
            </td>
            <td class="px-6 py-4 text-sm">
              <button v-if="task.status !== 'completed'" @click="updateTaskStatus(task)" class="text-green-600 hover:text-green-800 mr-3">
                ✅ Complete
              </button>
              <button @click="viewTask(task)" class="text-blue-600 hover:text-blue-800">
                👁️ View
              </button>
            </td>
          </tr>
          <tr v-if="filteredTasks.length === 0">
            <td colspan="7" class="px-6 py-12 text-center text-gray-500">
              ✅ No tasks found
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '@/lib/api';

interface Task {
  id: number;
  task_name: string;
  wo_number: string;
  assigned_to: string;
  priority: string;
  due_date: string;
  status: string;
  description?: string;
}

const tasks = ref<Task[]>([]);
const filterStatus = ref('all');
const summary = ref({
  pending: 0,
  in_progress: 0,
  completed: 0,
  total: 0
});

const filteredTasks = computed(() => {
  if (filterStatus.value === 'all') return tasks.value;
  return tasks.value.filter(t => t.status === filterStatus.value);
});

const loadTasks = async () => {
  try {
    const { data } = await api.get('/production/tasks');
    tasks.value = data;
    calculateSummary();
  } catch (error) {
    console.error('Failed to load tasks:', error);
  }
};

const calculateSummary = () => {
  summary.value = {
    pending: tasks.value.filter(t => t.status === 'pending').length,
    in_progress: tasks.value.filter(t => t.status === 'in_progress').length,
    completed: tasks.value.filter(t => t.status === 'completed').length,
    total: tasks.value.length
  };
};

const updateTaskStatus = async (task: Task) => {
  const newStatus = task.status === 'pending' ? 'in_progress' : 'completed';
  try {
    await api.put(`/production/tasks/${task.id}/status`, { status: newStatus });
    await loadTasks();
  } catch (error) {
    console.error('Failed to update task:', error);
    alert('Failed to update task status');
  }
};

const viewTask = (task: Task) => {
  alert(`Task: ${task.task_name}\n\nWork Order: ${task.wo_number}\nAssigned to: ${task.assigned_to}\nPriority: ${task.priority}\nStatus: ${task.status}`);
};

const priorityBadgeClass = (priority: string) => {
  const classes: Record<string, string> = {
    high: 'bg-red-100 text-red-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-green-100 text-green-800'
  };
  return classes[priority] || 'bg-gray-100 text-gray-800';
};

const statusBadgeClass = (status: string) => {
  const classes: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800'
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

onMounted(() => {
  loadTasks();
});
</script>
