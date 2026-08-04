export interface FirecrawlKeyEnvironment {
  primary?: string;
  secondary?: string;
  pool?: string;
}

function normalizeKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "your-firecrawl-api-key") return null;
  return trimmed;
}

export function collectFirecrawlApiKeys(input: FirecrawlKeyEnvironment): string[] {
  const pooled = input.pool?.split(/[\s,;]+/) ?? [];
  return [...new Set(
    [input.primary, input.secondary, ...pooled]
      .map(normalizeKey)
      .filter((value): value is string => Boolean(value))
  )];
}

export function rotateFirecrawlApiKeys(keys: string[], startIndex: number): string[] {
  if (keys.length < 2) return [...keys];
  const start = ((startIndex % keys.length) + keys.length) % keys.length;
  return [...keys.slice(start), ...keys.slice(0, start)];
}
