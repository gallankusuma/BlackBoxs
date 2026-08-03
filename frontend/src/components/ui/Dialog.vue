<template>
  <TransitionRoot appear :show="isOpen" as="template">
    <Dialog as="div" @close="closeModal" class="relative z-50">
      <TransitionChild
        as="template"
        enter="ease-out duration-300"
        enter-from="opacity-0"
        enter-to="opacity-100"
        leave="ease-in duration-200"
        leave-from="opacity-100"
        leave-to="opacity-0"
      >
        <div class="fixed inset-0 bg-black bg-opacity-25" />
      </TransitionChild>

      <div class="fixed inset-0 overflow-y-auto">
        <div class="flex min-h-full items-center justify-center p-4 text-center">
          <TransitionChild
            as="template"
            enter="ease-out duration-300"
            enter-from="opacity-0 scale-95"
            enter-to="opacity-100 scale-100"
            leave="ease-in duration-200"
            leave-from="opacity-100 scale-100"
            leave-to="opacity-0 scale-95"
          >
            <DialogPanel
              :class="[
                'w-full transform overflow-hidden rounded-lg bg-white dark:bg-gray-800 p-6 text-left align-middle shadow-xl transition-all',
                props.size === 'large' ? 'max-w-4xl' : props.size === 'medium' ? 'max-w-2xl' : 'max-w-md'
              ]"
            >
              <DialogTitle as="h3" class="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
                <slot name="title" />
              </DialogTitle>
              <div class="mt-2">
                <slot />
              </div>
              <div class="mt-4 flex gap-2 justify-end">
                <slot name="actions" :close="closeModal" />
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

interface Props {
  isOpen: boolean;
  size?: 'small' | 'medium' | 'large';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'small'
});

const emit = defineEmits<{
  'update:isOpen': [value: boolean];
}>();

const closeModal = () => {
  emit('update:isOpen', false);
};
</script>
