export type ConfAstLine =
  | { kind: "comment"; raw: string }
  | { kind: "blank"; raw: string }
  | { kind: "section"; name: string; raw: string }
  | { kind: "kv"; section: string | null; key: string; value: string; raw: string };

export type ConfDoc = {
  lines: ConfAstLine[];
  index: Map<string, number>;
};

const SEC_RE = /^\s*\[([^\]]+)\]\s*$/;
const KV_RE = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)\s*$/;
const COMMENT_RE = /^\s*[#;]/;

export function parseConf(text: string): ConfDoc {
  const lines: ConfAstLine[] = [];
  const index = new Map<string, number>();
  let currentSection: string | null = null;

  const rawLines = text.split(/\r?\n/);
  rawLines.forEach((raw) => {
    if (raw.trim() === "") { lines.push({ kind: "blank", raw }); return; }
    if (COMMENT_RE.test(raw)) { lines.push({ kind: "comment", raw }); return; }
    const sm = SEC_RE.exec(raw);
    if (sm) { currentSection = sm[1]; lines.push({ kind: "section", name: currentSection, raw }); return; }
    const km = KV_RE.exec(raw);
    if (km) {
      const [, key, value] = km;
      const entry: ConfAstLine = { kind: "kv", section: currentSection, key, value, raw };
      const i = lines.push(entry) - 1;
      index.set(`${currentSection || ""}::${key}`, i);
      return;
    }
    lines.push({ kind: "comment", raw });
  });
  return { lines, index };
}

export function applyUpdates(
  doc: ConfDoc,
  updates: Array<{ section: string | null; key: string; value: string }>
): ConfDoc {
  const newLines = [...doc.lines];
  const newIndex = new Map(doc.index);

  for (const upd of updates) {
    const keyId = `${upd.section || ""}::${upd.key}`;
    const idx = newIndex.get(keyId);
    if (idx !== undefined) {
      const old = newLines[idx];
      if (old.kind === "kv") {
        const raw = `${upd.key}=${upd.value}`;
        newLines[idx] = { ...old, value: upd.value, raw };
      }
      continue;
    }
    let insertAt = newLines.length;
    if (upd.section) {
      let seenSection = false;
      for (let i = 0; i < newLines.length; i++) {
        const l = newLines[i];
        if (l.kind === "section" && l.name === upd.section) {
          seenSection = true;
          insertAt = i + 1;
          for (let j = i + 1; j < newLines.length; j++) {
            if (newLines[j].kind === "section") { insertAt = j; break; }
            insertAt = j + 1;
          }
        }
      }
      if (!seenSection) {
        newLines.push({ kind: "blank", raw: "" });
        newLines.push({ kind: "section", name: upd.section, raw: `[${upd.section}]` });
        insertAt = newLines.length;
      }
    }
    const raw = `${upd.key}=${upd.value}`;
    newLines.splice(insertAt, 0, { kind: "kv", section: upd.section, key: upd.key, value: upd.value, raw });
    newIndex.clear();
    newLines.forEach((l, i) => { if (l.kind === "kv") newIndex.set(`${l.section || ""}::${l.key}`, i); });
  }
  return { lines: newLines, index: newIndex };
}

export function stringify(doc: ConfDoc): string {
  return doc.lines.map((l) => ("raw" in l ? l.raw : "")).join("\n") + "\n";
}