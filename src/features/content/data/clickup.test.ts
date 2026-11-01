import { describe, expect, it, vi } from "vitest";
import { createClickUpTask, refreshClickUpTask, taskFor, updateClickUpTask } from "./clickup";

const idea = {
  id: "abc",
  format: "reel" as const,
  title: "A W-2 is a runway, not a cage",
  hook: "I took a new W-2 job this month.",
  belief_attacked: "You must quit to build FI",
  value_to_listener: "A rule for raises",
  why_it_stops: "Contradicts the pitch",
  outline: [{ beat: "Offer letter on screen" }, { beat: "The rule" }],
};

describe("taskFor", () => {
  it("names the task [Format] hook and links the idea", () => {
    const t = taskFor(idea, "https://amplificawealth.com");
    expect(t.name).toBe("[Reel] I took a new W-2 job this month.");
    expect(t.markdown).toContain("https://amplificawealth.com/content/ideas/abc");
    expect(t.markdown).toContain("Offer letter on screen");
    expect(t.markdown).toContain("You must quit to build FI");
  });
  it("truncates a long hook in the name", () => {
    const t = taskFor({ ...idea, hook: "x".repeat(300) }, "https://a.b");
    expect(t.name.length).toBeLessThanOrEqual(200);
  });
});

describe("createClickUpTask", () => {
  const env = { token: "pk_test", listId: "901113803092" };

  it("posts to the list with the token and returns id and url", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ id: "t1", url: "https://app.clickup.com/t/t1" }), { status: 200 })
    );
    const out = await createClickUpTask({ name: "n", markdown: "m" }, env, fetchImpl as unknown as typeof fetch);
    expect(out).toEqual({ id: "t1", url: "https://app.clickup.com/t/t1" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.clickup.com/api/v2/list/901113803092/task");
    expect((init.headers as Record<string, string>).Authorization).toBe("pk_test");
    expect(JSON.parse(init.body as string)).toEqual({ name: "n", markdown_content: "m" });
  });

  it("returns null without throwing when the env is missing", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl = vi.fn();
    expect(await createClickUpTask({ name: "n", markdown: "m" }, {}, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("returns null on a non-2xx response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
    expect(await createClickUpTask({ name: "n", markdown: "m" }, env, fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await createClickUpTask({ name: "n", markdown: "m" }, env, fetchImpl as unknown as typeof fetch)).toBeNull();
  });
});

describe("updateClickUpTask", () => {
  const input = { name: "[Reel] New hook", markdown: "**New**" };
  it("puts the new name and description on the task with the token", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => new Response("{}", { status: 200 }));
    expect(await updateClickUpTask("t1", input, { token: "tk", listId: "L" }, fetchImpl as unknown as typeof fetch)).toBe(true);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.clickup.com/api/v2/task/t1");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>).Authorization).toBe("tk");
    expect(JSON.parse(String(init.body))).toEqual({ name: "[Reel] New hook", markdown_content: "**New**" });
  });
  it("returns false without throwing when the env is missing, the response is not ok, or fetch throws", async () => {
    expect(await updateClickUpTask("t1", input, {}, vi.fn() as unknown as typeof fetch)).toBe(false);
    expect(await updateClickUpTask("t1", input, { token: "tk" }, (async () => new Response("", { status: 404 })) as unknown as typeof fetch)).toBe(false);
    expect(await updateClickUpTask("t1", input, { token: "tk" }, (async () => { throw new Error("net"); }) as unknown as typeof fetch)).toBe(false);
  });
});

describe("refreshClickUpTask", () => {
  const idea = { id: "i1", format: "reel", title: "T", hook: "New hook", belief_attacked: "", value_to_listener: "", why_it_stops: "", outline: [], clickup_task_id: "t1" };
  const clientFor = (row: unknown) => ({
    from: () => {
      const b: Record<string, unknown> = { then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: row ? [row] : [], error: null }).then(ok) };
      for (const m of ["select", "eq", "limit"]) b[m] = () => b;
      return b;
    },
  }) as never;
  it("renames the task an idea already has", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await refreshClickUpTask(clientFor(idea), "u1", "i1", { token: "tk", listId: "L" }, "https://x.test", fetchImpl as unknown as typeof fetch)).toBe("updated");
    expect(JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)).name).toBe("[Reel] New hook");
  });
  it("does nothing for an idea with no task (the next sync creates it) or no ClickUp env", async () => {
    const fetchImpl = vi.fn();
    expect(await refreshClickUpTask(clientFor({ ...idea, clickup_task_id: null }), "u1", "i1", { token: "tk", listId: "L" }, "https://x.test", fetchImpl as unknown as typeof fetch)).toBe("none");
    expect(await refreshClickUpTask(clientFor(idea), "u1", "i1", {}, "https://x.test", fetchImpl as unknown as typeof fetch)).toBe("none");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
