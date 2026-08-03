<template>
  <div class="building-diagram">
    <!-- Two-panel: Tampak Samping + Tampak Atas -->
    <div class="panels">

      <!-- ═══ TAMPAK SAMPING (Elevation) ═══ -->
      <div class="panel">
        <div class="panel-title">TAMPAK SAMPING</div>
        <svg :viewBox="`0 0 ${SW} ${SH}`" class="diagram-svg">
          <!-- Sky gradient -->
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#dbeafe" stop-opacity="0.6"/>
              <stop offset="100%" stop-color="#eff6ff" stop-opacity="0.2"/>
            </linearGradient>
            <pattern id="soil" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" stroke="#92400e" stroke-width="1.5"/>
            </pattern>
            <marker id="arrB" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#2563eb"/>
            </marker>
            <marker id="arrBr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
              <path d="M0,0 L6,3 L0,6 Z" fill="#2563eb"/>
            </marker>
          </defs>

          <!-- Sky background -->
          <rect :x="bX" :y="roofPeakY" :width="bW" :height="glY - roofPeakY" fill="url(#sky)"/>

          <!-- Soil / ground (below GL) -->
          <rect :x="bX - 10" :y="glY" :width="bW + 20" height="30" fill="url(#soil)" opacity="0.5"/>
          <rect :x="bX - 10" :y="glY" :width="bW + 20" height="30" fill="none" stroke="#92400e" stroke-width="0.5"/>

          <!-- Ground line -->
          <line :x1="bX - 15" :y1="glY" :x2="bX + bW + 15" :y2="glY" stroke="#374151" stroke-width="2"/>

          <!-- Foundations (footplates) -->
          <rect v-for="i in nColsElevation" :key="`ft${i}`"
            :x="colElevX(i) - ftW/2" :y="glY"
            :width="ftW" :height="ftH"
            fill="#94a3b8" stroke="#475569" stroke-width="1" rx="1"/>

          <!-- Building walls -->
          <rect :x="bX" :y="topY" :width="bW" :height="bH"
            fill="#f1f5f9" fill-opacity="0.8" stroke="#334155" stroke-width="1.5"/>

          <!-- Floor slabs (intermediate) -->
          <rect v-for="f in (floors - 1)" :key="`slab${f}`"
            :x="bX" :y="topY + floorH * f"
            :width="bW" height="5"
            fill="#94a3b8" stroke="#475569" stroke-width="0.8"/>

          <!-- Columns in elevation -->
          <rect v-for="i in nColsElevation" :key="`col${i}`"
            :x="colElevX(i) - colW/2" :y="topY"
            :width="colW" :height="bH"
            fill="#94a3b8" fill-opacity="0.6" stroke="#475569" stroke-width="0.8"/>

          <!-- Roof -->
          <polygon :points="roofPoints" fill="#e2e8f0" stroke="#334155" stroke-width="1.5"/>

          <!-- Floor labels -->
          <text v-for="f in floors" :key="`fl${f}`"
            :x="bX + bW + 4" :y="topY + floorH * (f - 1) + floorH/2 + 3"
            font-size="7" fill="#64748b" font-weight="600">Lt.{{ f }}</text>

          <!-- ─── Dimension: H (total height) ─── -->
          <line :x1="bX - 22" :y1="topY" :x2="bX - 22" :y2="glY"
            stroke="#2563eb" stroke-width="1.2"
            marker-start="url(#arrBr)" marker-end="url(#arrB)"/>
          <text :x="bX - 30" :y="topY + bH/2 + 4"
            font-size="8" fill="#2563eb" font-weight="700"
            text-anchor="middle"
            :transform="`rotate(-90, ${bX - 30}, ${topY + bH/2 + 4})`">
            H={{ design.height || 4 }}m×{{ design.floors || 1 }}
          </text>

          <!-- ─── Dimension: L (width in elevation) ─── -->
          <line :x1="bX" :y1="glY + 38" :x2="bX + bW" :y2="glY + 38"
            stroke="#2563eb" stroke-width="1.2"
            marker-start="url(#arrBr)" marker-end="url(#arrB)"/>
          <text :x="bX + bW/2" :y="glY + 50"
            font-size="8" fill="#2563eb" font-weight="700" text-anchor="middle">
            L={{ design.length || 10 }}m
          </text>

          <!-- GL label -->
          <text :x="bX - 14" :y="glY - 2" font-size="7" fill="#374151">GL</text>
          <text :x="bX - 14" :y="glY + 8" font-size="6" fill="#374151">±0.00</text>
        </svg>
      </div>

      <!-- ═══ TAMPAK ATAS (Plan) ═══ -->
      <div class="panel">
        <div class="panel-title">TAMPAK ATAS</div>
        <svg :viewBox="`0 0 ${PW} ${PH}`" class="diagram-svg">
          <defs>
            <marker id="arrG" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#2563eb"/>
            </marker>
            <marker id="arrGr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto-start-reverse">
              <path d="M0,0 L6,3 L0,6 Z" fill="#2563eb"/>
            </marker>
          </defs>

          <!-- Building footprint -->
          <rect :x="pX" :y="pY" :width="pW" :height="pH"
            fill="#f8fafc" stroke="#334155" stroke-width="2" rx="2"/>

          <!-- Column grid (dots at intersections) -->
          <g v-for="cx in nColsX" :key="`cx${cx}`">
            <g v-for="cy in nColsY" :key="`cy${cy}`">
              <!-- Column marker -->
              <rect
                :x="pX + (pW / (nColsX - 1)) * (cx - 1) - 4"
                :y="pY + (pH / (nColsY - 1)) * (cy - 1) - 4"
                width="8" height="8"
                fill="#475569" rx="1"/>
              <!-- Grid lines -->
              <line v-if="cy === 1 && nColsX > 1"
                :x1="pX + (pW / (nColsX - 1)) * (cx - 1)"
                :y1="pY"
                :x2="pX + (pW / (nColsX - 1)) * (cx - 1)"
                :y2="pY + pH"
                stroke="#cbd5e1" stroke-width="0.6" stroke-dasharray="3,3"/>
              <line v-if="cx === 1 && nColsY > 1"
                :x1="pX"
                :y1="pY + (pH / (nColsY - 1)) * (cy - 1)"
                :x2="pX + pW"
                :y2="pY + (pH / (nColsY - 1)) * (cy - 1)"
                stroke="#cbd5e1" stroke-width="0.6" stroke-dasharray="3,3"/>
            </g>
          </g>

          <!-- Thick boundary walls -->
          <rect :x="pX" :y="pY" :width="pW" :height="pH"
            fill="none" stroke="#1e293b" stroke-width="3"/>

          <!-- ─── Dimension: W (plan width) ─── -->
          <line :x1="pX" :y1="pY - 20" :x2="pX + pW" :y2="pY - 20"
            stroke="#2563eb" stroke-width="1.2"
            marker-start="url(#arrGr)" marker-end="url(#arrG)"/>
          <text :x="pX + pW/2" :y="pY - 24"
            font-size="8" fill="#2563eb" font-weight="700" text-anchor="middle">
            L={{ design.length || 10 }}m
          </text>

          <!-- ─── Dimension: L (plan height) ─── -->
          <line :x1="pX + pW + 20" :y1="pY" :x2="pX + pW + 20" :y2="pY + pH"
            stroke="#2563eb" stroke-width="1.2"
            marker-start="url(#arrGr)" marker-end="url(#arrG)"/>
          <text :x="pX + pW + 28" :y="pY + pH/2 + 4"
            font-size="8" fill="#2563eb" font-weight="700"
            text-anchor="middle"
            :transform="`rotate(90, ${pX + pW + 28}, ${pY + pH/2 + 4})`">
            W={{ design.width || 8 }}m
          </text>

          <!-- Column count badge -->
          <rect x="4" y="4" width="72" height="14" rx="4" fill="#1e293b" opacity="0.85"/>
          <text x="40" y="13" text-anchor="middle" font-size="7.5" fill="white" font-weight="700">
            {{ nColsX * nColsY }} titik kolom
          </text>

          <!-- Floor area badge -->
          <rect :x="pX + 4" :y="pY + 4" width="60" height="14" rx="4" fill="#2563eb" opacity="0.85"/>
          <text :x="pX + 34" :y="pY + 13" text-anchor="middle" font-size="7.5" fill="white" font-weight="700">
            {{ floorArea }} m²
          </text>
        </svg>
      </div>
    </div>

    <!-- Foundation type indicator -->
    <div class="fnd-badge">
      <span>🏗 Pondasi:</span>
      <span class="fnd-type">{{ foundationLabel }}</span>
      <span class="sep">·</span>
      <span>{{ nColsX * nColsY }} footplat</span>
      <span class="sep">·</span>
      <span v-if="columnMode === 'portal'">Bay {{ gridSpacing }}m · Purlin {{ widthSpacing || '-' }}m</span>
      <span v-else>Grid ~{{ gridSpacing }}m</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  design: Record<string, any>;
  spacing?: number;          // bay spacing along length (was hardcoded 4)
  columnMode?: 'grid' | 'portal'; // 'portal' = columns only on the 2 long sides (no interior grid)
  widthSpacing?: number;     // purlin spacing across the width, portal mode only, label purposes
}>(), {
  spacing: 4,
  columnMode: 'grid',
});
const d = computed(() => props.design || {});

