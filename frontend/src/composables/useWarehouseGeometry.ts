import { computed, type Ref } from 'vue';

export interface WarehouseGeometryResult {
  bayCount: number;
  actualBaySpacing: number;
  columnsPerSide: number;
  totalColumns: number;
  tieBeamLength: number;
  suggestedWidthDivisions: number;
  widthDivisions: number;
  purlinSpacing: number;
  floorArea: number;
  roofPerimeter: number;
}

// Smallest divisor (2-8) that keeps purlin spacing at or under the main bay spacing —
// purlins shouldn't span wider than the primary frame module. Just a starting default;
// width_divisions stays fully user-editable in the wizard.
function suggestWidthDivisions(width: number, target: number): number {
  for (let d = 2; d <= 8; d++) {
    if (width / d <= target) return d;
  }
  return 8;
}

// Portal-frame warehouse geometry: columns only on the 2 long sides (length axis,
// fixed market bay spacing e.g. 6m), width axis has no interior columns — it only
// determines roof purlin spacing.
export function useWarehouseGeometry(design: Ref<Record<string, any>>) {
  const length = computed(() => Number(design.value.length) || 0);
  const width = computed(() => Number(design.value.width) || 0);
  const baySpacing = computed(() => Number(design.value.bay_spacing) || 6);

  const bayCount = computed(() => Math.max(1, Math.round(length.value / (baySpacing.value || 6))));
  const actualBaySpacing = computed(() => +(length.value / bayCount.value || baySpacing.value).toFixed(2));
  const columnsPerSide = computed(() => bayCount.value + 1);
  const totalColumns = computed(() => columnsPerSide.value * 2);
  const tieBeamLength = computed(() => +(2 * length.value + 2 * width.value).toFixed(1));

  const suggestedWidthDivisions = computed(() => suggestWidthDivisions(width.value || 1, baySpacing.value || 6));
  const widthDivisions = computed(() => {
    const raw = Number(design.value.width_divisions);
    if (!raw) return suggestedWidthDivisions.value;
    return Math.min(8, Math.max(2, Math.round(raw)));
  });
  const purlinSpacing = computed(() => (widthDivisions.value ? +(width.value / widthDivisions.value).toFixed(2) : 0));

  const floorArea = computed(() => +(length.value * width.value).toFixed(1));
  const roofPerimeter = computed(() => +(2 * (length.value + width.value)).toFixed(1));

  const geometry = computed<WarehouseGeometryResult>(() => ({
    bayCount: bayCount.value,
    actualBaySpacing: actualBaySpacing.value,
    columnsPerSide: columnsPerSide.value,
    totalColumns: totalColumns.value,
    tieBeamLength: tieBeamLength.value,
    suggestedWidthDivisions: suggestedWidthDivisions.value,
    widthDivisions: widthDivisions.value,
    purlinSpacing: purlinSpacing.value,
    floorArea: floorArea.value,
    roofPerimeter: roofPerimeter.value,
  }));

  return {
    geometry,
    bayCount, actualBaySpacing, columnsPerSide, totalColumns, tieBeamLength,
    suggestedWidthDivisions, widthDivisions, purlinSpacing, floorArea, roofPerimeter,
  };
}
