import "../features/ai/engine-test-globals";
import { describe, it, expect } from "vitest";
import { createNativeElement, normalizeSceneElements, type EasyDrawElement } from "@easydraw/document-model";

const binding = (elementId: string) => ({ elementId, focus: 0, gap: 4 });

const scene = () => normalizeSceneElements([
  createNativeElement({ id: "page-a", type: "frame", x: 0, y: 0, width: 300, height: 300 }),
  createNativeElement({ id: "page-b", type: "frame", x: 500, y: 0, width: 300, height: 300 }),
  createNativeElement({ id: "button", type: "rectangle", x: 20, y: 20, width: 100, height: 40, frameId: "page-a", boundElements: [{ id: "jump", type: "arrow" }] }),
  createNativeElement({ id: "card", type: "rectangle", x: 20, y: 100, width: 100, height: 40, frameId: "page-a" }),
  createNativeElement({ id: "other", type: "rectangle", x: 520, y: 100, width: 100, height: 40, frameId: "page-b" }),
  createNativeElement({ id: "free", type: "rectangle", x: 1000, y: 100, width: 100, height: 40 }),
  createNativeElement({ id: "jump", type: "arrow", x: 124, y: 40, width: 376, height: 0, points: [[0, 0], [376, 0]], startBinding: binding("button"), endBinding: binding("page-b") }),
  createNativeElement({ id: "inner", type: "arrow", x: 70, y: 60, width: 0, height: 40, points: [[0, 0], [0, 40]] }),
]) as EasyDrawElement[];

describe("grouping across pages", () => {
  it("ignores canvas-level arrows but not page members or in-page arrows", async () => {
    const { isGroupingAcrossFrames } = await import("@easydraw/canvas-engine/editor/frame");
    const elements = scene();
    const map = new Map(elements.map((element) => [element.id, element])) as any;
    const pick = (...ids: string[]) => ids.map((id) => map.get(id));
    expect(map.get("jump").frameId).toBeNull();
    expect(map.get("inner").frameId).toBe("page-a");
    expect(isGroupingAcrossFrames(pick("button", "card", "jump"), map)).toBe(false);
    expect(isGroupingAcrossFrames(pick("button", "inner"), map)).toBe(false);
    expect(isGroupingAcrossFrames(pick("button", "other"), map)).toBe(true);
    expect(isGroupingAcrossFrames(pick("button", "free"), map)).toBe(true);
  });
});

describe("page export", () => {
  it("keeps in-page arrows and drops arrows to other pages", async () => {
    const { prepareElementsForRender } = await import("@easydraw/canvas-engine/editor/scene/export");
    const elements = scene();
    const page = elements.find((element) => element.id === "page-a") as any;
    const ids = prepareElementsForRender({ elements, exportingFrame: page,
      frameRendering: { enabled: true, name: false, outline: false, clip: true }, exportWithDarkMode: false }).map((element) => element.id);
    expect(ids).toEqual(expect.arrayContaining(["button", "card", "inner"]));
    expect(ids).not.toContain("jump");
  });
});

describe("notes in exports", () => {
  it("leaves notes out of page images but keeps them in captures", async () => {
    const { prepareElementsForRender } = await import("@easydraw/canvas-engine/editor/scene/export");
    const page = createNativeElement({ id: "page", type: "frame", x: 0, y: 0, width: 300, height: 300 }) as any;
    const note = createNativeElement({ id: "n", type: "note", x: 20, y: 20, width: 200, height: 120 });
    const frameRendering = { enabled: true, name: false, outline: false, clip: true };
    const ids = (frame: any, elements: EasyDrawElement[]) =>
      prepareElementsForRender({ elements, exportingFrame: frame, frameRendering, exportWithDarkMode: false }).map((e) => e.id);
    expect(ids(page, [page, note])).not.toContain("n");
    // canvas-output adopts every captured element into its own frame
    const capture = { ...page, id: "__capture_frame__" };
    expect(ids(capture, [{ ...note, frameId: capture.id }, capture])).toContain("n");
  });
});
