import { ARROW_TYPE, ROUNDNESS } from "../constants";
import { newElementWith } from "./mutateElement";
import type { AppState } from "../types";
import type { EasyDrawArrowElement } from "./types";

/**
 * The arrow as the given type, before any elbow routing. Elbow-only routing
 * data is always dropped: the points are reset when entering or leaving elbow,
 * so old segment indexes would point past the end and make routing throw.
 */
export const withArrowType = (
  arrow: EasyDrawArrowElement,
  type: AppState["currentItemArrowType"],
): EasyDrawArrowElement =>
  newElementWith(arrow, {
    roundness:
      type === ARROW_TYPE.round
        ? { type: ROUNDNESS.PROPORTIONAL_RADIUS }
        : null,
    elbowed: type === ARROW_TYPE.elbow,
    points:
      type === ARROW_TYPE.elbow || arrow.elbowed
        ? [arrow.points[0], arrow.points[arrow.points.length - 1]]
        : arrow.points,
    ...({
      fixedSegments: null,
      startIsSpecial: null,
      endIsSpecial: null,
    } as Partial<EasyDrawArrowElement>),
  });
