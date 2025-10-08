import React, { useEffect, useMemo, useState } from "react";
import { fetchFile, parseFile, resolveSpec, saveChanges } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import spec from "../spec/variables.json";
import descriptions from "../spec/descriptions.json";
import Tooltip from "./Tooltip";
import Select from "./Select";

type Chg = { file: string; payloadType: "json" | "conf"; updates: any[] };

export default function ConfigForm() {
  const { user } = useAuth();
  const [changes, setChanges] = useState<Chg[]>([]);
  const [resolveOut, setResolveOut] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("");

  const groups = useMemo(() => (spec.groups || []).slice().sort((a: any, b: any) => (a.order || 0) - (b.order || 0)), []);
  async function doResolve() { const r = await resolveSpec(spec); setResolveOut(r.results); }

  function mergeUpdates(existing: any[], u: any) {
    const idx = existing.findIndex((x) => (u.path ? x.path === u.path : x.key === u.key && (x.section ?? null) === (u.section ?? null)));
    if (idx === -1) return [...existing, u];
    const clone = [...existing]; clone[idx] = u; return clone;
  }
  function onFieldChange(_vName: string, _mIdx: number, file: string, payloadType: "json" | "conf", update: any) {
    setChanges((prev) => {
      const idx = prev.findIndex((c) => c.file === file);
      const up = { file, payloadType, updates: [update] };
      if (idx === -1) return [...prev, up];
      const merged = { ...prev[idx] };
      merged.updates = mergeUpdates(merged.updates, update);
      const clone = [...prev]; clone[idx] = merged; return clone;
    });
  }

  async function onSave() {
    if (!user) {
      setStatus("Error: User not authenticated");
      return;
    }

    try {
      const changeTag = user.username; // Use username as changeTag
      const out = await saveChanges({ changes, spec, changeTag });
      setStatus(`Saved by ${user.username}. ${out.results.length} file(s) updated.`);
      setChanges([]);
      await doResolve(); // Refresh values after save
    } catch (e: any) {
      setStatus(e.conflict ? "File changed on disk — reload or force save." : `Error: ${e.message}`);
    }
  }

  useEffect(() => { doResolve().catch(console.error); }, []);

  return (
    <div className="grid grid-cols-[1fr] h-[calc(100vh-56px)]">
      <div className="p-6 overflow-auto">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={onSave} disabled={changes.length === 0} className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold">
            Save Changes {changes.length > 0 && `(${changes.length})`}
          </button>
          <button onClick={() => setChanges([])} disabled={changes.length === 0} className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 disabled:cursor-not-allowed text-white">
            Clear
          </button>
          {status && <div className="text-sm text-slate-300 font-medium">{status}</div>}
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Variables</h2>
          <p className="text-slate-400 text-sm mb-4">Validated against specification. Secrets are masked.</p>
          <div className="space-y-6">
            {groups.map((g: any) => {
              const vs = (spec.variables || []).filter((v: any) => v.groupId === g.id);
              return (
                <div key={g.id} className="rounded-2xl border border-slate-800 p-4">
                  <div className="text-lg font-semibold">{g.label}</div>
                  <div className="text-slate-400 text-sm mb-3">{g.description}</div>
                  <div className="grid gap-2">
                    {vs.map((v: any) => {
                      const res = resolveOut.find((r) => r.variable === v.name);
                      const desc = (descriptions as any)[v.name];
                      return (
                        <div key={v.name} className="bg-[#0B121A] border border-slate-800 rounded-xl p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="font-medium">{v.label}</div>
                              {desc && (
                                <Tooltip
                                  title={desc.title}
                                  description={desc.description}
                                  impact={desc.impact}
                                  category={desc.category}
                                >
                                  <div className="w-4 h-4 rounded-full bg-slate-700 text-slate-400 text-xs flex items-center justify-center cursor-help">
                                    ?
                                  </div>
                                </Tooltip>
                              )}
                            </div>
                            <div className={`text-xs ${res?.valid?.ok ? "text-emerald-400" : "text-red-400"}`}>
                              {res?.valid?.ok ? "OK" : `Invalid (${res?.valid?.reason || "spec"})`}
                            </div>
                          </div>
                          <div className="text-xs text-slate-400">{v.help}</div>
                          <div className="mt-2 grid gap-2">
                            {v.map.map((m: any, i: number) => (
                              <div key={i} className="space-y-1">
                                <div className="text-xs text-slate-500">
                                  <span className="font-mono">{m.file}</span>
                                  <span className="mx-1">·</span>
                                  <span>{m.path ? m.path : m.key ? `${m.section ?? "∅"}/${m.key}` : ""}</span>
                                </div>
                                <div>
                                  {v.type === "boolean" ? (
                                    <Select
                                      value={String(res?.mappings?.[i]?.value ?? "")}
                                      onChange={(value) => {
                                        const convertedValue = value === "true";
                                        if (m.path) {
                                          onFieldChange(v.name, i, m.file, "json", { path: m.path, value: convertedValue });
                                        } else {
                                          onFieldChange(v.name, i, m.file, "conf", { section: m.section ?? null, key: m.key, value: convertedValue });
                                        }
                                      }}
                                      options={[
                                        { value: "true", label: "Enabled" },
                                        { value: "false", label: "Disabled" }
                                      ]}
                                      className="w-full"
                                    />
                                  ) : v.type === "select" && v.options ? (
                                    <Select
                                      value={String(res?.mappings?.[i]?.value ?? "")}
                                      onChange={(value) => {
                                        if (m.path) {
                                          onFieldChange(v.name, i, m.file, "json", { path: m.path, value: value });
                                        } else {
                                          onFieldChange(v.name, i, m.file, "conf", { section: m.section ?? null, key: m.key, value: value });
                                        }
                                      }}
                                      options={v.options}
                                      className="w-full"
                                    />
                                  ) : v.type === "multiline" ? (
                                    <textarea
                                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm resize-vertical"
                                      rows={3}
                                      placeholder={String(res?.mappings?.[i]?.value ?? "")}
                                      defaultValue={String(res?.mappings?.[i]?.value ?? "")}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (m.path) {
                                          onFieldChange(v.name, i, m.file, "json", { path: m.path, value: value });
                                        } else {
                                          onFieldChange(v.name, i, m.file, "conf", { section: m.section ?? null, key: m.key, value: value });
                                        }
                                      }}
                                    />
                                  ) : (
                                    <input
                                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
                                      type={v.type === "number" ? "number" : "text"}
                                      placeholder={String(res?.mappings?.[i]?.value ?? "")}
                                      defaultValue={String(res?.mappings?.[i]?.value ?? "")}
                                      onChange={(e) => {
                                        let value: any = e.target.value;
                                        if (v.type === "number") {
                                          value = parseFloat(value) || 0;
                                        }
                                        if (m.path) {
                                          onFieldChange(v.name, i, m.file, "json", { path: m.path, value: value });
                                        } else {
                                          onFieldChange(v.name, i, m.file, "conf", { section: m.section ?? null, key: m.key, value: value });
                                        }
                                      }}
                                    />
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="text-sm text-slate-500"><strong>Export preview:</strong> Secrets are masked at source.</div>
      </div>
    </div>
  );
}