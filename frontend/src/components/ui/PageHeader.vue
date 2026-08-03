<template>
  <div class="mb-6">
    <!-- Breadcrumbs -->
    <nav v-if="breadcrumbs && breadcrumbs.length" class="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-3">
      <template v-for="(crumb, idx) in breadcrumbs" :key="idx">
        <router-link
          v-if="crumb.route"
          :to="crumb.route"
          class="hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
        >
          {{ crumb.label }}
        </router-link>
        <span v-else>{{ crumb.label }}</span>
        <span v-if="idx < breadcrumbs.length - 1" class="text-gray-300 dark:text-gray-600">/</span>
      </template>
    </nav>

    <!-- Header row -->
    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
          <span v-if="icon" class="text-2xl">{{ icon }}</span>
          {{ title }}
        </h1>
        <p v-if="subtitle" class="mt-1 text-sm text-gray-500 dark:text-gray-400">{{ subtitle }}</p>
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Breadcrumb {
  label: string;
  route?: string;
}

defineProps<{
  title: string;
  subtitle?: string;
  icon?: string;
  breadcrumbs?: Breadcrumb[];
}>();
</script>
