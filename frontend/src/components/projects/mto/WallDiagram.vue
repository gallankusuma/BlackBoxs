<template>
  <div class="diagram-wrap">
    <svg viewBox="0 0 200 160" class="diagram-svg">
      <!-- Wall elevation -->
      <rect x="30" y="15" width="140" height="100" fill="#f1f5f9" rx="3"/>
      <rect x="30" y="15" width="140" height="100" fill="none" stroke="#6b7280" stroke-width="2"/>
      <!-- Brick pattern -->
      <line v-for="i in 5" :key="`h${i}`" x1="30" :y1="15 + 18 * i" x2="170" :y2="15 + 18 * i" stroke="#94a3b8" stroke-width="0.8"/>
      <line v-for="j in 8" :key="`v${j}`" :x1="30 + 17 * j" y1="15" :x2="30 + 17 * j" y2="115" stroke="#94a3b8" stroke-width="0.8"/>
      <!-- Offset alternating lines for brick look -->
      <line v-for="k in 4" :key="`a${k}`" :x1="38 + 17 * k * 2" :y1="15 + 18" :x2="38 + 17 * k * 2" :y2="15 + 36" stroke="#94a3b8" stroke-width="0.8"/>

      <!-- Labels -->
      <text x="100" y="10" text-anchor="middle" font-size="8" fill="#4b5563" font-weight="700">Elevasi Dinding</text>
      <text x="100" y="130" text-anchor="middle" font-size="8" fill="#64748b">A = {{ p.area || 30 }} m²</text>
      <text x="100" y="142" text-anchor="middle" font-size="7" fill="#94a3b8">Tebal: {{ p.thickness_mm || 150 }} mm</text>

      <!-- Plaster indicator -->
      <rect x="28" y="15" width="2" height="100" fill="#fbbf24" opacity="0.8"/>
      <rect x="170" y="15" width="2" height="100" fill="#fbbf24" opacity="0.8"/>
      <text x="13" y="68" font-size="7" fill="#d97706" transform="rotate(-90 13 68)">Plester</text>
    </svg>
    <div class="diagram-label">Elevasi — Dinding</div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ params: any }>();
const p = props.params || {};
</script>

<style scoped>
.diagram-wrap { text-align: center; width: 100%; }
.diagram-svg { width: 100%; max-width: 200px; height: auto; }
.diagram-label { font-size: 0.65rem; color: #94a3b8; margin-top: 6px; }
</style>
