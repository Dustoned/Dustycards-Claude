import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  DEFAULT_SETTINGS,
  mergeSettings,
  parseCookieSettings,
  parseStoredSettings,
  SETTINGS_COOKIE_NAME,
  type UserSettings,
} from "@/lib/user-settings";

async function getCookieSettings(): Promise<UserSettings | null> {
  try {
    const cookieStore = await cookies();
    return parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value);
  } catch {
    return null;
  }
}

// Memoized per request (React cache): a single page render calls this from the
// layout, the page, and its data loaders — this collapses those into one cookie
// + DB read instead of repeating them.
export const getServerUserSettings = cache(async function getServerUserSettings(
  userId: string | null | undefined
): Promise<UserSettings> {
  const cookieSettings = await getCookieSettings();

  if (!userId) {
    return mergeSettings(cookieSettings ?? DEFAULT_SETTINGS);
  }

  if (!db.user?.findUnique) {
    return mergeSettings(cookieSettings ?? DEFAULT_SETTINGS);
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { settings_json: true },
  });
  const accountSettings = parseStoredSettings(user?.settings_json);

  // The cookie is written synchronously, while the account copy is saved over
  // the network and can briefly lag behind during a refresh or navigation.
  return mergeSettings(cookieSettings ?? accountSettings ?? DEFAULT_SETTINGS);
});
