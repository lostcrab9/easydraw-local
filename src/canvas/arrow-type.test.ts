import "../features/ai/engine-test-globals";
import { describe, it, expect } from "vitest";
import { routeElbowArrow } from "@easydraw/canvas-engine/editor/element/elbowArrowRouting";
import { mutateElement } from "@easydraw/canvas-engine/editor/element/mutateElement";
import Scene from "@easydraw/canvas-engine/editor/scene/Scene";
import { createNativeElement, normalizeSceneElements, type EasyDrawElement } from "@easydraw/document-model";
import { withArrowType } from "@easydraw/canvas-engine/editor/element/arrowType";

type Arrow = Extract<EasyDrawElement, { type: "arrow" }>;
const orthogonal = (points: readonly (readonly number[])[]) =>
  points.slice(1).every(([x, y], i) => x === points[i][0] || y === points[i][1]);

function scene(bound: boolean) {
  const binding = (elementId: string) => ({ elementId, focus: 0, gap: 5 });
  const elements = normalizeSceneElements([
    createNativeElement({ id: "a", type: "rectangle", x: 0, y: 0, width: 100, height: 60, boundElements: bound ? [{ id: "flow", type: "arrow" }] : [] }),
    createNativeElement({ id: "b", type: "rectangle", x: 300, y: 200, width: 100, height: 60, boundElements: bound ? [{ id: "flow", type: "arrow" }] : [] }),
    createNativeElement({ id: "flow", type: "arrow", x: 105, y: 30, width: 190, height: 200, points: [[0, 0], [190, 200]], elbowed: false,
      startBinding: bound ? binding("a") : null, endBinding: bound ? binding("b") : null }),
  ]) as any[];
  const s = new Scene();
  s.replaceAllElements(elements);
  return s;
}
// The element copy the editor's "change arrow type" action builds before routing.
const elbowCopy = (s: Scene) => withArrowType(s.getNonDeletedElementsMap().get("flow") as any, "elbow") as any;

describe("changing an arrow to elbow", () => {
  for (const bound of [false, true]) {
    it(`routes ${bound ? "a connected" : "a free"} arrow immediately`, () => {
      const s = scene(bound);
      try {
        const flow = routeElbowArrow(elbowCopy(s), s.getNonDeletedElements(), s.getNonDeletedElementsMap(), { bindHovered: true, keepFixedPoints: false }) as Arrow;
        expect(flow.elbowed).toBe(true);
        expect(flow.points.length).toBeGreaterThan(2);
        expect(orthogonal(flow.points)).toBe(true);
        if (bound) {
          expect(flow.startBinding).toMatchObject({ elementId: "a", fixedPoint: expect.any(Array) });
          expect(flow.endBinding).toMatchObject({ elementId: "b", fixedPoint: expect.any(Array) });
        }
      } finally { s.destroy(); }
    });
  }

  it("documents the old failure: a connected copy outside the scene kept its straight diagonal", () => {
    const s = scene(true);
    try {
      const copy = elbowCopy(s);
      mutateElement(copy, { points: copy.points });
      expect(copy.points).toHaveLength(2);
      expect(orthogonal(copy.points)).toBe(false);
    } finally { s.destroy(); }
  });
});

// A curved arrow that used to be an elbow arrow with a dragged segment.
const staleSegment = { start: [-203, 0], end: [-203, -375], index: 2 };
const curvedWithStaleSegment = () => createNativeElement({
  id: "flow", type: "arrow", x: 105, y: 30, width: 190, height: 200, points: [[0, 0], [100, 40], [190, 200]],
  roundness: { type: 2 }, elbowed: false, fixedSegments: [staleSegment],
} as Parameters<typeof createNativeElement>[0]);

describe("elbow routing data on other arrow types", () => {
  it("switches a curved arrow with a leftover dragged segment back to elbow", () => {
    const s = new Scene();
    s.replaceAllElements([curvedWithStaleSegment()] as any[]);
    try {
      // Routing used to throw here: the stale segment indexed past the two reset points.
      const flow = routeElbowArrow(elbowCopy(s), s.getNonDeletedElements(), s.getNonDeletedElementsMap(), { bindHovered: true, keepFixedPoints: false }) as any;
      expect(flow).toMatchObject({ elbowed: true, roundness: null, fixedSegments: null });
      expect(flow.points.length).toBeGreaterThan(2);
      expect(orthogonal(flow.points)).toBe(true);
    } finally { s.destroy(); }
  });

  it("drops elbow-only fields from curved arrows when normalizing, and keeps them on elbow arrows", () => {
    const [curved] = normalizeSceneElements([curvedWithStaleSegment()]) as any[];
    expect(curved.fixedSegments).toBeUndefined();
    const elbow = createNativeElement({ id: "e", type: "arrow", x: 0, y: 0, width: 100, height: 100, points: [[0, 0], [0, 50], [100, 50], [100, 100]],
      elbowed: true, fixedSegments: [{ start: [0, 50], end: [100, 50], index: 2 }] } as Parameters<typeof createNativeElement>[0]);
    expect((normalizeSceneElements([elbow])[0] as any).fixedSegments).toHaveLength(1);
  });
});
