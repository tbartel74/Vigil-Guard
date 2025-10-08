import { createHash } from "node:crypto";
export function etagOf(buffer: Buffer | string): string {
  const buf = typeof buffer === "string" ? Buffer.from(buffer) : buffer;
  return `"sha256-${createHash("sha256").update(buf).digest("hex")}"`;
}