// ── SVG canvas sizes ─────────────────────────────────────────────────
const SW = 220, SH = 220;
const PW = 220, PH = 220;

// ── Elevation (Tampak Samping) ───────────────────────────────────────
const floors    = computed(() => Math.max(1, d.value.floors || 1));
const scaleH    = computed(() => {
  const total = (d.value.height || 4) * floors.value;
  return Math.min(Math.max(total * 10, 60), 130);
});
const bW = 130;
const bX = (SW - bW) / 2;
const glY = SH - 55;
const bH = computed(() => scaleH.value);
const topY = computed(() => glY - bH.value);
const floorH = computed(() => bH.value / floors.value);
const ftW = 18, ftH = 18;
const nColsElevation = computed(() => Math.min(Math.ceil((d.value.length || 10) / (props.spacing || 4)) + 1, 8));
const colW = 6;
const colElevX = (i: number) => bX + ((bW - 0) / (nColsElevation.value - 1 || 1)) * (i - 1);
const roofPeakY = computed(() => topY.value - Math.min(bW * 0.35, 45));
const roofPoints = computed(() =>
  `${bX},${topY.value} ${bX + bW / 2},${roofPeakY.value} ${bX + bW},${topY.value}`
);

// ── Plan (Tampak Atas) ────────────────────────────────────────────────
const gridSpacing = computed(() => props.spacing || 4);
const nColsX = computed(() => Math.min(Math.ceil((d.value.length || 10) / gridSpacing.value) + 1, 8));
// Portal frame: columns only on the 2 long sides, never interior rows.
const nColsY = computed(() => props.columnMode === 'portal'
  ? 2
  : Math.min(Math.ceil((d.value.width || 8) / gridSpacing.value) + 1, 7));
