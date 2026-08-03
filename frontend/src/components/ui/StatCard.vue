<template>
  <div :class="[
    'rounded-lg p-5 shadow-card hover:shadow-card-hover transition-all duration-200',
    colorClasses.bg
  ]">
    <div class="flex items-center justify-between">
      <div class="flex-1 min-w-0">
        <p :class="['text-sm font-medium truncate', colorClasses.label]">{{ title }}</p>
        <p :class="['text-2xl font-bold mt-1', colorClasses.value]">{{ formattedValue }}</p>
        <p v-if="subtitle" :class="['text-xs mt-1', colorClasses.label]">{{ subtitle }}</p>
      </div>
      <div v-if="icon" :class="['text-3xl ml-3 flex-shrink-0', colorClasses.icon]">
        {{ icon }}
      </div>
    </div>
    <div v-if="trend" class="flex items-center gap-1 mt-3">
      <span :class="[
        'text-xs font-medium flex items-center gap-0.5',
        trend === 'up' ? 'text-green-600 dark:text-green-400' :
        trend === 'down' ? 'text-red-600 dark:text-red-400' :
        'text-gray-500 dark:text-gray-400'
      ]">
        <span v-if="trend === 'up'">↑</span>
        <span v-else-if="trend === 'down'">↓</span>
        <span v-else>→</span>
        {{ trendValue }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type CardColor = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const props = defineProps<{
  title: string;
  value: string | number;
  icon?: string;
  subtitle?: string;
  color?: CardColor;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
}>();

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString();
  }
  return props.value;
});

const colorMap: Record<CardColor, { bg: string; value: string; label: string; icon: string }> = {
  primary: {
    bg: 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
    value: 'text-gray-900 dark:text-gray-100',
    label: 'text-gray-500 dark:text-gray-400',
    icon: 'text-blue-500 dark:text-blue-400',
  },
  success: {
    bg: 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800',
    value: 'text-green-700 dark:text-green-300',
    label: 'text-green-600 dark:text-green-400',
    icon: 'text-green-500 dark:text-green-400',
  },
  warning: {
    bg: 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800',
    value: 'text-amber-700 dark:text-amber-300',
    label: 'text-amber-600 dark:text-amber-400',
    icon: 'text-amber-500 dark:text-amber-400',
  },
  danger: {
    bg: 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800',
    value: 'text-red-700 dark:text-red-300',
    label: 'text-red-600 dark:text-red-400',
    icon: 'text-red-500 dark:text-red-400',
  },
  neutral: {
    bg: 'bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700',
    value: 'text-gray-900 dark:text-gray-100',
    label: 'text-gray-500 dark:text-gray-400',
    icon: 'text-gray-400 dark:text-gray-500',
  },
};

const colorClasses = computed(() => colorMap[props.color || 'primary']);
</script>
