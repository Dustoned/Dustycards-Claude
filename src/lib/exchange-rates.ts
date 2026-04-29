const FRANKFURTER_USD_EUR_URL =
  "https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR";
const EXCHANGE_RATE_TIMEOUT_MS = 5_000;
const EXCHANGE_RATE_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

export interface CurrencyExchangeRate {
  from: "USD";
  to: "EUR";
  rate: number;
  date: string;
  source: "frankfurter";
}

let usdToEurCache: {
  fetchedAt: number;
  rate: CurrencyExchangeRate;
} | null = null;
let usdToEurInflight: Promise<CurrencyExchangeRate | null> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number") return null;
  return Number.isFinite(value) ? value : null;
}

function readDateString(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  return value;
}

export function parseUsdToEurRateResponse(data: unknown): CurrencyExchangeRate | null {
  if (Array.isArray(data)) {
    for (const entry of data) {
      if (!isRecord(entry)) continue;

      const base = typeof entry.base === "string" ? entry.base.toUpperCase() : null;
      const quote = typeof entry.quote === "string" ? entry.quote.toUpperCase() : null;
      const rate = readFiniteNumber(entry.rate);
      const date = readDateString(entry.date);

      if (base === "USD" && quote === "EUR" && rate != null && date) {
        return {
          from: "USD",
          to: "EUR",
          rate,
          date,
          source: "frankfurter",
        };
      }
    }
  }

  if (isRecord(data) && isRecord(data.rates)) {
    const base = typeof data.base === "string" ? data.base.toUpperCase() : null;
    const rate = readFiniteNumber(data.rates.EUR);
    const date = readDateString(data.date);

    if (base === "USD" && rate != null && date) {
      return {
        from: "USD",
        to: "EUR",
        rate,
        date,
        source: "frankfurter",
      };
    }
  }

  return null;
}

async function fetchUsdToEurRate(): Promise<CurrencyExchangeRate | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), EXCHANGE_RATE_TIMEOUT_MS);

  try {
    const response = await fetch(FRANKFURTER_USD_EUR_URL, {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) return null;

    return parseUsdToEurRateResponse(await response.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getUsdToEurRate(): Promise<CurrencyExchangeRate | null> {
  const now = Date.now();
  if (usdToEurCache && now - usdToEurCache.fetchedAt < EXCHANGE_RATE_CACHE_TTL_MS) {
    return usdToEurCache.rate;
  }

  if (!usdToEurInflight) {
    usdToEurInflight = fetchUsdToEurRate()
      .then((rate) => {
        if (rate) {
          usdToEurCache = {
            fetchedAt: Date.now(),
            rate,
          };
        }

        return rate ?? usdToEurCache?.rate ?? null;
      })
      .finally(() => {
        usdToEurInflight = null;
      });
  }

  return usdToEurInflight;
}

export function convertUsdToEur(
  amountUsd: number,
  rate: CurrencyExchangeRate | null
): number | null {
  if (!rate || !Number.isFinite(amountUsd)) return null;

  return Number((amountUsd * rate.rate).toFixed(2));
}

export function __resetExchangeRateCacheForTests() {
  usdToEurCache = null;
  usdToEurInflight = null;
}
