import {
  DEFAULT_ELEMENT_DEFAULTS,
  normalizeElementDefaults,
  type ElementDefaults,
} from "@easydraw/canvas-engine/editor/elementDefaults";

/**
 * Per-device preference; never written into project.json. Only the fields the
 * user changed are stored, so untouched fields follow future built-in defaults.
 */
export const ELEMENT_DEFAULTS_STORAGE_KEY = "easydraw:element-defaults:v2";

export const readElementDefaults = (storage: Pick<Storage, "getItem"> | null = safeStorage()): ElementDefaults => {
  try {
    const raw = storage?.getItem(ELEMENT_DEFAULTS_STORAGE_KEY);
    return normalizeElementDefaults(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeElementDefaults(null);
  }
};

export const saveElementDefaults = (defaults: ElementDefaults, storage: Pick<Storage, "setItem"> | null = safeStorage()) => {
  try {
    storage?.setItem(ELEMENT_DEFAULTS_STORAGE_KEY, JSON.stringify(changedElementDefaults(defaults)));
  } catch { /* best effort, like other local canvas preferences */ }
};

/** The fields that differ from the built-in defaults, grouped by kind. */
export const changedElementDefaults = (defaults: ElementDefaults) => {
  const changed: Record<string, Record<string, unknown>> = {};
  for (const [kind, fields] of Object.entries(defaults) as [keyof ElementDefaults, Record<string, unknown>][]) {
    const builtIn = DEFAULT_ELEMENT_DEFAULTS[kind] as Record<string, unknown>;
    for (const [field, value] of Object.entries(fields)) {
      if (value !== builtIn[field]) (changed[kind] ??= {})[field] = value;
    }
  }
  return changed;
};

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
