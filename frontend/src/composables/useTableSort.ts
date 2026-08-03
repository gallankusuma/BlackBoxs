import { ref, computed, type Ref, type ComputedRef } from 'vue';

type SortDir = 'asc' | 'desc' | null;

export function useTableSort<T>(dataSource: Ref<T[]> | ComputedRef<T[]>) {
  const sortKey = ref<string | null>(null);
  const sortDir = ref<SortDir>(null);

  function toggleSort(key: string) {
    if (sortKey.value === key) {
      if (sortDir.value === 'asc') sortDir.value = 'desc';
      else if (sortDir.value === 'desc') { sortKey.value = null; sortDir.value = null; }
      else sortDir.value = 'asc';
    } else {
      sortKey.value = key;
      sortDir.value = 'asc';
    }
  }

  function sortIcon(key: string): string {
    if (sortKey.value !== key) return '↕';
    return sortDir.value === 'asc' ? '↑' : '↓';
  }

  const sortedData = computed<T[]>(() => {
    const data = [...dataSource.value];
    if (!sortKey.value || !sortDir.value) return data;
    const k = sortKey.value;
    const dir = sortDir.value === 'asc' ? 1 : -1;

    return data.sort((a: any, b: any) => {
      let va = a[k];
      let vb = b[k];
      if (va == null) va = '';
      if (vb == null) vb = '';
      if (typeof va === 'boolean') return (va === vb ? 0 : va ? -1 : 1) * dir;
      if (typeof va === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb), 'id') * dir;
    });
  });

  return { sortKey, sortDir, toggleSort, sortIcon, sortedData };
}
