import React from "react";
export default function DetailsPane({ raw, parsed, file }:{ raw: string | null; parsed: any | null; file: { name: string; etag: string } | null; }) {
  return (
    <div className="p-4 h-full overflow-auto">
      <div className="text-sm text-slate-400 mb-2">
        <div className="font-mono">File: {file?.name || "—"}</div>
        <div className="font-mono">ETag: {file?.etag || "—"}</div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase text-slate-400 mb-1">Raw preview</div>
          <pre className="bg-slate-900 border border-slate-800 rounded p-2 text-xs overflow-auto">{raw}</pre>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400 mb-1">Parsed object</div>
          <pre className="bg-slate-900 border border-slate-800 rounded p-2 text-xs overflow-auto">{JSON.stringify(parsed, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}