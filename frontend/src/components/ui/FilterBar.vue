<template>
  <div class="flex flex-col sm:flex-row gap-3 mb-4">
    <!-- Search input -->
    <div class="relative flex-1">
      <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">🔍</span>
      <input
        :value="modelValue"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        type="text"
        :placeholder="searchPlaceholder || 'Search...'"
        class="w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400"
      />
    </div>

    <!-- Filter dropdowns -->
    <div v-if="filters && filters.length" class="flex flex-wrap gap-2">
      <select
        v-for="filter in filters"
        :key="filter.key"
        :value="filterValues[filter.key] || ''"
        @change="onFilterChange(filter.key, ($event.target as HTMLSelectElement).value)"
        class="px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
      >
        <option value="">{{ filter.label }}</option>
        <option v-for="opt in filter.options" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
    </div>

    <!-- Extra slot for buttons -->
    <slot name="extra" />
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';

interface FilterOption {
  value: string | number;
  label: string;
}

interface Filter {
  key: string;
  label: string;
  options: FilterOption[];
}

defineProps<{
  modelValue?: string;
  searchPlaceholder?: string;
  filters?: Filter[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'filter-change': [key: string, value: string];
}>();

const filterValues = reactive<Record<string, string>>({});

const onFilterChange = (key: string, value: string) => {
  filterValues[key] = value;
  emit('filter-change', key, value);
};
</script>
