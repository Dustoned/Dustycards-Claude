import { describe, expect, it } from "vitest";
import packageJson from "../../package.json";
import { releaseNotes } from "@/lib/release-notes";

describe("releaseNotes", () => {
  it("keeps the current app version as the latest chapter", () => {
    expect(releaseNotes[0]?.version).toBe(packageJson.version);
  });

  it("uses unique version chapters with readable sections", () => {
    const versions = releaseNotes.map((note) => note.version);
    expect(new Set(versions).size).toBe(versions.length);

    for (const note of releaseNotes) {
      expect(note.title.trim().length).toBeGreaterThan(0);
      expect(note.summary.trim().length).toBeGreaterThan(0);
      expect(note.sections.length).toBeGreaterThan(0);
      expect(note.sections.every((section) => section.highlights.length > 0)).toBe(true);
    }
  });
});
