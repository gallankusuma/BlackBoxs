<template>
  <span :class="[
    'inline-flex items-center font-medium rounded-full',
    sizeClasses,
    variantClasses
  ]">
    <span v-if="dot" :class="['rounded-full mr-1.5', dotSizeClass, dotColorClass]" />
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
type BadgeSize = 'sm' | 'md';

const props = withDefaults(defineProps<{
  status: string;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}>(), {
  size: 'sm',
  dot: false,
});

// Auto-map common statuses to variants
const statusVariantMap: Record<string, BadgeVariant> = {
  active: 'success', completed: 'success', approved: 'success', released: 'success', paid: 'success', delivered: 'success', passed: 'success',
  pending: 'warning', draft: 'warning', 'in-progress': 'warning', 'in_progress': 'warning', processing: 'warning', partial: 'warning', open: 'warning',
  inactive: 'danger', rejected: 'danger', cancelled: 'danger', failed: 'danger', overdue: 'danger', expired: 'danger', closed: 'danger',
  info: 'info', new: 'info', scheduled: 'info', planned: 'info',
};

const resolvedVariant = computed<BadgeVariant>(() => {
  if (props.variant) return props.variant;
  return statusVariantMap[props.status.toLowerCase()] || 'neutral';
});

const label = computed(() => {
  return props.status.charAt(0).toUpperCase() + props.status.slice(1).replace(/_/g, ' ');
});

const sizeClasses = computed(() =>
  props.size === 'md' ? 'px-3 py-1 text-sm' : 'px-2 py-0.5 text-xs'
);

const dotSizeClass = computed(() =>
  props.size === 'md' ? 'w-2 h-2' : 'w-1.5 h-1.5'
);

const variantColorMap: Record<BadgeVariant, string> = {
  success: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  danger: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const dotColorMap: Record<BadgeVariant, string> = {
  success: 'bg-green-500 dark:bg-green-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  danger: 'bg-red-500 dark:bg-red-400',
  info: 'bg-blue-500 dark:bg-blue-400',
  neutral: 'bg-gray-500 dark:bg-gray-400',
};

const variantClasses = computed(() => variantColorMap[resolvedVariant.value]);
const dotColorClass = computed(() => dotColorMap[resolvedVariant.value]);
</script>
