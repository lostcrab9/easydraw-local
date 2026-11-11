import { NOTE_COLORS, NOTE_DEFAULTS } from "@easydraw/document-model";
import type {
  Arrowhead,
  FillStyle,
  StrokeRoundness,
  StrokeStyle,
  TextAlign,
} from "./element/types";
import type { AppState, ToolType } from "./types";

/**
 * Per-kind styles for newly created elements. Each kind is independent, so
 * styling one element no longer leaks into the next element of another kind.
 * Hosts persist these as user preferences; documents never store them.
 */
export type ElementDefaults = {
  /** Pages (frames). */
  frame: { backgroundColor: string; rounded: boolean };
  text: {
    strokeColor: string;
    fontSize: number;
    fontFamily: number;
    textAlign: TextAlign;
  };
  /** Rectangle, diamond, ellipse and line. */
  shape: {
    strokeColor: string;
    backgroundColor: string;
    fillStyle: FillStyle;
    strokeWidth: number;
    strokeStyle: StrokeStyle;
    roughness: number;
    roundness: StrokeRoundness;
  };
  arrow: {
    strokeColor: string;
    strokeWidth: number;
    strokeStyle: StrokeStyle;
    roughness: number;
    arrowType: "sharp" | "round" | "elbow";
    startArrowhead: Arrowhead | null;
    endArrowhead: Arrowhead | null;
  };
  note: { backgroundColor: string; fontSize: number; textAlign: TextAlign };
  icon: { strokeColor: string; size: number };
  freedraw: { strokeColor: string; strokeWidth: number };
};

export type ElementDefaultsKind = keyof ElementDefaults;

/** Built-in defaults; a preference the user never changed follows these. */
export const DEFAULT_ELEMENT_DEFAULTS: ElementDefaults = {
  frame: { backgroundColor: "#ffffff", rounded: true },
  text: { strokeColor: "#1e1e1e", fontSize: 20, fontFamily: 6, textAlign: "left" },
  shape: {
    strokeColor: "#1e1e1e",
    backgroundColor: "#e9ecef",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 0,
    roundness: "round",
  },
  arrow: {
    strokeColor: "#e03131",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 0,
    arrowType: "elbow",
    startArrowhead: null,
    endArrowhead: "arrow",
  },
  note: {
    backgroundColor: NOTE_DEFAULTS.backgroundColor,
    fontSize: NOTE_DEFAULTS.fontSize,
    textAlign: "left",
  },
  icon: { strokeColor: "#1e1e1e", size: 48 },
  freedraw: { strokeColor: "#1e1e1e", strokeWidth: 2 },
};

export const ARROWHEAD_OPTIONS: readonly Arrowhead[] = [
  "arrow",
  "bar",
  "circle",
  "circle_outline",
  "triangle",
  "triangle_outline",
  "diamond",
  "diamond_outline",
];

