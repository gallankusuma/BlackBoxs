<template>
  <button
    :class="buttonVariants({ variant, size, class: className })"
    v-bind="$attrs"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600',
        destructive: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
        outline: 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
        ghost: 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700',
        link: 'text-blue-600 underline-offset-4 hover:underline dark:text-blue-400',
        success: 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600',
        warning: 'bg-amber-500 text-white hover:bg-amber-600 dark:bg-amber-400 dark:text-gray-900 dark:hover:bg-amber-500',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'success' | 'warning';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface Props {
  variant?: ButtonVariant;
  size?: ButtonSize;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'default',
});

const className = props.class;
</script>
