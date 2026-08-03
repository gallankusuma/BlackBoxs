<template>
  <div class="diagram-wrap">
    <svg viewBox="0 0 200 220" class="diagram-svg">
      <!-- Elevation view: single column -->
      <!-- Ground line -->
      <line x1="10" y1="160" x2="190" y2="160" stroke="#78716c" stroke-width="1.5" stroke-dasharray="6,3"/>
      <text x="12" y="170" font-size="8" fill="#78716c">GL ±0.00</text>

      <!-- Column body -->
      <rect :x="cX" y="20" :width="cW" :height="cH" fill="#94a3b8" rx="2"/>
      <!-- Column outline -->
      <rect :x="cX" y="20" :width="cW" :height="cH" fill="none" stroke="#64748b" stroke-width="1.5"/>

      <!-- Rebar lines (longitudinal) -->
      <line v-for="i in 2" :key="`r${i}`"
        :x1="cX + 6 + (cW - 12) * (i - 1)" y1="24"
        :x2="cX + 6 + (cW - 12) * (i - 1)" :y2="20 + cH - 4"
        stroke="#ef4444" stroke-width="1.5"/>
      <!-- Stirrups (horizontal lines) -->
      <line v-for="j in stirrupCount" :key="`s${j}`"
        :x1="cX + 3" :y1="24 + (cH - 20) / stirrupCount * j"
        :x2="cX + cW - 3" :y2="24 + (cH - 20) / stirrupCount * j"
        stroke="#fbbf24" stroke-width="0.8" stroke-dasharray="2,2"/>

      <!-- Height dimension -->
      <line x1="10" y1="20" x2="10" :y2="20 + cH" stroke="#3b82f6" stroke-width="1.5"/>
      <text x="18" :y="20 + cH / 2" font-size="8" fill="#3b82f6" font-weight="600">{{ p.height_per_floor || 3.5 }}m</text>

      <!-- Width dimension -->
      <text :x="cX + cW / 2" y="15" text-anchor="middle" font-size="8" fill="#f59e0b" font-weight="600">
        {{ bLabel }}×{{ hLabel }}
      </text>

      <!-- Floor labels on right -->
      <rect v-for="f in (p.floors || 1)" :key="f"
        x="165" :y="20 + cH - cH / (p.floors || 1) * f + 2"
        width="28" height="12" rx="3" fill="#0f172a" opacity="0.7"/>
      <text v-for="f in (p.floors || 1)" :key="`fl${f}`"
        x="179" :y="20 + cH - cH / (p.floors || 1) * f + 11"
        text-anchor="middle" font-size="7" fill="white" font-weight="700">Lt.{{ f }}</text>

      <!-- Qty badge -->
      <rect x="4" y="4" width="44" height="14" rx="4" fill="#0f172a" opacity="0.8"/>
      <text x="26" y="13" text-anchor="middle" font-size="8" fill="white" font-weight="700">×{{ (p.qty_per_floor||4) * (p.floors||1) }} kolom</text>
    </svg>
    <div class="diagram-label">Tampak Samping — Kolom</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ params: any }>();
const p = computed(() => props.params || {});

const cW = computed(() => Math.min(Math.max((p.value.B || 0.3) * 120, 30), 80));
const cH = computed(() => Math.min(Math.max((p.value.height_per_floor || 3.5) * 30 * (p.value.floors || 1), 80), 160));
const cX = computed(() => (200 - cW.value) / 2);
const stirrupCount = computed(() => Math.max(2, Math.floor((p.value.height_per_floor || 3.5) / (p.value.stirrup_spacing || 0.15))));
const bLabel = computed(() => `${((p.value.B || 0.3) * 1000).toFixed(0)}`);
const hLabel = computed(() => `${((p.value.H || 0.3) * 1000).toFixed(0)}mm`);
</script>

<style scoped>
.diagram-wrap { text-align: center; width: 100%; }
.diagram-svg { width: 100%; max-width: 200px; height: auto; }
.diagram-label { font-size: 0.65rem; color: #94a3b8; margin-top: 6px; }
</style>
