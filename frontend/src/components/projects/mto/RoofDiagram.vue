<template>
  <div class="diagram-wrap">
    <svg viewBox="0 0 200 160" class="diagram-svg">
      <!-- Roof profile / side view -->
      <!-- Roof ridge -->
      <polygon :points="roofPoints" fill="#fecaca" stroke="#ef4444" stroke-width="1.5"/>
      <!-- Overhang lines -->
      <line :x1="10" :y1="gY" :x2="ridge_x" :y2="ridgeY" stroke="#dc2626" stroke-width="1" stroke-dasharray="4,3"/>
      <line :x1="190" :y1="gY" :x2="ridge_x" :y2="ridgeY" stroke="#dc2626" stroke-width="1" stroke-dasharray="4,3"/>
      <!-- Rafters -->
      <line v-for="i in 4" :key="i" :x1="10 + (180 / 4) * i" :y1="gY" :x2="ridge_x" :y2="ridgeY" stroke="#b91c1c" stroke-width="0.8" opacity="0.5"/>
      <!-- Ground platform -->
      <rect x="10" :y="gY" width="180" height="8" fill="#94a3b8" rx="2"/>

      <!-- Slope angle -->
      <text :x="ridge_x" :y="ridgeY - 6" text-anchor="middle" font-size="8" fill="#dc2626" font-weight="700">{{ p.slope_deg || 30 }}°</text>
      <!-- Area label -->
      <text x="100" y="155" text-anchor="middle" font-size="8" fill="#64748b">Luas lantai: {{ p.floor_area || 50 }} m²</text>
    </svg>
    <div class="diagram-label">Tampak Samping — Atap</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ params: any }>();
const p = computed(() => props.params || {});

const gY = 120;
const ridge_x = 100;
const ridgeY = computed(() => {
  const halfSpan = 90; // px
  const slope_rad = ((p.value.slope_deg || 30) * Math.PI) / 180;
  return gY - halfSpan * Math.tan(slope_rad);
});
const roofPoints = computed(() => `10,${gY} ${ridge_x},${ridgeY.value} 190,${gY}`);
</script>

<style scoped>
.diagram-wrap { text-align: center; width: 100%; }
.diagram-svg { width: 100%; max-width: 200px; height: auto; }
.diagram-label { font-size: 0.65rem; color: #94a3b8; margin-top: 6px; }
</style>
