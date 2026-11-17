export type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'MXN';

export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CAD: 'CA$',
  MXN: 'MX$',
};

/**
 * Parses a decimal string or number into integer minor units (cents) without float drift.
 * Rejects invalid formats or negative values if allowNegative is false.
 */
export function parseDecimalToCents(input: string | number, allowNegative = false): number {
  const raw = typeof input === 'number' ? input.toFixed(4) : String(input).trim();
  const cleaned = raw.replace(/[$,€£\s]/g, '').replace(/,/g, '');
  if (!cleaned) {
    throw new Error('Monetary value is required');
  }

  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) {
    throw new Error(`Invalid monetary format: "${input}"`);
  }

  const isNegative = Boolean(match[1]);
  if (isNegative && !allowNegative) {
    throw new Error('Negative monetary values are not permitted here');
  }

  const whole = Number.parseInt(match[2], 10);
  const fracRaw = match[3] ?? '';
  const padded = (fracRaw + '000').slice(0, 3);
  const twoDigits = Number.parseInt(padded.slice(0, 2), 10);
  const thirdDigit = Number.parseInt(padded.slice(2, 3), 10);
  const roundedTwoDigits = thirdDigit >= 5 ? twoDigits + 1 : twoDigits;

  let cents = whole * 100 + roundedTwoDigits;
  if (!Number.isSafeInteger(cents)) {
    throw new Error('Monetary value exceeds safe integer range');
  }
  if (isNegative) {
    cents = -cents;
  }
  return cents;
}

export function formatCents(cents: number, currency = 'USD'): string {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  const sign = safeCents < 0 ? '-' : '';
  const abs = Math.abs(safeCents);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const formattedMajor = major.toLocaleString('en-US');
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency.toUpperCase()} `;
  return `${sign}${symbol}${formattedMajor}.${String(minor).padStart(2, '0')}`;
}

export function calculateCostLineCents(
  quantityNumerator: number,
  quantityDenominator: number,
  unitRateCents: number
): number {
  if (quantityDenominator <= 0) {
    throw new Error('Quantity denominator must be greater than zero');
  }
  if (quantityNumerator < 0 || unitRateCents < 0) {
    throw new Error('Cost quantities and unit rates must be non-negative');
  }
  const scaled = BigInt(Math.round(quantityNumerator)) * BigInt(Math.round(unitRateCents));
  const denom = BigInt(Math.round(quantityDenominator));
  // Half-up integer rounding
  const result = (scaled + denom / BigInt(2)) / denom;
  return Number(result);
}

export function calculateOutstandingBalanceCents(params: {
  expectedCreditCents: number;
  approvedAmountCents: number;
  submittedAmountCents: number;
  potentiallyRecoverableCents: number;
  recoveredAmountCents: number;
}): number {
  const target =
    params.expectedCreditCents > 0
      ? params.expectedCreditCents
      : params.approvedAmountCents > 0
        ? params.approvedAmountCents
        : params.submittedAmountCents > 0
          ? params.submittedAmountCents
          : params.potentiallyRecoverableCents;

  return Math.max(0, target - Math.max(0, params.recoveredAmountCents));
}

export function groupMonetaryTotalsByCurrency<T extends { currency: string }>(
  items: T[],
  selector: (item: T) => number
): Array<{ currency: string; totalCents: number }> {
  const map = new Map<string, number>();
  for (const item of items) {
    const code = (item.currency || 'USD').toUpperCase();
    map.set(code, (map.get(code) ?? 0) + selector(item));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, totalCents]) => ({ currency, totalCents }));
}

export function calculateRecoveryRateBps(recoveredCents: number, submittedOrTargetCents: number): number {
  if (submittedOrTargetCents <= 0 || recoveredCents <= 0) {
    return 0;
  }
  return Math.min(10000, Math.round((recoveredCents * 10000) / submittedOrTargetCents));
}

export function formatBpsAsPercent(bps: number): string {
  return `${(bps / 100).toFixed(1)}%`;
}
