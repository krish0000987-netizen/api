// Privacy helpers: field masking per section 22 of the spec. The gateway uses
// these to (a) mask sensitive identifiers in responses/logs and (b) build
// masked values for display. Real Aadhaar/PAN numbers must never appear in
// full in logs, usage events, or customer responses unless the product config
// explicitly allows it.

const MASK_CHAR = "X";

export type MaskMode = "full" | "partial" | "hidden" | "none";

/**
 * Mask a sensitive value.
 * - full:    replace every character with MASK_CHAR
 * - partial: keep the last `keepLast` characters, mask the rest (default 4).
 *            If a custom regex (maskRule) is provided, use it to build the
 *            masked value (e.g. Aadhaar ^(.{4}).*(.{4})$ -> XXXX...1234).
 * - hidden:  return "<hidden>" — value is never revealed.
 * - none:    return the value unchanged (only when the config allows it).
 */
export function maskValue(
  value: unknown,
  opts: { mode?: MaskMode; keepLast?: number; rule?: string | null } = {},
): string {
  if (value === null || value === undefined || value === "") return "";
  const str = String(value);
  const mode = opts.mode ?? "partial";

  switch (mode) {
    case "full":
      return MASK_CHAR.repeat(str.length);
    case "hidden":
      return "<hidden>";
    case "none":
      return str;
    case "partial":
    default:
      // Resolve preset names (e.g. "aadhaar", "pan") to their rule config.
      const resolvedRule =
        typeof opts.rule === "string" && MASK_PRESETS[opts.rule]
          ? MASK_PRESETS[opts.rule]
          : { rule: opts.rule, keepLast: opts.keepLast };
      if (resolvedRule.rule) {
        try {
          const rx = new RegExp(resolvedRule.rule);
          const m = rx.exec(str);
          if (m && m.length >= 2) {
            const groups = m.slice(1);
            return groups
              .map((g, i) => (i % 2 === 0 ? MASK_CHAR.repeat(g.length) : g))
              .join("");
          }
        } catch {
          // fall through to length-based masking if the rule is invalid
        }
      }
      const keep = Math.min(resolvedRule.keepLast ?? opts.keepLast ?? 4, str.length);
      return MASK_CHAR.repeat(Math.max(0, str.length - keep)) + str.slice(-keep);
  }
}

// Named masking presets used by the API Builder for common Indian identifiers.
export const MASK_PRESETS: Record<string, { rule?: string; keepLast?: number }> = {
  // Aadhaar: keep last 4 digits. XXXXXXXX1234
  aadhaar: { rule: "^(.{8})(.{4})$", keepLast: 4 },
  // PAN: format ABCDE1234F -> XXXXX1234X (keep last 5 chars)
  pan: { rule: "^(.{5})(.{5})$", keepLast: 5 },
  // Mobile: keep last 4. XXXXXX1234
  phone: { rule: "^(.{6})(.{4})$", keepLast: 4 },
  // Email: first char + domain
  email: { rule: "^(.)(.*)(@.+)$" },
  // Vehicle RC / DL: generic last-4
  generic: { keepLast: 4 },
};

/**
 * Apply the field-level privacy flags from an ApiField to an arbitrary input
 * value. Returns { display, store, log } where:
 * - display is what may be shown to a customer/admin UI
 * - store is what may be persisted ("" when store=false)
 * - log is what may be written to logs ("" when log=false)
 */
export function applyFieldPrivacy(
  value: unknown,
  field: { sensitive?: boolean; mask?: boolean; store?: boolean; log?: boolean; maskRule?: string | null },
): { display: string; store: string; log: string } {
  const str = value === null || value === undefined ? "" : String(value);
  const display = field.sensitive
    ? maskValue(str, { mode: "partial", rule: field.maskRule })
    : str;
  return {
    display,
    store: field.store ? str : "",
    log: field.log ? (field.sensitive ? display : str) : "",
  };
}