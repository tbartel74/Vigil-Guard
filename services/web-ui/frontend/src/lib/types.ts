export type FileMeta = { name: string; ext: string; size: number; mtimeMs: number; etag: string };
export type ResolveResult = {
  variable: string;
  label: string;
  type: string;
  required: boolean;
  mappings: Array<{ source: any; value: any }>;
  valid: { ok: boolean; reason?: string };
};