const margin  = 35;
const pX = margin, pY = margin;
const pW = computed(() => PW - margin * 2 - 20);
const pH = computed(() => {
  const ratio = (d.value.width || 8) / (d.value.length || 10);
  return Math.min(Math.max(pW.value * ratio, 60), PH - margin * 2 - 20);
});
const floorArea = computed(() => +((d.value.length || 10) * (d.value.width || 8)).toFixed(1));

const FOUNDATION_LABELS: Record<string, string> = {
  footplate: 'Foot Plate', bored_pile: 'Bored Pile',
  mini_pile: 'Mini Pile', sumuran: 'Sumuran',
};
const foundationLabel = computed(() => FOUNDATION_LABELS[d.value.foundation_type || 'footplate'] || 'Foot Plate');
</script>

<style scoped>
.building-diagram {
  background: #f8fafc;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  overflow: hidden;
}
.panels {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
}
.panel {
  padding: 12px 8px 4px;
  border-right: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.panel:last-child { border-right: none; }
.panel-title {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 1.5px;
  color: #94a3b8;
  margin-bottom: 4px;
  text-transform: uppercase;
}
.diagram-svg {
  width: 100%;
  max-width: 220px;
  height: auto;
}
.fnd-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  background: #1e293b;
  color: #94a3b8;
  font-size: 0.68rem;
  flex-wrap: wrap;
}
.fnd-type { color: #38bdf8; font-weight: 700; }
.sep { color: #475569; }
</style>
