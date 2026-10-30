/** Amounts are stored as integer minor units (x100). */
const MINOR_UNITS_PER_MAJOR = 100;

const LOCALE = 'en-US';

/** Currencies whose fractional units are not worth showing. */
const WHOLE_UNIT_CURRENCIES = new Set(['UZS']);

const formatters = new Map<string, Intl.NumberFormat>();

function moneyFormat(currency: string, signDisplay: Intl.NumberFormatOptions['signDisplay']) {
  const key = `${currency}:${signDisplay}`;
  let formatter = formatters.get(key);

  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      signDisplay,
      trailingZeroDisplay: 'stripIfInteger',
      ...(WHOLE_UNIT_CURRENCIES.has(currency) && { maximumFractionDigits: 0 }),
    });

    formatters.set(key, formatter);
  }

  return formatter;
}

/** Unsigned money, e.g. `UZS 1,234,567` or `$1,800`. */
export const formatMoney = (minorUnits: number, currency: string) =>
  moneyFormat(currency, 'never').format(minorUnits / MINOR_UNITS_PER_MAJOR);

/** Money with a sign only when negative, e.g. a balance. */
export const formatBalance = (minorUnits: number, currency: string) =>
  moneyFormat(currency, 'negative').format(minorUnits / MINOR_UNITS_PER_MAJOR);

/** Money with an explicit + or - sign. */
export const formatSigned = (minorUnits: number, currency: string) =>
  moneyFormat(currency, 'exceptZero').format(minorUnits / MINOR_UNITS_PER_MAJOR);

const compactFormat = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Compact axis label: 1.2M, 340K. */
export const formatShort = (minorUnits: number) =>
  compactFormat.format(Math.abs(minorUnits) / MINOR_UNITS_PER_MAJOR);
