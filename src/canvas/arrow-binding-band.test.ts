import "../features/ai/engine-test-globals";
import { describe, it, expect } from "vitest";
import { getHoveredElementForBinding, maxBindingGap } from "@easydraw/canvas-engine/editor/element/binding";
import Scene from "@easydraw/canvas-engine/editor/scene/Scene";
import { createNativeElement, normalizeSceneElements } from "@easydraw/document-model";

const filled = { backgroundColor: "#e9ecef", fillStyle: "solid" } as const;
const box = (id: string, x: number, y: number, width: number, height: number, style: object = filled) =>
  createNativeElement({ id, type: "rectangle", x, y, width, height, ...style } as Parameters<typeof createNativeElement>[0]);

function hovered(elements: ReturnType<typeof box>[], x: number, y: number, elbow = false) {
  const scene = new Scene();
  scene.replaceAllElements(normalizeSceneElements(elements) as any[]);
  try {
    // Elbow arrows used to bind anywhere inside a shape (fullShape).
    return getHoveredElementForBinding({ x, y }, scene.getNonDeletedElements(), scene.getNonDeletedElementsMap(), undefined, elbow, elbow)?.id ?? null;
  } finally { scene.destroy(); }
}

describe("arrow end binding", () => {
  // The band is 8px on each side of the outline, whatever the shape size.
  const big = box("big", 0, 0, 400, 300);
  const band = maxBindingGap();

  for (const elbow of [false, true]) {
    const kind = elbow ? "elbow" : "straight or curved";
    it(`binds a ${kind} arrow end only near the outline`, () => {
      expect(band).toBe(8);
      expect(maxBindingGap({ value: 0.5 } as never)).toBe(16); // same on-screen distance when zoomed out
      expect(hovered([big], 200, 150, elbow)).toBeNull(); // deep inside a filled shape
      expect(hovered([big], 200, band + 4, elbow)).toBeNull(); // just past the band
      expect(hovered([big], 200, band - 4, elbow)).toBe("big"); // inside, near the top edge
      expect(hovered([big], 200, -(band - 4), elbow)).toBe("big"); // outside, near the top edge
      expect(hovered([big], 200, -(band + 4), elbow)).toBeNull();
    });
  }

  it("never binds to an outline hidden under a filled shape", () => {
    const under = box("under", 150, 100, 100, 60);
    const cover = box("cover", 0, 0, 400, 300);
    expect(hovered([under, cover], 150, 130)).toBeNull(); // on under's edge, deep inside cover
    // A transparent shape on top does not hide it.
    expect(hovered([under, box("glass", 0, 0, 400, 300, { backgroundColor: "transparent" })], 150, 130)).toBe("under");
  });
});
