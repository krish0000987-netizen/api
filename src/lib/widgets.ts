export const CUSTOMER_WIDGET_IDS = ["plan", "requests", "sandbox", "live", "mode"] as const;
export const ADMIN_WIDGET_IDS = ["vendors", "customers", "requests", "errors"] as const;

export type Widget = { id: string; label: string; value: string };

// Reads a saved JSON layout and returns the widget ids in saved order, with
// any known-but-missing ids appended. Unknown/stale ids are dropped.
export function parseLayout(raw: string | null | undefined, allowed: readonly string[]): string[] {
  let saved: string[] = [];
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) saved = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      saved = [];
    }
  }
  const ordered = saved.filter((id) => (allowed as readonly string[]).includes(id));
  for (const id of allowed) {
    if (!ordered.includes(id)) ordered.push(id);
  }
  return ordered;
}

export function validateLayout(ids: unknown, allowed: readonly string[]): string[] | null {
  if (!Array.isArray(ids)) return null;
  if (ids.some((id) => typeof id !== "string" || !(allowed as readonly string[]).includes(id))) {
    return null;
  }
  if (new Set(ids).size !== ids.length) return null;
  return ids as string[];
}
