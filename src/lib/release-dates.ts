type ParsedReleaseDate = {
  date: Date;
  hasMonth: boolean;
  hasDay: boolean;
};

function parseReleaseDate(value: string | null): ParsedReleaseDate | null {
  if (!value) return null;

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : 1;
  const day = match[3] ? Number(match[3]) : 1;

  if (!Number.isInteger(year)) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > 31) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return {
    date,
    hasMonth: Boolean(match[2]),
    hasDay: Boolean(match[3]),
  };
}

export function formatReleaseLabel(
  value: string | null,
  options: { includeDay?: boolean } = {}
): string | null {
  if (!value) return null;

  const parsed = parseReleaseDate(value);
  if (!parsed) {
    const raw = String(value).trim();
    return raw || null;
  }

  if (!parsed.hasMonth) {
    return String(parsed.date.getFullYear());
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    ...(options.includeDay && parsed.hasDay ? { day: "numeric" } : {}),
    year: "numeric",
  });

  return formatter.format(parsed.date);
}

export function isFutureReleaseDate(value: string | null, now = new Date()): boolean {
  const parsed = parseReleaseDate(value);
  if (!parsed) return false;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return parsed.date.getTime() > today.getTime();
}
