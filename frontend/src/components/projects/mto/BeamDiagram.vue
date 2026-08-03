<template>
  <div class="diagram-wrap">
    <svg viewBox="0 0 200 160" class="diagram-svg">
      <!-- Beam cross-section and side view -->
      <!-- Side view (left half) -->
      <rect x="10" :y="beamY" width="100" :height="beamH" fill="#a78bfa" rx="2"/>
      <rect x="10" :y="beamY" width="100" :height="beamH" fill="none" stroke="#7c3aed" stroke-width="1.5"/>
      <!-- Stirrups in beam -->
      <line v-for="i in 5" :key="i" :x1="10 + 18 * i" :y1="beamY + 3" :x2="10 + 18 * i" :y2="beamY + beamH - 3" stroke="#fbbf24" stroke-width="1" stroke-dasharray="2,2"/>
      <!-- Rebar -->
      <circle cx="20" :cy="beamY + beamH - 6" r="3" fill="#ef4444"/>
      <circle cx="100" :cy="beamY + beamH - 6" r="3" fill="#ef4444"/>

      <!-- Dimension width -->
      <text x="60" :y="beamY - 4" text-anchor="middle" font-size="8" fill="#7c3aed" font-weight="600">L={{ p.total_length || 10 }}m</text>

      <!-- Cross section (right) -->
      <rect :x="csx" :y="csy" :width="csW" :height="csH" fill="#ddd6fe" rx="2"/>
      <rect :x="csx" :y="csy" :width="csW" :height="csH" fill="none" stroke="#7c3aed" stroke-width="1.5"/>
      <!-- Rebar in cross-section -->
      <circle :cx="csx + 5" :cy="csy + csH - 5" r="2.5" fill="#ef4444"/>
      <circle :cx="csx + csW - 5" :cy="csy + csH - 5" r="2.5" fill="#ef4444"/>
      <circle :cx="csx + 5" :cy="csy + 5" r="2.5" fill="#fbbf24"/>
      <circle :cx="csx + csW - 5" :cy="csy + 5" r="2.5" fill="#fbbf24"/>

      <!-- B×H label -->
      <text :x="csx + csW / 2" :y="160" text-anchor="middle" font-size="8" fill="#6d28d9" font-weight="600">{{ bLabel }}</text>

      <!-- Divider -->
      <line x1="116" y1="10" x2="116" y2="150" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="3,3"/>
      <text x="155" y="20" text-anchor="middle" font-size="8" fill="#94a3b8">Potongan</text>
    </svg>
    <div class="diagram-label">Tampak Samping & Potongan — Balok</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ params: any }>();
const p = computed(() => props.params || {});
const beamH = computed(() => Math.min(Math.max((p.value.H || 0.5) * 100, 25), 80));
const beamY = computed(() => 90 - beamH.value / 2);
const csW   = computed(() => Math.min(Math.max((p.value.B || 0.25) * 120, 25), 60));
const csH   = computed(() => beamH.value);
const csx   = computed(() => 120 + (60 - csW.value) / 2);
const csy   = computed(() => beamY.value);
const bLabel = computed(() => `${((p.value.B||0.25)*1000).toFixed(0)}×${((p.value.H||0.5)*1000).toFixed(0)}mm`);
</script>

<style scoped>
.diagram-wrap { text-align: center; width: 100%; }
.diagram-svg { width: 100%; max-width: 200px; height: auto; }
.diagram-label { font-size: 0.65rem; color: #94a3b8; margin-top: 6px; }
</style>
