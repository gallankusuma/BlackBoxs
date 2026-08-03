<template>
  <div class="diagram-wrap">
    <svg viewBox="0 0 200 160" class="diagram-svg">
      <!-- Plan view of slab -->
      <rect x="20" y="20" width="160" height="100" fill="#d1fae5" rx="4"/>
      <rect x="20" y="20" width="160" height="100" fill="none" stroke="#10b981" stroke-width="2"/>
      <!-- Rebar grid X direction -->
      <line v-for="i in 5" :key="`x${i}`" :x1="20" :y1="20 + 18 * i" x2="180" :y2="20 + 18 * i" stroke="#3b82f6" stroke-width="0.8" stroke-dasharray="3,3"/>
      <!-- Rebar grid Y direction -->
      <line v-for="j in 6" :key="`y${j}`" :x1="20 + 26 * j" y1="20" :x2="20 + 26 * j" y2="120" stroke="#ef4444" stroke-width="0.8" stroke-dasharray="3,3"/>

      <!-- Labels -->
      <text x="100" y="15" text-anchor="middle" font-size="8" fill="#059669" font-weight="700">Plat Lantai — Plan</text>
      <text x="100" y="140" text-anchor="middle" font-size="8" fill="#64748b">A = {{ p.area || 20 }} m²</text>

      <!-- Thickness arrow on right -->
      <text x="185" y="75" text-anchor="start" font-size="7" fill="#f59e0b" font-weight="600" transform="rotate(90 185 75)">t={{ ((p.thickness||0.12)*1000).toFixed(0) }}mm</text>

      <!-- Legend -->
      <line x1="22" y1="150" x2="40" y2="150" stroke="#3b82f6" stroke-width="1.5"/>
      <text x="42" y="153" font-size="7" fill="#3b82f6">Tulangan X</text>
      <line x1="90" y1="150" x2="108" y2="150" stroke="#ef4444" stroke-width="1.5"/>
      <text x="110" y="153" font-size="7" fill="#ef4444">Tulangan Y</text>
    </svg>
    <div class="diagram-label">Tampak Atas — Plat Lantai</div>
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
