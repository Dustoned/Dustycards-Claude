import { db } from "@/lib/db";

const ONE_PIECE_LIBRARY_ENABLED_KEY = "one_piece_library_enabled";

export interface AppFeatures {
  onePieceLibraryEnabled: boolean;
}

export const DEFAULT_APP_FEATURES: AppFeatures = {
  onePieceLibraryEnabled: false,
};

function parseBoolean(value: string | null | undefined): boolean {
  return value === "true" || value === "1";
}

export async function getAppFeatures(): Promise<AppFeatures> {
  if (!db.appSetting?.findUnique) {
    return DEFAULT_APP_FEATURES;
  }

  const row = await db.appSetting.findUnique({
    where: { key: ONE_PIECE_LIBRARY_ENABLED_KEY },
    select: { value: true },
  });

  return {
    onePieceLibraryEnabled: parseBoolean(row?.value),
  };
}

export async function isOnePieceLibraryEnabled(): Promise<boolean> {
  return (await getAppFeatures()).onePieceLibraryEnabled;
}

export async function setOnePieceLibraryEnabled(enabled: boolean): Promise<AppFeatures> {
  await db.appSetting.upsert({
    where: { key: ONE_PIECE_LIBRARY_ENABLED_KEY },
    create: {
      key: ONE_PIECE_LIBRARY_ENABLED_KEY,
      value: enabled ? "true" : "false",
    },
    update: {
      value: enabled ? "true" : "false",
    },
  });

  return {
    onePieceLibraryEnabled: enabled,
  };
}
