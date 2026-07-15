/**
 * Format a number as currency with spaces between thousands
 * Example: 1270074.55 -> €1 270 074.55
 */
export function formatCurrency(value, currency = '€') {
  const parts = Math.abs(value).toFixed(2).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  // Add spaces every 3 digits from the right
  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // Add negative sign if needed
  const sign = value < 0 ? '-' : '';

  return `${sign}${currency}${formattedInteger}.${decimalPart}`;
}

/**
 * Format a number with spaces between thousands (no currency symbol)
 * Example: 1270074 -> 1 270 074
 */
export function formatNumber(value) {
  const intValue = Math.round(value);
  return intValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}