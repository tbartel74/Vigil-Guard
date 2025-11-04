import path from "node:path";
import fs from "node:fs/promises";
import { constants as FS_CONST } from "node:fs";
import { etagOf } from "./etag.js";
import { parseConf, applyUpdates, stringify } from "./confParser.js";

const TARGET_DIR = process.env.TARGET_DIR || "/config";
const ALLOWED_EXT = new Set([".json", ".conf", ".bak", ".log", ".tmp"]);
const SAFE_NAME_RE = /^[A-Za-z0-9._-]+$/;

export function ensureSafeName(name: string): string {
  if (!SAFE_NAME_RE.test(name)) throw new Error("Invalid filename");
  const ext = path.extname(name);
  if (![".json", ".conf"].includes(ext)) throw new Error("Disallowed extension");
  return name;
}
function resolveSafe(name: string): string {
  const safe = ensureSafeName(name);
  const full = path.resolve(TARGET_DIR, safe);
  if (!full.startsWith(path.resolve(TARGET_DIR))) throw new Error("Path traversal denied");
  return full;
}

export async function listFiles(filter: "json" | "conf" | "all") {
  const entries = await fs.readdir(TARGET_DIR, { withFileTypes: true });
  const out: any[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const ext = path.extname(e.name);
    if (!ALLOWED_EXT.has(ext)) continue;
    if (filter !== "all" && ext !== `.${filter}`) continue;
    if (![".json", ".conf"].includes(ext)) continue;
    const full = path.join(TARGET_DIR, e.name);
    const stat = await fs.stat(full);
    const raw = await fs.readFile(full);
    out.push({ name: e.name, ext, size: stat.size, mtimeMs: stat.mtimeMs, etag: etagOf(raw) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readFileRaw(name: string) {
  const full = resolveSafe(name);
  const raw = await fs.readFile(full);
  const stat = await fs.stat(full);
  return { name, ext: path.extname(name), size: stat.size, mtimeMs: stat.mtimeMs, etag: etagOf(raw), content: raw.toString("utf8") };
}

function toObjectSafe(doc: ReturnType<typeof parseConf>) {
  const obj: Record<string, any> = {};
  for (const l of doc.lines) {
    if (l.kind === "section") { obj[l.name] = obj[l.name] || {}; }
    else if (l.kind === "kv") {
      if (l.section) { obj[l.section] = obj[l.section] || {}; obj[l.section][l.key] = l.value; }
      else { obj[l.key] = l.value; }
    }
  }
  return obj;
}

export async function parseFile(name: string) {
  const file = await readFileRaw(name);
  if (file.ext === ".json") {
    try { return { ...file, parsed: JSON.parse(file.content) }; }
    catch (e: any) { throw new Error("JSON parse error: " + e.message); }
  }
  if (file.ext === ".conf") {
    // Try JSON first (for pii.conf which is JSON despite .conf extension)
    if (file.content.trim().startsWith('{') || file.content.trim().startsWith('[')) {
      try {
        return { ...file, parsed: JSON.parse(file.content) };
      } catch (e: any) {
        // If JSON parsing fails, fall back to INI parser
        console.warn(`File ${name} looks like JSON but failed to parse, trying INI format:`, e.message);
      }
    }
    const doc = parseConf(file.content);
    return { ...file, parsed: toObjectSafe(doc), _rawDoc: doc };
  }
  throw new Error("Unsupported extension");
}

function getByPath(root: any, dotPath: string) {
  return dotPath.split(".").reduce((acc, k) => (acc == null ? undefined : acc[k]), root);
}
function setByPath(root: any, dotPath: string, value: any) {
  const parts = dotPath.split(".");
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}
function sanitizeTag(tag: string) {
  return tag.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "change";
}

// Version history management
interface VersionEntry {
  tag: string;
  timestamp: string;
  author: string;
  files: string[];
  backups: string[];
}

interface VersionHistory {
  versions: VersionEntry[];
}

const VERSION_HISTORY_FILE = "version_history.json";

async function loadVersionHistory(): Promise<VersionHistory> {
  const historyPath = path.join(TARGET_DIR, VERSION_HISTORY_FILE);
  try {
    const content = await fs.readFile(historyPath, "utf8");
    return JSON.parse(content);
  } catch (e: any) {
    if (e.code === "ENOENT") {
      return { versions: [] };
    }
    throw e;
  }
}

async function saveVersionHistory(history: VersionHistory): Promise<void> {
  const historyPath = path.join(TARGET_DIR, VERSION_HISTORY_FILE);
  await fs.writeFile(historyPath, JSON.stringify(history, null, 2), "utf8");
}

async function addVersionEntry(entry: VersionEntry): Promise<void> {
  const history = await loadVersionHistory();
  history.versions.unshift(entry); // Add at the beginning (newest first)
  // Keep only the last 50 versions
  if (history.versions.length > 50) {
    history.versions = history.versions.slice(0, 50);
  }
  await saveVersionHistory(history);
}

async function cleanupOldBackups(filePath: string) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const ext = path.extname(filePath);

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const backups = entries
      .filter(e => e.isFile() && e.name.startsWith(`${base}__`) && e.name.endsWith(`${ext}.bak`))
      .map(e => ({
        name: e.name,
        path: path.join(dir, e.name)
      }));

    if (backups.length <= 2) return;

    const backupStats = await Promise.all(
      backups.map(async b => ({
        ...b,
        stat: await fs.stat(b.path)
      }))
    );

    backupStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

    const toDelete = backupStats.slice(2);

    for (const backup of toDelete) {
      await fs.unlink(backup.path);
    }
  } catch (e) {
    console.warn(`Failed to cleanup backups for ${filePath}:`, e);
  }
}

export async function saveChanges(args: {
  changes: Array<
    | { file: string; payloadType: "json"; updates: Array<{ path: string; value: any }> }
    | { file: string; payloadType: "conf"; updates: Array<{ section: string | null; key: string; value: string }> }
  >;
  changeTag: string;
  ifMatch?: string;
  validate?: (file: string, updates: any[]) => { ok: boolean; errors?: string[] };
  author?: string;
}): Promise<{ results: Array<{ file: string; backupPath: string; etag: string }> }> {
  if (!args.changeTag) throw new Error("Missing changeTag");
  const results: Array<{ file: string; backupPath: string; etag: string }> = [];
  const tag = sanitizeTag(args.changeTag);
  const author = args.author || "unknown";
  const timestamp = new Date().toISOString();
  const versionTag = `${nowStamp()}-${author.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;

  for (const change of args.changes) {
    const file = await readFileRaw(change.file);
    if (args.ifMatch && args.ifMatch !== file.etag) {
      const err = new Error(`ETag mismatch for ${change.file}`) as any;
      err.code = "ETAG_MISMATCH"; err.expected = args.ifMatch; err.actual = file.etag; throw err;
    }
    if (args.validate) {
      const v = args.validate(change.file, (change as any).updates);
      if (!v.ok) { const err = new Error(`Validation failed: ${v.errors?.join("; ")}`) as any; err.code = "VALIDATION"; throw err; }
    }

    const full = resolveSafe(change.file);
    const dir = path.dirname(full);
    const base = path.basename(full, path.extname(full));
    const ext = path.extname(full);
    const bakName = `${base}__${nowStamp()}__${tag}${ext}.bak`;
    const bakPath = path.join(dir, bakName);

    // 1) backup
    await fs.copyFile(full, bakPath, FS_CONST.COPYFILE_EXCL);

    // 1.5) cleanup old backups (keep max 2)
    await cleanupOldBackups(full);

    // 2) prepare new content
    let newContent: string;
    if (change.payloadType === "json") {
      const parsed = JSON.parse(file.content);
      for (const u of (change as any).updates) setByPath(parsed, u.path, u.value);
      newContent = JSON.stringify(parsed, null, 2) + "\n";
    } else {
      const doc = parseConf(file.content);
      const doc2 = applyUpdates(doc, (change as any).updates);
      newContent = stringify(doc2);
    }

    // 3) atomic write
    const tmp = path.join(dir, `${base}.${Date.now()}.tmp`);
    await fs.writeFile(tmp, newContent, { encoding: "utf8", flag: "w" });
    await fs.rename(tmp, full);
    const newEtag = etagOf(Buffer.from(newContent));

    results.push({ file: change.file, backupPath: bakPath, etag: newEtag });
    await appendAudit({ file: change.file, backup: bakName, tag, result: "ok" });
  }

  // Add entry to version history
  await addVersionEntry({
    tag: versionTag,
    timestamp,
    author,
    files: results.map(r => r.file),
    backups: results.map(r => path.basename(r.backupPath))
  });

  return { results };
}

async function appendAudit(entry: { file: string; backup: string; tag: string; result: string }) {
  const line = { ts: new Date().toISOString(), user: "local", file: entry.file, backup: entry.backup, changeTag: entry.tag, result: entry.result };
  const logPath = path.join(TARGET_DIR, "audit.log");
  await fs.appendFile(logPath, JSON.stringify(line) + "\n", { encoding: "utf8" });
}

// Public API for version history
export async function getConfigVersions(): Promise<VersionEntry[]> {
  const history = await loadVersionHistory();
  return history.versions;
}

export async function getVersionDetails(tag: string): Promise<VersionEntry | null> {
  const history = await loadVersionHistory();
  return history.versions.find(v => v.tag === tag) || null;
}

export async function rollbackToVersion(tag: string): Promise<{ success: boolean; restoredFiles: string[] }> {
  const version = await getVersionDetails(tag);
  if (!version) {
    throw new Error(`Version not found: ${tag}`);
  }

  const restoredFiles: string[] = [];

  for (let i = 0; i < version.files.length; i++) {
    const fileName = version.files[i];
    const backupName = version.backups[i];
    const backupPath = path.join(TARGET_DIR, backupName);
    const targetPath = resolveSafe(fileName);

    // Check if backup exists
    try {
      await fs.access(backupPath, FS_CONST.F_OK);
    } catch (e) {
      throw new Error(`Backup file not found: ${backupName}`);
    }

    // Create a backup of current state before rollback (for safety)
    const currentBackupName = `${path.basename(fileName, path.extname(fileName))}__${nowStamp()}__pre-rollback${path.extname(fileName)}.bak`;
    const currentBackupPath = path.join(TARGET_DIR, currentBackupName);
    await fs.copyFile(targetPath, currentBackupPath, FS_CONST.COPYFILE_EXCL);

    // Restore from backup
    await fs.copyFile(backupPath, targetPath);
    restoredFiles.push(fileName);
  }

  return { success: true, restoredFiles };
}
