<template>
  <div class="flex min-h-[60vh] items-center justify-center p-6">
    <div class="max-w-md text-center">
      <p class="font-mono text-sm uppercase tracking-[0.2em] text-gray-400">404</p>
      <h1 class="mt-3 font-serif text-2xl text-gray-900">Halaman tidak ditemukan</h1>
      <p class="mt-3 text-sm leading-relaxed text-gray-600">
        Alamat <code class="rounded bg-gray-100 px-1.5 py-0.5 text-gray-800">{{ path }}</code>
        tidak terdaftar di aplikasi ini. Kalau Anda sampai di sini dari menu,
        berarti ada tautan menu yang menunjuk ke halaman yang belum dibuat —
        tolong laporkan alamat di atas.
      </p>
      <div class="mt-6 flex justify-center gap-3">
        <button
          class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          @click="router.back()"
        >
          Kembali
        </button>
        <RouterLink
          to="/"
          class="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          Ke Dashboard
        </RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Sebelum halaman ini ada, alamat yang tidak cocok dengan satu pun route tidak
 * menghasilkan apa-apa: vue-router mencatat peringatan di console lalu
 * `<router-view>` merender kosong, jadi pengguna melihat kerangka aplikasi
 * dengan area konten hampa dan tidak ada yang menjelaskan apa yang terjadi.
 *
 * Itu yang membuat dua tautan menu mati — /project/prospects dan /project/notes
 * — bisa bertahan lama tanpa ketahuan. Halaman ini membuat kegagalan semacam itu
 * terlihat, dan menyebut alamatnya supaya bisa dilaporkan.
 */
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();
const path = computed(() => route.fullPath);
</script>
