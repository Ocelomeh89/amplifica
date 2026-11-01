// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import TasteRules from "./TasteRules";
import type { NoteRow, RuleRow, TastePage } from "@/features/content/data/taste";

const approveRuleAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
const rejectRuleAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
const setRuleOnAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
const addRuleAction = vi.fn(async (_fd: FormData) => ({ error: null as string | null }));
const proposeRulesAction = vi.fn(async () => ({ error: null as string | null }));
vi.mock("@/features/content/data/taste-actions", () => ({
  approveRuleAction: (fd: FormData) => approveRuleAction(fd),
  rejectRuleAction: (fd: FormData) => rejectRuleAction(fd),
  setRuleOnAction: (fd: FormData) => setRuleOnAction(fd),
  addRuleAction: (fd: FormData) => addRuleAction(fd),
  proposeRulesAction: () => proposeRulesAction(),
}));
vi.mock("next/link", () => ({ default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));

const note = (id: string, over: Partial<NoteRow> = {}): NoteRow => ({
  id, idea_id: "i1", chips: ["Hook too weak"], text: "too generic", source: "sharpen", idea: { title: "401k thoughts", hook: "Should you max your 401k?" }, proposal_id: null, created_at: "2026-11-01T14:00:00Z", ...over,
});
const rule = (id: string, text: string, status: RuleRow["status"], over: Partial<RuleRow> = {}): RuleRow => ({
  id, rule: text, status, origin: "derived", evidence_count: 2, last_evidence_at: "2026-11-01T14:00:00Z", note_ids: [], created_at: "2026-11-01T13:00:00Z", ...over,
});
const page = (over: Partial<TastePage> = {}): TastePage => ({
  proposed: [{ ...rule("rp", "Open on the belief, never a question.", "proposed", { note_ids: ["n1"] }), notes: [note("n1")] }],
  active: [{ ...rule("ra", "Name one real number.", "active", { evidence_count: 4 }), notes: [] }],
  off: [rule("ro", "Keep it short.", "off")],
  notes: [note("n1"), note("n2", { source: "pass", chips: [], text: "boring topic", idea: null, idea_id: null })],
  waiting: 2,
  proposalsLeft: 3,
  ...over,
});

describe("TasteRules", () => {
  it("shows a proposed rule with its evidence, the notes behind it, and Approve, Edit and Reject", async () => {
    render(<TasteRules page={page()} />);
    expect(screen.getByText("Open on the belief, never a question.")).toBeTruthy();
    expect(screen.getAllByText(/Hook too weak/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(approveRuleAction).toHaveBeenCalled());
    expect(approveRuleAction.mock.calls[0][0].get("id")).toBe("rp");
    expect(approveRuleAction.mock.calls[0][0].get("rule")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    await waitFor(() => expect(rejectRuleAction).toHaveBeenCalled());
  });

  it("Edit opens the text and Save and approve sends the new wording", async () => {
    render(<TasteRules page={page()} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Rule text"), { target: { value: "Open on the belief." } });
    fireEvent.click(screen.getByRole("button", { name: "Save and approve" }));
    await waitFor(() => expect(approveRuleAction).toHaveBeenCalled());
    const fd = approveRuleAction.mock.calls.at(-1)![0];
    expect([fd.get("id"), fd.get("rule")]).toEqual(["rp", "Open on the belief."]);
  });

  it("an active rule can be turned off, and an off rule turned on", async () => {
    render(<TasteRules page={page()} />);
    fireEvent.click(screen.getByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(setRuleOnAction).toHaveBeenCalled());
    expect([setRuleOnAction.mock.calls[0][0].get("id"), setRuleOnAction.mock.calls[0][0].get("on")]).toEqual(["ra", "false"]);
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    await waitFor(() => expect(setRuleOnAction).toHaveBeenCalledTimes(2));
    expect(setRuleOnAction.mock.calls[1][0].get("on")).toBe("true");
  });

  it("lists the notes, newest first, with a link to the idea", () => {
    render(<TasteRules page={page()} />);
    // The same note shows under its rule and in the list; both link to the idea.
    for (const link of screen.getAllByRole("link", { name: /Should you max your 401k\?/ })) expect(link.getAttribute("href")).toBe("/content/ideas/i1");
    expect(screen.getByText(/boring topic/)).toBeTruthy();
  });

  it("states how many notes are waiting and proposals are left, and Propose rules runs a proposal", async () => {
    render(<TasteRules page={page()} />);
    expect(screen.getByText("2 notes waiting · 3 proposals left today")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Propose rules" }));
    await waitFor(() => expect(proposeRulesAction).toHaveBeenCalled());
  });

  it("Propose rules is off when nothing is waiting", () => {
    render(<TasteRules page={page({ waiting: 0 })} />);
    expect((screen.getByRole("button", { name: "Propose rules" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("has an empty state for each section", () => {
    render(<TasteRules page={{ proposed: [], active: [], off: [], notes: [], waiting: 0, proposalsLeft: 3 }} />);
    expect(screen.getByText("No proposed rules. They appear after 5 notes.")).toBeTruthy();
    expect(screen.getByText("No active rules yet.")).toBeTruthy();
    expect(screen.getByText("No notes yet. Sharpen or pass an idea to add one.")).toBeTruthy();
  });

  it("adds a rule of your own", async () => {
    render(<TasteRules page={page()} />);
    fireEvent.change(screen.getByLabelText("Add a rule"), { target: { value: "Take a side." } });
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    await waitFor(() => expect(addRuleAction).toHaveBeenCalled());
    expect(addRuleAction.mock.calls[0][0].get("rule")).toBe("Take a side.");
  });
});
