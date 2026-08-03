<template>
  <div class="w-full overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-lg">
    <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
      <thead class="bg-gray-50 dark:bg-gray-900">
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            class="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider"
          >
            {{ column.label }}
          </th>
          <th v-if="actions" class="px-6 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">
            Actions
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
        <!-- Loading skeleton -->
        <template v-if="loading">
          <tr v-for="n in 5" :key="'skel-' + n">
            <td v-for="column in columns" :key="column.key" class="px-6 py-4">
              <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </td>
            <td v-if="actions" class="px-6 py-4">
              <div class="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </td>
          </tr>
        </template>

        <!-- Empty state -->
        <tr v-else-if="rows.length === 0">
          <td :colspan="columns.length + (actions ? 1 : 0)" class="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No data available
          </td>
        </tr>

        <!-- Data rows -->
        <tr v-else v-for="(row, idx) in sortedRows" :key="idx" class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
          <td
            v-for="column in columns"
            :key="column.key"
            class="px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
          >
            <slot :name="'cell-' + column.key" :row="row" :value="getNestedValue(row, column.key)">
              <template v-if="column.render">
                <component :is="{ template: column.render(row) }" />
              </template>
              <template v-else>
                {{ getNestedValue(row, column.key) }}
              </template>
            </slot>
          </td>
          <td v-if="actions" class="px-6 py-4 text-sm whitespace-nowrap space-x-2 flex gap-2">
            <button
              v-for="action in actions"
              :key="action.label"
              @click="action.handler(row)"
              :class="[
                'px-3 py-1 rounded text-sm font-medium transition-colors',
                action.variant === 'danger'
                  ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                  : action.variant === 'success'
                  ? 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50'
              ]"
            >
              {{ action.label }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Pagination (optional) -->
    <div v-if="pagination" class="flex justify-between items-center px-6 py-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
      <div class="text-sm text-gray-600 dark:text-gray-400">
        Showing {{ pagination.from }} to {{ pagination.to }} of {{ pagination.total }} results
      </div>
      <div class="flex gap-2">
        <button
          @click="$emit('prev-page')"
          :disabled="pagination.current_page === 1"
          class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-600 dark:text-gray-400">
            Page {{ pagination.current_page }} of {{ pagination.last_page }}
          </span>
        </div>
        <button
          @click="$emit('next-page')"
          :disabled="pagination.current_page === pagination.last_page"
          class="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T extends Record<string, any>">
import { computed, ref } from 'vue';

interface Column {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => string;
}

interface Action {
  label: string;
  variant?: 'default' | 'danger' | 'success';
  handler: (row: T) => void;
}

interface Pagination {
  current_page: number;
  last_page: number;
  total: number;
  from: number;
  to: number;
}

const props = defineProps<{
  columns: Column[];
  rows: T[];
  actions?: Action[];
  pagination?: Pagination;
  loading?: boolean;
}>();

defineEmits<{
  'prev-page': [];
  'next-page': [];
}>();

const sortKey = ref('');
const sortOrder = ref<'asc' | 'desc'>('asc');

const sortedRows = computed(() => {
  if (!sortKey.value) return props.rows;
  return [...props.rows].sort((a, b) => {
    const aVal = getNestedValue(a, sortKey.value);
    const bVal = getNestedValue(b, sortKey.value);
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
    return sortOrder.value === 'asc' ? cmp : -cmp;
  });
});

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}
</script>
