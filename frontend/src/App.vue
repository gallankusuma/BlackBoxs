<template>
  <div id="app">
    <!-- Error Toast Notification -->
    <div
      v-if="errorMessage"
      class="fixed top-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-lg z-50 max-w-md"
    >
      <div class="flex justify-between items-start">
        <p class="flex-1">{{ errorMessage }}</p>
        <button @click="errorMessage = ''" class="text-red-700 font-bold text-xl">×</button>
      </div>
    </div>

    <Layout v-if="showChrome" />
    <RouterView v-else />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { RouterView } from 'vue-router';
import Layout from './components/Layout.vue';
import { setErrorCallback } from './lib/api';

const route = useRoute();
const errorMessage = ref('');

const showChrome = computed(() => route.name !== 'Login');

// Setup error callback
onMounted(() => {
  setErrorCallback((error: string) => {
    errorMessage.value = error;
    setTimeout(() => {
      errorMessage.value = '';
    }, 5000); // Auto-hide after 5 seconds
  });
});
</script>
