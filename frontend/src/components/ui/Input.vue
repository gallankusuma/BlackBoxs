<template>
  <input
    :class="[
      'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800 dark:focus:ring-blue-400',
      $attrs.class
    ]"
    v-bind="{ ...$attrs, class: undefined }"
  />
</template>

<script setup lang="ts">
</script>
