import { describe, expect, it } from "vitest";
import { createLatestSettingsSaveQueue } from "@/lib/settings-save-queue";
import { DEFAULT_SETTINGS, type UserSettings } from "@/lib/user-settings";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function withAppearance(preset: UserSettings["appearance"]["preset"]): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    appearance: {
      ...DEFAULT_SETTINGS.appearance,
      preset,
    },
  };
}

function withCustomPrimary(primary: string): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    appearance: {
      preset: "custom",
      custom: {
        ...DEFAULT_SETTINGS.appearance.custom,
        primary,
      },
    },
  };
}

describe("latest settings save queue", () => {
  it("serializes account writes and keeps the latest custom palette", async () => {
    const firstGate = deferred();
    const lastGate = deferred();
    const savedColors: string[] = [];
    const queue = createLatestSettingsSaveQueue(async (settings) => {
      savedColors.push(settings.appearance.custom.primary);
      if (savedColors.length === 1) await firstGate.promise;
      if (savedColors.length === 2) await lastGate.promise;
    });

    const firstSave = queue.enqueue(withCustomPrimary("#A13D63"));
    await Promise.resolve();
    queue.enqueue(withCustomPrimary("#146F5A"));
    const lastSave = queue.enqueue(withCustomPrimary("#2457A6"));

    expect(savedColors).toEqual(["#A13D63"]);
    firstGate.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(savedColors).toEqual(["#A13D63", "#2457A6"]);

    lastGate.resolve();
    await Promise.all([firstSave, lastSave]);
    expect(savedColors.at(-1)).toBe("#2457A6");
  });

  it("continues with a newer theme when an earlier account write fails", async () => {
    const firstGate = deferred();
    const savedPresets: string[] = [];
    const queue = createLatestSettingsSaveQueue(async (settings) => {
      savedPresets.push(settings.appearance.preset);
      if (savedPresets.length === 1) {
        await firstGate.promise;
        throw new Error("temporary failure");
      }
    });

    const save = queue.enqueue(withAppearance("rose-quartz"));
    await Promise.resolve();
    queue.enqueue(withAppearance("custom"));
    firstGate.resolve();
    await save;

    expect(savedPresets).toEqual(["rose-quartz", "custom"]);
  });
});
