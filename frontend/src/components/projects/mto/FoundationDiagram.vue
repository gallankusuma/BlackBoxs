<!-- Foundation SVG Diagram — cross-section view with live dimension labels -->
<template>
  <div class="diagram-wrap">
    <svg :viewBox="`0 0 ${SW} ${SH}`" class="diagram-svg">
      <!-- Soil/ground indicator -->
      <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#c4a882" stroke-width="1.5" />
      </pattern>

      <!-- Excavation zone -->
      <rect :x="excX" :y="topY" :width="excW" :height="excH" fill="url(#hatch)" opacity="0.4" rx="2"/>
      <rect :x="excX" :y="topY" :width="excW" :height="excH" fill="none" stroke="#c4a882" stroke-width="1" stroke-dasharray="4,3"/>

      <!-- Footing body -->
      <rect :x="footX" :y="footY" :width="footW" :height="footH" fill="#94a3b8" rx="3"/>
      <!-- Footing top border -->
      <line :x1="footX" :y1="footY" :x2="footX + footW" :y2="footY" stroke="#64748b" stroke-width="2"/>

      <!-- Rebar indicators (simplified) -->
      <circle v-for="i in 4" :key="i" :cx="footX + 10 + ((footW - 20) / 3) * (i - 1)" :cy="footY + footH - 10" r="3" fill="#ef4444" />

      <!-- Dimension: Width (L) -->
      <g>
        <line :x1="footX" :y1="SH - 12" :x2="footX + footW" :y2="SH - 12" stroke="#3b82f6" stroke-width="1.5" marker-end="url(#arr)" marker-start="url(#arr)"/>
        <text :x="footX + footW / 2" :y="SH - 2" text-anchor="middle" font-size="9" fill="#3b82f6" font-weight="600">L={{ p.L || 1.5 }}m</text>
      </g>

      <!-- Dimension: Height (H) -->
      <g>
        <line :x1="SW - 12" :y1="footY" :x2="SW - 12" :y2="footY + footH" stroke="#f59e0b" stroke-width="1.5"/>
        <text :x="SW - 2" :y="footY + footH / 2" text-anchor="middle" font-size="9" fill="#f59e0b" font-weight="600" transform="rotate(90)" :transform-origin="`${SW - 2} ${footY + footH / 2}`">H={{ p.H || 0.5 }}m</text>
      </g>

      <!-- Ground line -->
      <line x1="0" :y1="topY" :x2="SW" :y2="topY" stroke="#78716c" stroke-width="1.5" stroke-dasharray="8,4"/>
      <text x="4" :y="topY - 3" font-size="8" fill="#78716c">GL ±0.00</text>

      <!-- Qty badge -->
      <rect x="4" :y="footY + 4" width="36" height="16" rx="4" fill="#0f172a" opacity="0.8"/>
      <text x="22" :y="footY + 15" text-anchor="middle" font-size="8" fill="white" font-weight="700">×{{ p.qty || 1 }}</text>
    </svg>
    <div class="diagram-label">Tampak Depan — Pondasi {{ typeLabel }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ params: any }>();
const p = computed(() => props.params || {});

const SW = 200, SH = 180;
const scale = 60; // px per meter

const footW = computed(() => Math.min(Math.max((p.value.L || 1.5) * scale, 40), SW - 40));
const footH = computed(() => Math.min(Math.max((p.value.H || 0.5) * scale, 20), SH - 60));
const topY = 30;
const footX = computed(() => (SW - footW.value) / 2);
const footY = computed(() => topY + 10);
const ws = computed(() => (p.value.working_space || 0.3) * scale);
const excW = computed(() => footW.value + 2 * ws.value);
const excH = computed(() => footH.value);
const excX = computed(() => footX.value - ws.value);

const typeLabel = computed(() => p.value.type || 'Footplat');
</script>

<style scoped>
.diagram-wrap { text-align: center; width: 100%; }
.diagram-svg { width: 100%; max-width: 200px; height: auto; }
.diagram-label { font-size: 0.65rem; color: #94a3b8; margin-top: 6px; }
</style>
