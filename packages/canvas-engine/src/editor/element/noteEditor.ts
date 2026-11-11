import { getNotePlainText } from "@easydraw/document-model";
import { KEYS } from "../keys";
import { CLASSES, POINTER_BUTTON } from "../constants";
import { getFontString, isWritableElement } from "../utils";
import type App from "../components/App";
import type { EasyDrawNoteElement } from "./types";
import { NOTE_PADDING } from "../renderer/note";

/**
 * Plain-text editor for a sticky note: a textarea laid over the note's text
 * box. It is note-specific (not the bound-text editor) so that it can later be
 * replaced by a rich-text editor without touching text elements.
 *
 * The textarea uses the paper colour as its background, so it hides the
 * canvas-rendered text underneath while the user types.
 */
export const openNoteEditor = ({
  app,
  element,
  canvas,
  canvasContainer,
  getViewportCoords,
  onChange,
  onSubmit,
}: {
  app: App;
  canvas: HTMLCanvasElement | null;
  canvasContainer: HTMLDivElement | null;
  element: EasyDrawNoteElement;
  getViewportCoords: (x: number, y: number) => [number, number];
  onChange: (text: string) => void;
  onSubmit: (text: string) => void;
}) => {
  const editable = document.createElement("textarea");
  editable.dir = "auto";
  editable.tabIndex = 0;
  editable.dataset.type = "wysiwyg";
  editable.dataset.noteEditor = element.id;
  editable.classList.add("easydraw-wysiwyg");
  editable.wrap = "soft";
  Object.assign(editable.style, {
    position: "absolute",
    display: "block",
    margin: 0,
    padding: 0,
    border: 0,
    outline: 0,
    resize: "none",
    overflow: "hidden",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "break-word",
    boxSizing: "content-box",
    backfaceVisibility: "hidden",
    transformOrigin: "0 0",
    zIndex: "var(--zIndex-wysiwyg)",
  });
  editable.value = getNotePlainText(element.content);

  const getNote = () => {
    const current = app.scene.getElement(element.id);
    return current && current.type === "note" && !current.isDeleted
      ? current
      : null;
  };

  const updateStyle = () => {
    const note = getNote();
    if (!note) {
      return;
    }
    const { zoom } = app.state;
    const [left, top] = getViewportCoords(note.x, note.y);
    const degree = (180 * note.angle) / Math.PI;
    // Rotate around the note centre, like the canvas does.
    const cx = note.width / 2;
    const cy = note.height / 2;
    Object.assign(editable.style, {
      font: getFontString(note),
      lineHeight: `${note.lineHeight}`,
      color: note.strokeColor,
      background: note.backgroundColor,
      textAlign: note.textAlign,
      opacity: `${note.opacity / 100}`,
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.max(1, note.width - NOTE_PADDING * 2)}px`,
      height: `${Math.max(1, note.height - NOTE_PADDING * 2)}px`,
      transform: `scale(${zoom.value}) translate(${cx}px, ${cy}px) rotate(${degree}deg) translate(${
        -cx + NOTE_PADDING
      }px, ${-cy + NOTE_PADDING}px)`,
      filter: "var(--theme-filter)",
    });
  };

  let submitted = false;
  const submit = () => {
    if (submitted) {
      return;
    }
    submitted = true;
    cleanup();
    onSubmit(editable.value);
  };

  editable.oninput = () => {
    onChange(editable.value);
  };

  editable.onkeydown = (event) => {
    if (event.key === KEYS.ESCAPE) {
      event.preventDefault();
      submit();
      return;
    }
    if (event.key === KEYS.ENTER && event[KEYS.CTRL_OR_CMD]) {
      event.preventDefault();
      submit();
      return;
    }
    // Keep canvas shortcuts (tools, delete, undo…) away from the textarea.
    event.stopPropagation();
  };

  // Clicking toolbar/floating-bar controls must not end editing; clicking the
  // canvas does.
  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (target === editable) {
      return;
    }
    if (event.button === POINTER_BUTTON.WHEEL) {
      return;
    }
    if (
      (target instanceof HTMLElement || target instanceof SVGElement) &&
      target.closest(`.${CLASSES.SHAPE_ACTIONS_MENU}, .${CLASSES.ZOOM_ACTIONS}`) &&
      !isWritableElement(target)
    ) {
      editable.onblur = null;
      window.addEventListener("pointerup", rebindBlur, { once: true });
      return;
    }
    if (target instanceof HTMLCanvasElement) {
      requestAnimationFrame(submit);
    }
  };
  const rebindBlur = () => {
    setTimeout(() => {
      editable.onblur = submit;
      editable.focus();
    });
  };

  const unbindUpdate = app.scene.onUpdate(updateStyle);
  const unbindScroll = app.onScrollChangeEmitter.on(updateStyle);
  let observer: ResizeObserver | null = null;
  if (canvas && "ResizeObserver" in window) {
    observer = new window.ResizeObserver(updateStyle);
    observer.observe(canvas);
  }
  window.addEventListener("resize", updateStyle);
  window.addEventListener("beforeunload", submit);

  const cleanup = () => {
    editable.onblur = null;
    editable.oninput = null;
    editable.onkeydown = null;
    observer?.disconnect();
    unbindUpdate();
    unbindScroll();
    window.removeEventListener("resize", updateStyle);
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointerup", rebindBlur);
    window.removeEventListener("beforeunload", submit);
    editable.remove();
  };

  editable.onpointerdown = (event) => event.stopPropagation();
  updateStyle();
  canvasContainer
    ?.querySelector(".easydraw-textEditorContainer")
    ?.appendChild(editable);

  // Deferred so the pointer events that opened the editor don't close it.
  requestAnimationFrame(() => {
    window.addEventListener("pointerdown", onPointerDown, true);
  });
  setTimeout(() => {
    editable.focus();
    const end = editable.value.length;
    editable.setSelectionRange(end, end);
    editable.onblur = submit;
  });

  return { submit };
};
