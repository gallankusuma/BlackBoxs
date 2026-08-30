export interface PilihanAhspTemplate {
  id: number;
  kode: string;
  name: string;
  harga: number;
  satuan: string;
}

/**
 * Bentuk payload template yang dikirim ke backend.
 *
 * Pilihan eksplisit pengguna harus menang atas kode/harga bawaan kalkulator.
 * Backend tetap menjadi otoritas harga; nilai harga/total di sini hanya untuk
 * konsistensi preview dan akan dihitung ulang dari master AHSP aktif.
 */
export const terapkanPilihanAhsp = (
  sections: any[],
  selections: Record<string, PilihanAhspTemplate>,
) => sections.map((section: any) => ({
  code: section.code,
  name: section.name,
  description: section.description || '',
  children: (section.children || []).map((child: any) => {
    const selected = child.key ? selections[child.key] : undefined;
    const volume = child.volume;
    const harga = selected?.harga ?? child.unit_price;

    return {
      num: child.num,
      name: child.name,
      volume,
      unit: selected?.satuan ?? child.unit,
      ahsp_code: selected?.kode ?? child.ahsp_code,
      ahsp_id: selected?.id ?? child.ahsp_id,
      unit_price: harga,
      total: selected && Number.isFinite(Number(volume))
        ? Number(volume) * Number(selected.harga)
        : child.total,
    };
  }),
}));
