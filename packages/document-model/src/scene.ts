import { generateNKeysBetween } from "fractional-indexing";
import type { EasyDrawElement, EasyDrawLinearElement, FractionalIndex } from "./elements";

type PageBounds = { id: string; x: number; y: number; width: number; height: number; angle: number };

const isPage = (element: EasyDrawElement) => element.type === "frame" || element.type === "magicframe";

function pointInPage(x: number, y: number, page: PageBounds) {
  let px = x, py = y;
  if (page.angle) {
    const cx = page.x + page.width / 2, cy = page.y + page.height / 2;
    const cos = Math.cos(-page.angle), sin = Math.sin(-page.angle);
    px = cx + (x - cx) * cos - (y - cy) * sin;
    py = cy + (x - cx) * sin + (y - cy) * cos;
  }
  return px >= page.x && px <= page.x + page.width && py >= page.y && py <= page.y + page.height;
}

type ConnectorElement = Pick<EasyDrawLinearElement, "x" | "y" | "points" | "startBinding" | "endBinding">;

function connectorEndpointPage(
  connector: ConnectorElement,
  end: "start" | "end",
  byId: ReadonlyMap<string, EasyDrawElement>,
  pages: readonly PageBounds[],
): string | null {
  const binding = end === "start" ? connector.startBinding : connector.endBinding;
  const target = binding ? byId.get(binding.elementId) : undefined;
  if (target && !target.isDeleted) {
    if (isPage(target)) return target.id;
    return target.frameId && pages.some((page) => page.id === target.frameId) ? target.frameId : null;
  }
  const point = end === "start" ? connector.points[0] : connector.points[connector.points.length - 1];
  if (!point) return null;
  const x = connector.x + point[0], y = connector.y + point[1];
  // Later pages stack above earlier ones, so the last match is the visible one.
  for (let index = pages.length - 1; index >= 0; index--) {
    if (pointInPage(x, y, pages[index]!)) return pages[index]!.id;
  }
  return null;
}

/**
 * A connector belongs to a page only when both of its ends are in that page;
 * otherwise it lives on the canvas. Bound ends follow the bound element's page,
 * free ends follow the page under the point. The path in between never counts,
 * so a flow between two screens is not captured by a page it crosses.
 */
export function resolveConnectorFrameId(
  connector: ConnectorElement,
  elements: readonly EasyDrawElement[] | ReadonlyMap<string, EasyDrawElement>,
): string | null {
  const list = elements instanceof Map ? [...elements.values()] : elements as readonly EasyDrawElement[];
  const byId = elements instanceof Map ? elements as ReadonlyMap<string, EasyDrawElement> : new Map(list.map((element) => [element.id, element]));
  return connectorPage(connector, byId, list.filter((element) => isPage(element) && !element.isDeleted));
}

function connectorPage(connector: ConnectorElement, byId: ReadonlyMap<string, EasyDrawElement>, pages: readonly PageBounds[]) {
  const start = connectorEndpointPage(connector, "start", byId, pages);
  return start !== null && start === connectorEndpointPage(connector, "end", byId, pages) ? start : null;
}

/** Connector page membership is derived from its ends; labels follow their connector. */
export function normalizeConnectorScope(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const pages = elements.filter((element) => isPage(element) && !element.isDeleted);
  const connectorPages = new Map<string, string | null>();
  for (const element of elements) {
    if (element.type === "arrow") connectorPages.set(element.id, connectorPage(element, byId, pages));
  }
  return elements.map((element) => {
    const frameId = element.type === "arrow"
      ? connectorPages.get(element.id)!
      : element.type === "text" && element.containerId !== null && connectorPages.has(element.containerId)
        ? connectorPages.get(element.containerId)!
        : undefined;
    if (frameId === undefined || element.frameId === frameId) return element;
    return { ...element, frameId, version: element.version + 1 };
  });
}

/** Connectors bind to shapes, images, free text and pages (for flows between screens). Must match the engine's isBindableElement. */
export function isConnectorBindingTarget(element: EasyDrawElement): boolean {
  switch (element.type) {
    case "rectangle": case "diamond": case "ellipse": case "image":
    case "frame": case "magicframe": case "iframe": case "embeddable": case "note": return true;
    case "text": return element.containerId === null;
    default: return false;
  }
}

