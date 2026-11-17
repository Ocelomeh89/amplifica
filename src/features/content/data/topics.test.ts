import { describe, expect, it } from "vitest";
import { resolveTopic, type Topic } from "./topics";

const LIST: Topic[] = [
  { slug: "mechanics-of-leverage", label: "The mechanics of leverage", pillar: "physics-of-wealth" },
  { slug: "concentration-risk", label: "Concentration risk", pillar: "expensive-tuition" },
];

describe("resolveTopic", () => {
  it("a listed topic under the post's pillar resolves to its slug", () => {
    expect(resolveTopic(LIST, { topic: "mechanics-of-leverage", pillar: "physics-of-wealth" })).toEqual({ slug: "mechanics-of-leverage" });
  });
  it("a listed topic under another pillar is a mismatch", () => {
    expect(resolveTopic(LIST, { topic: "mechanics-of-leverage", pillar: "w2-advantage" })).toEqual({ skip: "topic_pillar_mismatch" });
  });
  it("a new label is slugified and returned to add", () => {
    expect(resolveTopic(LIST, { topic_label: "Seller financing terms", pillar: "expensive-tuition" })).toEqual({
      slug: "seller-financing-terms",
      add: { slug: "seller-financing-terms", label: "Seller financing terms", pillar: "expensive-tuition" },
    });
  });
  it("a label whose slug exists under the same pillar reuses it, under another pillar is a mismatch", () => {
    expect(resolveTopic(LIST, { topic_label: "Concentration risk", pillar: "expensive-tuition" })).toEqual({ slug: "concentration-risk" });
    expect(resolveTopic(LIST, { topic_label: "Concentration risk", pillar: "life-by-design" })).toEqual({ skip: "topic_pillar_mismatch" });
  });
  it("a legacy or empty message skips with no_pillar", () => {
    for (const pillar of ["velocity", "", "none"]) {
      expect(resolveTopic(LIST, { topic: "mechanics-of-leverage", pillar })).toEqual({ skip: "no_pillar" });
    }
  });
  it("neither a topic nor a label skips with none", () => {
    expect(resolveTopic(LIST, { pillar: "physics-of-wealth" })).toEqual({ skip: "none" });
  });
  it("an unknown slug with no label is a mismatch, not a new topic", () => {
    expect(resolveTopic(LIST, { topic: "made-up", pillar: "physics-of-wealth" })).toEqual({ skip: "topic_unknown" });
  });
});
