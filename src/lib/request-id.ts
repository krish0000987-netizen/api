import { randomBytes } from "crypto";

// Human-friendly transaction id, e.g. "req_01JXK3abc...".
export function generateRequestId(prefix = "req"): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(4).toString("hex");
  return `${prefix}_${time}${rand}`;
}