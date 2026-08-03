<template>
  <TransitionRoot appear :show="isOpen" as="template">
    <Dialog as="div" @close="$emit('cancel')" class="relative z-50">
      <TransitionChild
        as="template"
        enter="ease-out duration-300"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="ease-in duration-200"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black/30 dark:bg-black/50" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4">
          <TransitionChild
            as="template"
            enter="ease-out duration-300"
            enter-from="opacity-0 scale-95"
            enter-to="opacity-100 scale-100"
            leave="ease-in duration-200"
            leave-from="opacity-100 scale-100"
            leave-to="opacity-0 scale-95"
          >
            <DialogPanel class="w-full max-w-md transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 p-6 text-left shadow-xl transition-all">
              <div class="flex items-start gap-4">
                <div v-if="confirmVariant === 'danger'" class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <span class="text-red-600 dark:text-red-400 text-lg">⚠</span>
                </div>
                <div class="flex-1">
                  <DialogTitle as="h3" class="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {{ title }}
                  </DialogTitle>
                  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">{{ message }}</p>
                </div>
              </div>

              <div class="mt-6 flex justify-end gap-3">
                <button
                  @click="$emit('cancel')"
                  class="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-600 transition-colors"
                >
                  {{ cancelLabel || 'Cancel' }}
                </button>
                <button
                  @click="$emit('confirm')"
                  :class="[
                    'px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors',
                    confirmVariant === 'danger'
                      ? 'bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600'
                      : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600'
                  ]"
                >
                  {{ confirmLabel || 'Confirm' }}
                </button>
              </div>
            </DialogPanel>
          </TransitionChild>
        </div>
      </div>
    </Dialog>
  </TransitionRoot>
</template>

<script setup lang="ts">
import { TransitionRoot, TransitionChild, Dialog, DialogPanel, DialogTitle } from '@headlessui/vue';

defineProps<{
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
}>();

defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>
