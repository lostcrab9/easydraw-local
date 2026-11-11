import "../ai/engine-test-globals";
import { describe, it, expect } from "vitest";
import { DEFAULT_ELEMENT_DEFAULTS, normalizeElementDefaults } from "@easydraw/canvas-engine/editor/elementDefaults";
import { getTextStyleState, getToolStyleState } from "@easydraw/canvas-engine/editor/elementDefaults";
import { ELEMENT_DEFAULTS_STORAGE_KEY, readElementDefaults, saveElementDefaults } from "./element-defaults";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), data };
};

describe("element default preferences", () => {
  it("keeps valid fields and falls back per field for invalid or unknown ones", () => {
    const normalized = normalizeElementDefaults({
      shape: { strokeColor: "#e03131", strokeWidth: 999, fillStyle: "solid", extra: true },
      note: { backgroundColor: "#123456" },
      arrow: { endArrowhead: null, arrowType: "zigzag" },
      unknown: { a: 1 },
    });
    expect(normalized.shape).toEqual({ ...DEFAULT_ELEMENT_DEFAULTS.shape, strokeColor: "#e03131" });
    expect(normalized.note.backgroundColor).toBe(DEFAULT_ELEMENT_DEFAULTS.note.backgroundColor);
    expect(normalized.arrow).toEqual({ ...DEFAULT_ELEMENT_DEFAULTS.arrow, endArrowhead: null });
    expect(normalizeElementDefaults("garbage")).toEqual(DEFAULT_ELEMENT_DEFAULTS);
  });

  it("round-trips through storage and survives corrupt JSON", () => {
    const storage = memory();
    const changed = { ...DEFAULT_ELEMENT_DEFAULTS, frame: { backgroundColor: "#ffc9c9", rounded: false } };
    saveElementDefaults(changed, storage);
    expect(readElementDefaults(storage)).toEqual(changed);
    // Only changed fields are stored, so the rest follow future built-in defaults.
    expect(JSON.parse(storage.data.get(ELEMENT_DEFAULTS_STORAGE_KEY)!)).toEqual({ frame: { backgroundColor: "#ffc9c9", rounded: false } });
    storage.data.set(ELEMENT_DEFAULTS_STORAGE_KEY, "{not json");
    expect(readElementDefaults(storage)).toEqual(DEFAULT_ELEMENT_DEFAULTS);
  });

  it("gives each drawing tool its own kind's style, independent of the others", () => {
    const defaults = normalizeElementDefaults({
      shape: { strokeColor: "#e03131", backgroundColor: "#a5d8ff", roundness: "sharp" },
      arrow: { strokeColor: "#1971c2", arrowType: "sharp", startArrowhead: "circle" },
      text: { strokeColor: "#2f9e44", fontSize: 28 },
      freedraw: { strokeColor: "#f08c00", strokeWidth: 4 },
    });
    expect(getToolStyleState("rectangle", defaults)).toMatchObject({ currentItemStrokeColor: "#e03131", currentItemBackgroundColor: "#a5d8ff", currentItemRoundness: "sharp", currentItemOpacity: 100 });
    expect(getToolStyleState("line", defaults)).toMatchObject({ currentItemStrokeColor: "#e03131" });
    expect(getToolStyleState("arrow", defaults)).toMatchObject({ currentItemStrokeColor: "#1971c2", currentItemBackgroundColor: "transparent", currentItemArrowType: "sharp", currentItemStartArrowhead: "circle" });
    expect(getToolStyleState("text", defaults)).toMatchObject({ currentItemStrokeColor: "#2f9e44", currentItemFontSize: 28 });
    expect(getToolStyleState("freedraw", defaults)).toMatchObject({ currentItemStrokeColor: "#f08c00", currentItemStrokeWidth: 4 });
    expect(getToolStyleState("selection", defaults)).toEqual({});
    expect(getTextStyleState(defaults)).toMatchObject({ currentItemStrokeColor: "#2f9e44", currentItemFontSize: 28 });
  });
});
