import "./engine-test-globals";
import { describe, it, expect, vi, beforeAll } from "vitest";
vi.mock("@easydraw/canvas-engine/editor/fonts/Fonts", () => ({ Fonts: { loadElementsFonts: vi.fn(async () => {}) } }));
import { setCustomTextMetricsProvider } from "@easydraw/canvas-engine/editor/element/textMeasurements";
import { getNoteAutoHeight } from "@easydraw/canvas-engine/editor/renderer/note";
import {
  createNativeElement, getNotePlainText, NativeElementSchema, NOTE_DEFAULTS, normalizeSceneElements,
  type EasyDrawElement,
} from "@easydraw/document-model";
import { ApplyOperationsSchema, createInitialDocument, type ProjectDocument } from "../../core/protocol";
import { executeCanvasOperations } from "../../core/canvas-commands";
import { canvasOutline } from "../../core/canvas-query";
import { layoutCanvasText } from "./canvas-runtime";

// Deterministic metrics: 10px per character.
beforeAll(() => setCustomTextMetricsProvider({ getLineWidth: (text) => text.length * 10 }));

type Note = Extract<EasyDrawElement, { type: "note" }>;
const empty = (): ProjectDocument => ({ ...createInitialDocument(), focusedPageElementId: null, scene: { elements: [] } });
const apply = (operations: unknown[], document = empty()) =>
  executeCanvasOperations(document, ApplyOperationsSchema.parse({
    documentId: document.projectId, canvasId: document.activeCanvasId!, baseRevision: 0, requestId: "t", label: "T", operations,
  }), new Map());
async function write(operations: unknown[], document = empty()) {
  const { draft } = apply(operations, document);
  await layoutCanvasText(document, draft);
  return draft;
}
const note = (draft: ProjectDocument, id = "n") => draft.scene.elements.find((e) => e.id === id) as Note;
const page = { op: "create", element: { id: "page", type: "frame", x: 0, y: 0, width: 400, height: 400 } };
// Width 200 leaves 160px (16 characters) for text inside the 20px padding.
const lineHeight = NOTE_DEFAULTS.fontSize * NOTE_DEFAULTS.lineHeight;
const heightFor = (lines: number) => Math.ceil(lines * lineHeight + NOTE_DEFAULTS.padding * 2);

describe("sticky note model", () => {
  it("creates notes with paper defaults and plain content", () => {
    const created = createNativeElement({ id: "n", type: "note", x: 0, y: 0, width: 200, height: 120 }) as Note;
    expect(created).toMatchObject({
      content: { format: "plain", text: "" }, backgroundColor: NOTE_DEFAULTS.backgroundColor,
      fontSize: NOTE_DEFAULTS.fontSize, autoHeight: true, frameId: null, groupIds: [],
    });
    expect(NativeElementSchema.safeParse({ ...created, content: { format: "rich", blocks: [] } }).success).toBe(false);
  });

  it("keeps notes on the canvas and out of groups when normalizing", () => {
    const frame = createNativeElement({ id: "page", type: "frame", x: 0, y: 0, width: 400, height: 400 });
    const stray = createNativeElement({ id: "n", type: "note", x: 20, y: 20, width: 200, height: 120, frameId: "page", groupIds: ["g"] });
    const normalized = normalizeSceneElements([frame, stray]).find((e) => e.id === "n")!;
    expect(normalized).toMatchObject({ frameId: null, groupIds: [] });
  });

  it("keeps an arrow from a note to a page member on the canvas", () => {
    const binding = (elementId: string) => ({ elementId, focus: 0, gap: 4 });
    const elements = normalizeSceneElements([
      createNativeElement({ id: "page", type: "frame", x: 0, y: 0, width: 400, height: 400 }),
      createNativeElement({ id: "button", type: "rectangle", x: 20, y: 20, width: 80, height: 40, frameId: "page" }),
      // The note sits over the page, but notes never belong to it.
      createNativeElement({ id: "n", type: "note", x: 200, y: 200, width: 150, height: 100 }),
      createNativeElement({ id: "a", type: "arrow", x: 200, y: 200, width: 100, height: 160, points: [[0, 0], [-100, -160]],
        startBinding: binding("n"), endBinding: binding("button") }),
    ]);
    expect(elements.find((e) => e.id === "a")?.frameId).toBeNull();
  });
});

describe("sticky notes through MCP commands", () => {
  it("accepts text as shorthand, fits the height and shows the text in outlines", async () => {
    const draft = await write([{ op: "create", element: { id: "n", type: "note", x: 0, y: 0, width: 200, height: 0, text: "abcdefghij abcdefghij abcdefghij" } }]);
    expect(getNotePlainText(note(draft).content)).toBe("abcdefghij abcdefghij abcdefghij");
    // Each 10-character word is 100px; two words and a space exceed 160px.
    expect(note(draft).height).toBe(heightFor(3));
    const outline = canvasOutline(draft, { kind: "document" }, 0, 10);
    expect(outline.items[0]).toMatchObject({ type: "note", textPreview: "abcdefghij abcdefghij abcdefghij" });
  });

  it("grows auto-height notes on edits but keeps fixed-height notes", async () => {
    const created = await write([{ op: "create", element: { id: "n", type: "note", x: 0, y: 0, width: 200, height: 120, text: "short" } }]);
    expect(note(created).height).toBe(120);
    const long = Array.from({ length: 8 }, () => "abcdefghijklmnop").join("\n");
    const grown = await write([{ op: "update", id: "n", patch: { text: long } }], created);
    expect(note(grown).height).toBe(heightFor(8));
    const fixed = await write([{ op: "update", id: "n", patch: { autoHeight: false, height: 60 } }], grown);
    expect(note(fixed).height).toBe(60);
  });

  it("rejects pages, groups and text conflicts for notes", () => {
    const create = (extra: Record<string, unknown>) => ({ op: "create", element: { id: "n", type: "note", x: 20, y: 20, width: 200, height: 120, ...extra } });
    expect(() => apply([page, create({ frameId: "page" })])).toThrow("Notes belong to the canvas");
    expect(() => apply([create({ groupIds: ["g"] })])).toThrow("Notes cannot be grouped");
    expect(() => apply([create({ text: "a", content: { format: "plain", text: "b" } })])).toThrow("either text or content");
    expect(() => apply([create({ width: 0 })])).toThrow("Note width must be positive");
    const { draft } = apply([page, create({}), { op: "create", element: { id: "r", type: "rectangle", x: 300, y: 300, width: 40, height: 40 } }]);
    expect(() => apply([{ op: "group", ids: ["n", "r"] }], draft)).toThrow("Notes cannot be grouped");
    expect(() => apply([{ op: "reparent", ids: ["n"], frameId: "page" }], draft)).toThrow("Notes belong to the canvas");
    // A note created over a page is still on the canvas.
    expect(note(draft).frameId).toBeNull();
  });
});

describe("sticky note layout", () => {
  it("measures wrapped text inside the padding", () => {
    const base = createNativeElement({ id: "n", type: "note", x: 0, y: 0, width: 200, height: 120 }) as Note;
    expect(getNoteAutoHeight(base, "")).toBe(heightFor(1));
    expect(getNoteAutoHeight(base, "abcdefghij abcdefghij")).toBe(heightFor(2));
    expect(getNoteAutoHeight({ ...base, width: 400 }, "abcdefghij abcdefghij")).toBe(heightFor(1));
  });
});
