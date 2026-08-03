<template>
  <div class="flex flex-col gap-2">
    <label :for="name" class="text-sm font-medium text-gray-700 dark:text-gray-300">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>

    <!-- Text Input -->
    <input
      v-if="type !== 'textarea' && type !== 'select'"
      :id="name"
      :type="type"
      :name="name"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800"
    />

    <!-- Textarea -->
    <textarea
      v-else-if="type === 'textarea'"
      :id="name"
      :name="name"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="rows"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
      class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed resize-none bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:placeholder:text-gray-400 dark:disabled:bg-gray-800"
    />

    <!-- Select -->
    <select
      v-else-if="type === 'select'"
      :id="name"
      :name="name"
      :value="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      class="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed bg-white text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 dark:disabled:bg-gray-800"
    >
      <option value="">{{ selectPlaceholder || 'Select an option' }}</option>
      <option v-for="option in options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>

    <!-- Error Message -->
    <p v-if="error" class="text-sm text-red-500 dark:text-red-400 font-medium">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
interface Option {
  value: string | number;
  label: string;
}

defineProps<{
  name: string;
  label: string;
  type?: string;
  modelValue: any;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  error?: string;
  rows?: number;
  options?: Option[];
  selectPlaceholder?: string;
}>();

defineEmits<{
  'update:modelValue': [value: any];
}>();
</script>
