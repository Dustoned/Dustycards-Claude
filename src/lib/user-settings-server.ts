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

export async function getServerUserSettings(userId: string | null | undefined): Promise<UserSettings> {
  const cookieStore = await cookies();
  const cookieSettings = parseCookieSettings(cookieStore.get(SETTINGS_COOKIE_NAME)?.value);

  if (!userId) {
    return mergeSettings(cookieSettings ?? DEFAULT_SETTINGS);
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { settings_json: true },
  });
  const accountSettings = parseStoredSettings(user?.settings_json);

  return mergeSettings(accountSettings ?? cookieSettings ?? DEFAULT_SETTINGS);
}
