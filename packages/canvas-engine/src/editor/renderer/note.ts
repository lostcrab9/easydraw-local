import { getNotePlainText, NOTE_DEFAULTS } from "@easydraw/document-model";
import type { EasyDrawNoteElement } from "../element/types";
import { getFontFamilyString, getFontString, isRTL } from "../utils";
import { wrapText } from "../element/textWrapping";
import { getLineHeightInPx } from "../element/textMeasurements";
import { getVerticalOffset } from "../fonts";
import { SVG_NS } from "../constants";
import { newElementWith } from "../element/mutateElement";

/**
 * Notes draw their own paper and text; canvas, PNG/SVG export and the viewer
 * share this module so they look the same.
 */

export const NOTE_PADDING = NOTE_DEFAULTS.padding;

/** Two stacked translucent copies of the paper give a soft, cheap shadow. */
const NOTE_SHADOW_LAYERS = [
  { dy: 1, alpha: 0.08 },
  { dy: 3, alpha: 0.05 },
] as const;

export const getNoteRadius = (element: EasyDrawNoteElement) =>
  Math.min(
    element.roundness?.value ?? NOTE_DEFAULTS.radius,
    element.width / 2,
    element.height / 2,
  );

export type NoteTextLayout = {
  lines: string[];
  lineHeightPx: number;
  /** Paper height needed to show every line, padding included. */
  contentHeight: number;
};

export const getNoteTextLayout = (
  element: Pick<
    EasyDrawNoteElement,
    "content" | "fontSize" | "fontFamily" | "lineHeight" | "width"
  >,
  text = getNotePlainText(element.content),
): NoteTextLayout => {
  const lineHeightPx = getLineHeightInPx(element.fontSize, element.lineHeight);
  const maxWidth = Math.max(1, element.width - NOTE_PADDING * 2);
  const wrapped = text
    ? wrapText(text.replace(/\r\n?/g, "\n"), getFontString(element), maxWidth)
    : "";
  const lines = wrapped ? wrapped.split("\n") : [];
  const textHeight = Math.max(1, lines.length) * lineHeightPx;
  return {
    lines,
    lineHeightPx,
    contentHeight: Math.ceil(textHeight + NOTE_PADDING * 2),
  };
};

/** Height an auto-height note must have for its current text and width. */
export const getNoteAutoHeight = (
  element: Pick<
    EasyDrawNoteElement,
    "content" | "fontSize" | "fontFamily" | "lineHeight" | "width"
  >,
  text?: string,
) =>
  Math.max(
    getNoteTextLayout(element, text).contentHeight,
    NOTE_DEFAULTS.fontSize + NOTE_PADDING * 2,
  );

/** Grows an auto-height note to fit its text after a style change. */
export const withNoteAutoHeight = (note: EasyDrawNoteElement) => {
  if (!note.autoHeight) {
    return note;
  }
  const height = Math.max(note.height, getNoteAutoHeight(note));
  return height === note.height ? note : newElementWith(note, { height });
};

const textX = (element: EasyDrawNoteElement) =>
  element.textAlign === "center"
    ? element.width / 2
    : element.textAlign === "right"
    ? element.width - NOTE_PADDING
    : NOTE_PADDING;

const roundRectPath = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, width, height, radius);
  } else {
    context.rect(x, y, width, height);
  }
};

/** Draws a note in element-local coordinates (origin at its top-left). */
export const drawNoteOnCanvas = (
  element: EasyDrawNoteElement,
  context: CanvasRenderingContext2D,
) => {
  const { width, height } = element;
  const radius = getNoteRadius(element);

  context.save();
  for (const layer of NOTE_SHADOW_LAYERS) {
    context.fillStyle = `rgba(15, 23, 42, ${layer.alpha})`;
    roundRectPath(context, 0, layer.dy, width, height, radius);
    context.fill();
  }
  context.fillStyle = element.backgroundColor;
  roundRectPath(context, 0, 0, width, height, radius);
  context.fill();

  // A fixed-height note clips overflowing text to its paper.
  context.clip();
  const { lines, lineHeightPx } = getNoteTextLayout(element);
  if (lines.length) {
    const rtl = isRTL(getNotePlainText(element.content));
    context.canvas.setAttribute?.("dir", rtl ? "rtl" : "ltr");
    context.font = getFontString(element);
    context.fillStyle = element.strokeColor;
    context.textAlign = element.textAlign as CanvasTextAlign;
    const verticalOffset = getVerticalOffset(
      element.fontFamily,
      element.fontSize,
      lineHeightPx,
    );
    const x = textX(element);
    lines.forEach((line, index) => {
      context.fillText(
        line,
        x,
        NOTE_PADDING + index * lineHeightPx + verticalOffset,
      );
    });
  }
  context.restore();
};

/** SVG nodes for a note, in element-local coordinates. */
export const renderNoteToSvgNodes = (
  element: EasyDrawNoteElement,
  doc: Document,
  clipId: string,
): SVGElement[] => {
  const { width, height } = element;
  const radius = getNoteRadius(element);
  const rect = (dy: number, fill: string) => {
    const node = doc.createElementNS(SVG_NS, "rect");
    node.setAttribute("y", `${dy}`);
    node.setAttribute("width", `${width}`);
    node.setAttribute("height", `${height}`);
    node.setAttribute("rx", `${radius}`);
    node.setAttribute("ry", `${radius}`);
    node.setAttribute("fill", fill);
    return node;
  };
  const nodes: SVGElement[] = NOTE_SHADOW_LAYERS.map((layer) =>
    rect(layer.dy, `rgba(15, 23, 42, ${layer.alpha})`),
  );
  nodes.push(rect(0, element.backgroundColor));

  const { lines, lineHeightPx } = getNoteTextLayout(element);
  if (lines.length) {
    const clip = doc.createElementNS(SVG_NS, "clipPath");
    clip.setAttribute("id", clipId);
    clip.appendChild(rect(0, "#000"));
    nodes.push(clip);

    const group = doc.createElementNS(SVG_NS, "g");
    group.setAttribute("clip-path", `url(#${clipId})`);
    const direction = isRTL(getNotePlainText(element.content)) ? "rtl" : "ltr";
    const anchor =
      element.textAlign === "center"
        ? "middle"
        : element.textAlign === "right"
        ? "end"
        : "start";
    const verticalOffset = getVerticalOffset(
      element.fontFamily,
      element.fontSize,
      lineHeightPx,
    );
    const x = textX(element);
    lines.forEach((line, index) => {
      const text = doc.createElementNS(SVG_NS, "text");
      text.textContent = line;
      text.setAttribute("x", `${x}`);
      text.setAttribute(
        "y",
        `${NOTE_PADDING + index * lineHeightPx + verticalOffset}`,
      );
      text.setAttribute("font-family", getFontFamilyString(element));
      text.setAttribute("font-size", `${element.fontSize}px`);
      text.setAttribute("fill", element.strokeColor);
      text.setAttribute("text-anchor", anchor);
      text.setAttribute("style", "white-space: pre;");
      text.setAttribute("direction", direction);
      text.setAttribute("dominant-baseline", "alphabetic");
      group.appendChild(text);
    });
    nodes.push(group);
  }
  return nodes;
};
