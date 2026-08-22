const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["https:", "http:"]);

/** Rejects executable, credential-bearing and malformed external URLs. */
export function parseSafeExternalUrl(value: string | null | undefined): URL | null {
  const input = value?.trim();
  if (!input) return null;
  try {
    const parsed = new URL(input);
    if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function safeExternalHref(value: string | null | undefined): string | null {
  return parseSafeExternalUrl(value)?.toString() ?? null;
}
