<template>
  <div class="min-h-screen flex items-center justify-end overflow-hidden relative pr-12">
    <!-- Elegant EPC Background -->
    <div class="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900"></div>
    <div class="absolute inset-0 bg-black/60"></div>

    <div class="w-full max-w-sm relative z-10">
      <!-- Logo Text -->
      <div class="text-center mb-8">
        <img src="/blackbox-logo.png" alt="Black Box" class="w-24 h-24 mx-auto mb-3 rounded-2xl shadow-2xl" />
        <h1 class="text-3xl font-black text-white tracking-widest">BLACK<span class="text-amber-400">BOX</span></h1>
        <p class="text-slate-400 mt-1 text-xs tracking-wider uppercase">Everything Recorded. Nothing Lost.</p>
      </div>

      <!-- Login Card - Transparent -->
      <div class="space-y-5">
        <!-- Login Form Only -->
        <form @submit.prevent="handleLogin" class="space-y-4">
          <!-- Error Message -->
          <div v-if="error" class="p-4 bg-red-500/20 border border-red-500 text-red-200 rounded-lg text-sm backdrop-blur">
            {{ error }}
          </div>

          <!-- Email Input -->
          <div>
            <input
              v-model="form.email"
              type="email"
              required
              placeholder="Email Address"
              class="w-full px-4 py-3 border-2 border-white/30 rounded-lg bg-white/10 backdrop-blur text-white placeholder-white/60 focus:outline-none focus:border-white/60 focus:bg-white/15 transition-all"
            />
          </div>

          <!-- Password Input -->
          <div class="relative">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              required
              placeholder="Password"
              class="w-full px-4 py-3 border-2 border-white/30 rounded-lg bg-white/10 backdrop-blur text-white placeholder-white/60 focus:outline-none focus:border-white/60 focus:bg-white/15 transition-all"
            />
            <button
              type="button"
              @click="showPassword = !showPassword"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white focus:outline-none"
            >
              <svg v-if="!showPassword" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            </button>
          </div>

          <!-- Sign In Button -->
          <button
            type="submit"
            :disabled="loading"
            class="w-full bg-white text-blue-600 py-3 px-4 rounded-lg font-semibold hover:bg-white/90 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <span v-if="!loading">Sign In</span>
            <span v-else class="flex items-center justify-center">
              <svg class="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Signing in...
            </span>
          </button>
        </form>

        <!-- Versi & tanggal build. Disuntikkan saat build (lihat `define` di
             vite.config.ts), jadi tidak ada baris yang harus diperbarui tangan
             dan kemudian terlupa. Sengaja hanya versi + tanggal: cukup untuk
             memastikan pengguna dan support bicara tentang rilis yang sama,
             tanpa memaparkan apa pun tentang isi sistem. -->
        <p class="mt-6 text-center text-[11px] text-gray-400 select-text">
          BlackBox EPC v{{ versiAplikasi }} &middot; build {{ tanggalBuild }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const versiAplikasi = __APP_VERSION__;
// Ditampilkan sebagai tanggal lokal pembaca, bukan ISO mentah.
const tanggalBuild = new Date(__BUILD_TIME__).toLocaleDateString('id-ID', {
  day: 'numeric', month: 'short', year: 'numeric',
});
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';

const router = useRouter();
const authStore = useAuthStore();

const form = ref({
  email: '',
  password: '',
});

const loading = ref(false);
const error = ref('');
const showPassword = ref(false);

const handleLogin = async () => {
  loading.value = true;
  error.value = '';
  try {
    await authStore.login(form.value.email, form.value.password);
    router.push('/');
  } catch (err: any) {
    error.value = err.error || 'Login failed. Please check your credentials.';
  } finally {
    loading.value = false;
  }
};

</script>

<style scoped>
@keyframes pulse-slow {
  0%, 100% { opacity: 0.15; }
  50% { opacity: 0.25; }
}

@keyframes pulse-fast {
  0%, 100% { opacity: 0.2; }
  25% { opacity: 0.4; }
  50% { opacity: 0.35; }
  75% { opacity: 0.25; }
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}

@keyframes float-lightning {
  0%, 100% { transform: translate(0, 0); opacity: 0.3; }
  50% { transform: translate(5px, 10px); opacity: 0.5; }
}

@keyframes float-arrows {
  0% { transform: translateX(-30px); opacity: 0.1; }
  50% { transform: translateX(30px); opacity: 0.3; }
  100% { transform: translateX(80px); opacity: 0; }
}

@keyframes flow-wave {
  0% { stroke-dashoffset: 1000; }
  100% { stroke-dashoffset: 0; }
}

@keyframes flow-wave-fast {
  0% { stroke-dashoffset: 1000; }
  100% { stroke-dashoffset: 0; }
}

.animate-pulse-slow {
  animation: pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.animate-pulse-fast {
  animation: pulse-fast 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.animation-delay-2000 {
  animation-delay: 2s;
}

.animation-delay-4000 {
  animation-delay: 4s;
}

.animation-delay-1000 {
  animation-delay: 1s;
}

.animation-delay-3000 {
  animation-delay: 3s;
}

.animate-flow-1 {
  animation: flow-wave 6s linear infinite;
  stroke-dasharray: 1000;
}

.animate-flow-2 {
  animation: flow-wave 8s linear infinite;
  stroke-dasharray: 1000;
  animation-delay: 2s;
}

.animate-flow-2-fast {
  animation: flow-wave-fast 4s linear infinite;
  stroke-dasharray: 1000;
  animation-delay: 1s;
}

.animate-flow-3 {
  animation: flow-wave 7s linear infinite;
  stroke-dasharray: 1000;
  animation-delay: 4s;
}

.animate-flow-4 {
  animation: flow-wave 9s linear infinite;
  stroke-dasharray: 1000;
  animation-delay: 6s;
}

.animate-flow-4-fast {
  animation: flow-wave 5s linear infinite;
  stroke-dasharray: 1000;
  animation-delay: 3s;
}

.animate-float-1 {
  animation: float 6s ease-in-out infinite;
}

.animate-float-2 {
  animation: float 7s ease-in-out infinite;
  animation-delay: 1s;
}

.animate-float-3 {
  animation: float 8s ease-in-out infinite;
  animation-delay: 2s;
}

.animate-float-4 {
  animation: float 9s ease-in-out infinite;
  animation-delay: 3s;
}

.animate-float-4-speed {
  animation: float 5s ease-in-out infinite;
  animation-delay: 2s;
}

.animate-float-lightning {
  animation: float-lightning 3s ease-in-out infinite;
}

.animate-float-arrows {
  animation: float-arrows 2s ease-in infinite;
}
</style>