/** Drops connector bindings whose target is missing or not bindable, with the target's back-reference. */
function normalizeConnectorBindings(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  const detached = new Map<string, Set<string>>();
  let changed = false;
  const unbound = elements.map((element) => {
    if (element.type !== "arrow" && element.type !== "line") return element;
    const patch: Partial<Record<"startBinding" | "endBinding", null>> = {};
    for (const key of ["startBinding", "endBinding"] as const) {
      const targetId = element[key]?.elementId;
      if (!targetId) continue;
      const target = byId.get(targetId);
      if (target && target.id !== element.id && isConnectorBindingTarget(target)) continue;
      patch[key] = null;
      detached.set(targetId, (detached.get(targetId) ?? new Set()).add(element.id));
    }
    if (Object.keys(patch).length === 0) return element;
    changed = true;
    return { ...element, ...patch, version: element.version + 1 };
  });
  if (!changed) return elements as EasyDrawElement[];
  return unbound.map((element) => {
    const removed = detached.get(element.id);
    if (!removed || !element.boundElements?.some((bound) => removed.has(bound.id))) return element;
    return { ...element, boundElements: element.boundElements.filter((bound) => !removed.has(bound.id)), version: element.version + 1 };
  });
}

/** Page children precede their container; their relative stacking stays intact. */
export function normalizePageLayerOrder(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  const pages = new Set(elements.filter((element) => element.type === "frame").map((element) => element.id));
  return elements.filter((element) => !element.frameId || !pages.has(element.frameId)).flatMap((element) =>
    element.type === "frame" ? [...elements.filter((child) => child.frameId === element.id), element] : [element]);
}

/** Notes live on the canvas, outside every page and group. */
export function normalizeNoteScope(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  let changed = false;
  const next = elements.map((element) => {
    if (element.type !== "note" || (element.frameId === null && element.groupIds.length === 0)) return element;
    changed = true;
    return { ...element, frameId: null, groupIds: [], version: element.version + 1 };
  });
  return changed ? next : elements as EasyDrawElement[];
}

const ELBOW_ONLY_FIELDS = ["fixedSegments", "startIsSpecial", "endIsSpecial"] as const;

/**
 * Elbow routing data on a curved or straight arrow is stale: it once blocked
 * switching such an arrow back to elbow. Drop it so old documents heal on load.
 */
export function normalizeArrowRouting(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  let changed = false;
  const next = elements.map((element) => {
    if (element.type !== "arrow" || ("elbowed" in element && element.elbowed)) return element;
    const record = element as unknown as Record<string, unknown>;
    if (!ELBOW_ONLY_FIELDS.some((field) => record[field] != null)) return element;
    changed = true;
    const copy = { ...record };
    for (const field of ELBOW_ONLY_FIELDS) delete copy[field];
    return { ...(copy as unknown as EasyDrawElement), version: element.version + 1 };
  });
  return changed ? next : elements as EasyDrawElement[];
}

/** One canonical ordering for command commits, persistence and the renderer. */
export function normalizeSceneElements(elements: readonly EasyDrawElement[]): EasyDrawElement[] {
  const ordered = normalizePageLayerOrder(normalizeConnectorScope(normalizeConnectorBindings(normalizeArrowRouting(normalizeNoteScope(elements)))));
  let previous: string | null = null;
  const valid = ordered.every((element) => {
    const valid = element.index !== null && (previous === null || element.index > previous);
    previous = element.index;
    return valid;
  });
  if (valid) return ordered;
  const keys = generateNKeysBetween(null, null, ordered.length);
  return ordered.map((element, index) => element.index === keys[index] ? element : {
    ...element, index: keys[index] as FractionalIndex, version: element.version + 1,
  });
}

/** A deleted page owns its content; deleting it must not leave detached content. */
export function reconcilePageAggregates(next: readonly EasyDrawElement[], previous: readonly EasyDrawElement[]) {
  const liveIds = new Set(next.filter((element) => !element.isDeleted).map((element) => element.id));
  const deletedPages = new Set(previous.filter((element) => element.type === "frame" && !liveIds.has(element.id)).map((element) => element.id));
  if (deletedPages.size === 0) return next;
  const owned = new Set(previous.filter((element) => element.frameId && deletedPages.has(element.frameId)).map((element) => element.id));
  let changed = false;
  const reconciled = next.map((element) => {
    if (!element.isDeleted && (owned.has(element.id) || (element.frameId && deletedPages.has(element.frameId)))) {
      changed = true;
      return { ...element, isDeleted: true, version: element.version + 1 };
    }
    return element;
  });
  return changed ? reconciled : next;
}
