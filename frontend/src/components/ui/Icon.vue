<template>
  <svg
    :width="size" :height="size" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" :stroke-width="strokeWidth"
    stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true" focusable="false" class="shrink-0"
  >
    <path v-for="(d, i) in paths" :key="i" :d="d" />
    <circle v-for="(c, i) in circles" :key="`c${i}`" :cx="c[0]" :cy="c[1]" :r="c[2]" />
  </svg>
</template>

<script setup lang="ts">
/**
 * Ikon garis, ditanam langsung — tanpa pustaka, tanpa request, tanpa emoji.
 *
 * Emoji sebagai ikon adalah penanda "dibuat cepat" yang paling kentara: bentuk
 * dan warnanya ditentukan sistem operasi, jadi tampilannya berbeda di Windows,
 * macOS, dan Android, tidak bisa mengikuti warna teks, dan ukurannya tidak
 * pernah sejajar dengan tipografi di sebelahnya.
 *
 * Semua ikon di sini digambar pada kanvas 24x24 dengan stroke 1.5 supaya seirama
 * dengan berat font teks.
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  name: string;
  size?: number | string;
  strokeWidth?: number | string;
}>(), { size: 18, strokeWidth: 1.5 });

type Def = { p: string[]; c?: [number, number, number][] };

const ICONS: Record<string, Def> = {
  // ── Modul utama ──────────────────────────────────────────────────────────
  factory:    { p: ['M2 20h20', 'M4 20V9l5 3V9l5 3V9l5 3v8', 'M7 20v-4h3v4'] },
  calculator: { p: ['M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z',
                    'M8 7h8', 'M8 11h.01', 'M12 11h.01', 'M16 11h.01',
                    'M8 15h.01', 'M12 15h.01', 'M16 15v2'] },
  pin:        { p: ['M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11z'], c: [[12, 10, 2.5]] },
  cart:       { p: ['M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.2a1 1 0 0 0 1-.8L20 8H6'],
                c: [[9, 20, 1.2], [17, 20, 1.2]] },
  hardhat:    { p: ['M3 17h18', 'M5 17v-2a7 7 0 0 1 14 0v2', 'M10 5.5V4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5'] },
  box:        { p: ['M21 8.5 12 4 3 8.5v7L12 20l9-4.5v-7z', 'M3 8.5 12 13l9-4.5', 'M12 13v7'] },
  card:       { p: ['M3 6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11z',
                    'M3 10h18', 'M7 15h4'] },
  settings:   { p: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
                    'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z'] },
  grid:       { p: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'] },

  // ── Aksi & status ────────────────────────────────────────────────────────
  check:      { p: ['m5 12.5 4.5 4.5L19 7.5'] },
  x:          { p: ['M6 6l12 12', 'M18 6 6 18'] },
  alert:      { p: ['M12 8v5', 'M12 17h.01', 'M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'] },
  info:       { p: ['M12 16v-5', 'M12 8h.01'], c: [[12, 12, 9]] },
  clock:      { p: ['M12 7v5l3 2'], c: [[12, 12, 9]] },
  download:   { p: ['M12 3v12', 'm7 11 5 5 5-5', 'M4 20h16'] },
  upload:     { p: ['M12 16V4', 'm7 8 5-5 5 5', 'M4 20h16'] },
  file:       { p: ['M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7l-4-4z', 'M14 3v4h4'] },
  search:     { p: ['m20 20-3.5-3.5'], c: [[11, 11, 6]] },
  plus:       { p: ['M12 5v14', 'M5 12h14'] },
  chevron:    { p: ['m9 6 6 6-6 6'] },
  logout:     { p: ['M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4', 'm16 16 5-4-5-4', 'M21 12H9'] },
  user:       { p: ['M4 21v-1a6 6 0 0 1 12 0v1'], c: [[10, 8, 4]] },

  // ── Aksi baris tabel ─────────────────────────────────────────────────────
  eye:        { p: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z'], c: [[12, 12, 3]] },
  trash:      { p: ['M3 6h18', 'M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2',
                    'M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6', 'M10 11v6', 'M14 11v6'] },
  pencil:     { p: ['M12 20h9', 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z'] },
  lock:       { p: ['M5 11h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z',
                    'M8 11V7a4 4 0 0 1 8 0v4'] },
  'check-circle': { p: ['m8.5 12 2.5 2.5 4.5-5'], c: [[12, 12, 9]] },
};

const def = computed<Def>(() => ICONS[props.name] || ICONS.grid);
const paths = computed(() => def.value.p);
const circles = computed(() => def.value.c || []);
</script>
