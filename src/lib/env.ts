const REQUIRED = ["DATABASE_URL", "RAPIDAPI_KEY", "RAPIDAPI_HOST"] as const;

type RequiredKey = (typeof REQUIRED)[number];

let cached: Record<RequiredKey, string> | null = null;

export function getEnv(): Record<RequiredKey, string> {
  if (cached) return cached;

  const missing: string[] = [];
  const resolved = {} as Record<RequiredKey, string>;

  for (const key of REQUIRED) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      missing.push(key);
    } else {
      resolved[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}. ` +
        `Add them to .env (see .env.example).`
    );
  }

  cached = resolved;
  return cached;
}

export function getRapidApiHeaders(): Record<string, string> {
  const env = getEnv();
  return {
    "x-rapidapi-key": env.RAPIDAPI_KEY,
    "x-rapidapi-host": env.RAPIDAPI_HOST,
  };
}
