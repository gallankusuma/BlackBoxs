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
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-white hover:bg-accent-hov dark:bg-accent dark:hover:bg-accent-hov',
        destructive: 'bg-danger text-white hover:brightness-95',
        outline: 'border border-line-strong bg-surface text-ink hover:bg-surface-muted dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
        secondary: 'bg-surface-muted text-ink hover:bg-line dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600',
        ghost: 'text-ink-muted hover:bg-surface-muted hover:text-ink dark:text-gray-300 dark:hover:bg-gray-700',
        link: 'text-accent underline-offset-4 hover:underline',
        success: 'bg-success text-white hover:brightness-95',
        warning: 'bg-warning text-white hover:brightness-95',
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
