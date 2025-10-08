import React, { useEffect, useState } from "react";
import { listFiles } from "../lib/api";
import type { FileMeta } from "../lib/types";

export default function FileList({ onSelect }:{ onSelect: (f: FileMeta) => void; }) {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [filter, setFilter] = useState<"all" | "json" | "conf">("all");
  const [query, setQuery] = useState("");

  const refresh = async () => { const data = await listFiles(filter); setFiles(data.files); };
  useEffect(() => { refresh().catch(console.error); }, [filter]);
  const filtered = files.filter((f) => f.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="p-4">
      <div className="flex gap-2 mb-2">
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)} className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm">
          <option value="all">All</option><option value="json">JSON</option><option value="conf">CONF</option>
        </select>
        <input placeholder="Search files..." className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm flex-1" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button onClick={refresh} className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sm">Refresh</button>
      </div>
      <ul className="space-y-1">
        {filtered.map((f) => (
          <li key={f.name}>
            <button onClick={() => onSelect(f)} className="w-full text-left px-2 py-1 rounded hover:bg-slate-800 text-slate-200" title={`${f.name} • ${f.etag}`}>{f.name}</button>
          </li>
        ))}
      </ul>
    </div>
  );
}