const isColor = (value: unknown): value is string =>
  typeof value === "string" &&
  (value === "transparent" || /^#[0-9a-f]{6}$/i.test(value));
const isNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const oneOf = <T>(options: readonly T[]) => (value: unknown): value is T =>
  options.includes(value as T);

type Validators = {
  [K in ElementDefaultsKind]: {
    [P in keyof ElementDefaults[K]]: (value: unknown) => boolean;
  };
};

const validators: Validators = {
  frame: { backgroundColor: isColor, rounded: (v) => typeof v === "boolean" },
  text: {
    strokeColor: (v) => isColor(v) && v !== "transparent",
    fontSize: (v) => isNumberIn(v, 8, 160),
    fontFamily: (v) => isNumberIn(v, 1, 1000) && Number.isInteger(v),
    textAlign: oneOf(["left", "center", "right"]),
  },
  shape: {
    strokeColor: isColor,
    backgroundColor: isColor,
    fillStyle: oneOf(["solid", "hachure", "cross-hatch", "zigzag"]),
    strokeWidth: (v) => isNumberIn(v, 0.5, 20),
    strokeStyle: oneOf(["solid", "dashed", "dotted"]),
    roughness: (v) => isNumberIn(v, 0, 2),
    roundness: oneOf(["round", "sharp"]),
  },
  arrow: {
    strokeColor: (v) => isColor(v) && v !== "transparent",
    strokeWidth: (v) => isNumberIn(v, 0.5, 20),
    strokeStyle: oneOf(["solid", "dashed", "dotted"]),
    roughness: (v) => isNumberIn(v, 0, 2),
    arrowType: oneOf(["sharp", "round", "elbow"]),
    startArrowhead: (v) => v === null || ARROWHEAD_OPTIONS.includes(v as Arrowhead),
    endArrowhead: (v) => v === null || ARROWHEAD_OPTIONS.includes(v as Arrowhead),
  },
  note: {
    backgroundColor: (v) =>
      isColor(v) && v !== "transparent" &&
      NOTE_COLORS.some(({ color }) => color.toLowerCase() === (v as string).toLowerCase()),
    fontSize: (v) => isNumberIn(v, 8, 160),
    textAlign: oneOf(["left", "center", "right"]),
  },
  icon: {
    strokeColor: (v) => isColor(v) && v !== "transparent",
    size: (v) => isNumberIn(v, 12, 256),
  },
  freedraw: {
    strokeColor: (v) => isColor(v) && v !== "transparent",
    strokeWidth: (v) => isNumberIn(v, 0.5, 20),
  },
};

/**
 * Reads stored preferences field by field: unknown or invalid values fall back
 * to the built-in defaults, so an old or hand-edited value never breaks drawing.
 */
export const normalizeElementDefaults = (raw: unknown): ElementDefaults => {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const result = structuredClone(DEFAULT_ELEMENT_DEFAULTS) as Record<string, Record<string, unknown>>;
  for (const kind of Object.keys(validators) as ElementDefaultsKind[]) {
    const stored = source[kind];
    if (!stored || typeof stored !== "object") continue;
    for (const [field, valid] of Object.entries(validators[kind]) as [string, (v: unknown) => boolean][]) {
      const value = (stored as Record<string, unknown>)[field];
      if (valid(value)) result[kind][field] = value;
    }
  }
  return result as ElementDefaults;
};

/** Which preference group a drawing tool creates. */
export const getElementDefaultsKind = (
  tool: ToolType | "custom",
): ElementDefaultsKind | null => {
  switch (tool) {
    case "rectangle":
    case "diamond":
    case "ellipse":
    case "line":
      return "shape";
    case "arrow":
      return "arrow";
    case "text":
      return "text";
    case "freedraw":
      return "freedraw";
    case "note":
      return "note";
    case "frame":
      return "frame";
    default:
      return null;
  }
};

/**
 * The "current item" styles a tool starts with. Activating a tool loads its
 * kind's defaults; tweaks made while the tool is active apply until another
 * tool is picked.
 */
export const getToolStyleState = (
  tool: ToolType | "custom",
  defaults: ElementDefaults,
): Partial<AppState> => {
  const kind = getElementDefaultsKind(tool);
  const opacity = { currentItemOpacity: 100 };
  switch (kind) {
    case "shape": {
      const style = defaults.shape;
      return {
        ...opacity,
        currentItemStrokeColor: style.strokeColor,
        currentItemBackgroundColor: style.backgroundColor,
        currentItemFillStyle: style.fillStyle,
        currentItemStrokeWidth: style.strokeWidth,
        currentItemStrokeStyle: style.strokeStyle,
        currentItemRoughness: style.roughness,
        currentItemRoundness: style.roundness,
      };
    }
    case "arrow": {
      const style = defaults.arrow;
      return {
        ...opacity,
        currentItemStrokeColor: style.strokeColor,
        currentItemBackgroundColor: "transparent",
        currentItemStrokeWidth: style.strokeWidth,
        currentItemStrokeStyle: style.strokeStyle,
        currentItemRoughness: style.roughness,
        currentItemArrowType: style.arrowType,
        currentItemStartArrowhead: style.startArrowhead,
        currentItemEndArrowhead: style.endArrowhead,
      };
    }
    case "text":
      return { ...opacity, ...getTextStyleState(defaults) };
    case "freedraw":
      return {
        ...opacity,
        currentItemStrokeColor: defaults.freedraw.strokeColor,
        currentItemBackgroundColor: "transparent",
        currentItemStrokeWidth: defaults.freedraw.strokeWidth,
        currentItemStrokeStyle: "solid",
        currentItemRoughness: 0,
      };
    case "note":
    case "frame":
      return opacity;
    default:
      return {};
  }
};

/** Styles for text created outside the text tool (e.g. double-click). */
export const getTextStyleState = (defaults: ElementDefaults) => ({
  currentItemStrokeColor: defaults.text.strokeColor,
  currentItemBackgroundColor: "transparent",
  currentItemFontSize: defaults.text.fontSize,
  currentItemFontFamily: defaults.text.fontFamily as AppState["currentItemFontFamily"],
  currentItemTextAlign: defaults.text.textAlign,
});
