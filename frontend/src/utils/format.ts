/**
 * Centralized currency formatter — Indonesian Rupiah (Rp)
 */
const rpFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const rpFormatterDecimal = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Format a number as Indonesian Rupiah.
 * @param value - number or string to format
 * @param decimals - whether to show 2 decimal places (default: false → no decimals)
 * @returns formatted string like "Rp 1.500.000" or "Rp 1.500.000,50"
 */
export const formatCurrency = (value: number | string | null | undefined, decimals = false): string => {
  const num = Number(value);
  if (isNaN(num)) return 'Rp 0';
  return decimals ? rpFormatterDecimal.format(num) : rpFormatter.format(num);
};
