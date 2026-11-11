import type { EasyDrawNoteElement, NoteContent } from "./elements";

/** Paper colours offered for notes. The first one is the default. */
export const NOTE_COLORS = [
  { id: "yellow", color: "#FFF3BF" },
  { id: "blue", color: "#D0EBFF" },
  { id: "green", color: "#D3F9D8" },
  { id: "pink", color: "#FFDEEB" },
  { id: "gray", color: "#E9ECEF" },
] as const;

export const NOTE_DEFAULTS = {
  width: 200,
  height: 120,
  /** Inner padding between the paper edge and the text, in scene units. */
  padding: 20,
  fontSize: 20,
  /** Nunito, the same family as new free text. */
  fontFamily: 6,
  lineHeight: 1.35,
  textColor: "#1F2937",
  backgroundColor: NOTE_COLORS[0].color,
  radius: 6,
} as const;

/** Plain-text projection of a note's content, for search, outlines and MCP. */
export const getNotePlainText = (content: NoteContent): string => content.text;

export const isNoteElement = (element: { type: string } | null | undefined): element is EasyDrawNoteElement =>
  element?.type === "note";
