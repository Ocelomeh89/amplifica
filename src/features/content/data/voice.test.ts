import { describe, expect, it } from "vitest";
import { getVoice, postVoice, type VoiceDb } from "./voice";

const NOW = new Date("2026-10-07T12:00:00Z");
const good = {
  profile_md: "p".repeat(400),
  exemplars: [{ path: "C - Writing/a.md", excerpt: "e".repeat(300) }],
  files: [{ path: "C - Writing/a.md", mtime: "2026-10-07T01:00:00Z", bytes: 10 }],
};

function fakeDb(existing: { profile_md: string } | null = null) {
  const upserts: unknown[] = [];
  const db: VoiceDb = {
    voice: async () => (existing ? { profile_md: existing.profile_md, exemplars: [], built_from: { files: [] }, built_at: "2026-09-01T00:00:00Z" } : null),
    upsertVoice: async (a) => { upserts.push(a); },
  };
  return { db, upserts };
}

describe("getVoice", () => {
  it("returns null and stale when nothing is built", async () => {
    const r = await getVoice(fakeDb().db, NOW);
    expect(r.body).toEqual({ voice: null, voice_stale: true });
  });
  it("returns the profile and its built_from files", async () => {
    const r = await getVoice(fakeDb({ profile_md: "old" }).db, NOW);
    const b = r.body as { voice: { profile_md: string; files: unknown[] }; voice_stale: boolean };
    expect(b.voice.profile_md).toBe("old");
    expect(b.voice.files).toEqual([]);
    expect(b.voice_stale).toBe(true);
  });
});

describe("postVoice", () => {
  it("upserts, stamping built_at and keeping the previous profile for revert", async () => {
    const { db, upserts } = fakeDb({ profile_md: "the old profile" });
    const r = await postVoice(db, good, NOW);
    expect(r.status).toBe(200);
    expect(upserts[0]).toMatchObject({ previous_profile_md: "the old profile", built_at: NOW.toISOString(), profile_md: good.profile_md });
  });
  it("has an empty previous profile on the first build", async () => {
    const { db, upserts } = fakeDb(null);
    await postVoice(db, good, NOW);
    expect(upserts[0]).toMatchObject({ previous_profile_md: "" });
  });
  it("writes nothing on an invalid body", async () => {
    const { db, upserts } = fakeDb();
    const r = await postVoice(db, { ...good, exemplars: [] }, NOW);
    expect(r.status).toBe(400);
    expect(upserts).toHaveLength(0);
  });
});
