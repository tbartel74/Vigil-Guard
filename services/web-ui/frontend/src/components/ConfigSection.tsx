import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchFile, parseFile, resolveSpec, saveChanges } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import spec from "../spec/variables.json";
import descriptions from "../spec/descriptions.json";
import sections from "../spec/sections.json";
import Tooltip from "./Tooltip";
import Select from "./Select";
import FileManager from "./FileManager";

type Chg = { file: string; payloadType: "json" | "conf"; updates: any[] };

export default function ConfigSection() {
  const { sectionId } = useParams<{ sectionId: string }>();
  const { user } = useAuth();
  const [changes, setChanges] = useState<Chg[]>([]);
  const [resolveOut, setResolveOut] = useState<any[]>([]);
  const [status, setStatus] = useState<string>("");

  // Find the current section
  const currentSection = sections.sections.find(s => s.id === sectionId);

  // Get groups for this section
  const groups = useMemo(() => {
    if (!currentSection) return [];
    const sectionGroups = currentSection.groups;
    return (spec.groups || [])
      .filter((g: any) => sectionGroups.includes(g.id))
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  }, [currentSection]);

  async function doResolve() {
    const r = await resolveSpec(spec);
    setResolveOut(r.results);
  }

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
      await doResolve();
    } catch (e: any) {
      setStatus(e.conflict ? "File changed on disk — reload or force save." : `Error: ${e.message}`);
    }
  }

  useEffect(() => { doResolve().catch(console.error); }, []);

  // Special handling for file-manager section (after all hooks)
  if (sectionId === 'file-manager') {
    return <FileManager />;
  }

  if (!currentSection) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="text-slate-400 text-lg">Section not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto">
      {/* Section Header */}
      <div className="mb-8">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-white mb-2">{currentSection.title}</h1>
          <p className="text-slate-400">{currentSection.description}</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <p className="text-sm text-slate-300 leading-relaxed">{currentSection.overview}</p>
        </div>

        {/* Status Legend */}
        <div className="mt-4 bg-slate-900/50 border border-slate-700/50 rounded-lg p-4">
          <div className="text-sm font-medium text-slate-300 mb-3 flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
            Security Configuration Status
          </div>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-emerald-400 font-semibold">✓ SECURE</span>
              <span className="text-slate-400">Configuration validated and operational</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-red-400 font-semibold">⚠ ALERT</span>
              <span className="text-slate-400">Requires immediate attention</span>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onSave}
          disabled={changes.length === 0}
          className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold transition-colors"
        >
          Save Changes {changes.length > 0 && `(${changes.length})`}
        </button>
        <button
          onClick={() => setChanges([])}
          disabled={changes.length === 0}
          className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 disabled:cursor-not-allowed text-white transition-colors"
        >
          Clear
        </button>
        {status && (
          <div className="text-sm text-slate-300 font-medium">{status}</div>
        )}
      </div>

      {/* Variables Groups */}
      <div className="space-y-8">
        {groups.map((g: any) => {
          const vs = (spec.variables || []).filter((v: any) => v.groupId === g.id);
          return (
            <div key={g.id} className="rounded-2xl border border-slate-800 p-6">
              <div className="text-xl font-semibold mb-2">{g.label}</div>
              <div className="text-slate-400 text-sm mb-4">{g.description}</div>
              {g.id === 'llm' ? (
                <div className="space-y-6">
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'MINIMAL'].map((riskLevel) => {
                    const levelPrefix = riskLevel === 'MINIMAL' ? 'RL_MIN' : `RL_${riskLevel.substring(0, 3)}`;
                    const levelVars = vs.filter((v: any) => v.name.includes(levelPrefix));
                    if (levelVars.length === 0) return null;

                    const thresholdMin = levelVars.find((v: any) => v.name.includes('T_MIN'));
                    const thresholdMax = levelVars.find((v: any) => v.name.includes('T_MAX'));
                    const policy = levelVars.find((v: any) => v.name.includes('_P'));

                    return (
                      <div key={riskLevel} className="bg-[#0B121A] border border-slate-800 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-4">
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-1">{riskLevel} Risk Level</h3>
                            <div className="text-sm text-slate-400">Configure thresholds and policy for {riskLevel.toLowerCase()} risk content</div>
                          </div>
                          <div className="text-xs font-semibold">
                            {(() => {
                              const allValid = [thresholdMin, thresholdMax, policy].filter(Boolean).every((v: any) => {
                                const res = resolveOut.find((r) => r.variable === v.name);
                                return res?.valid?.ok;
                              });
                              return allValid ? (
                                <span className="text-emerald-400">✓ SECURE</span>
                              ) : (
                                <span className="text-red-400">⚠ ALERT</span>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {[thresholdMin, thresholdMax, policy].filter(Boolean).map((v: any) => {
                            const res = resolveOut.find((r) => r.variable === v.name);
                            const desc = (descriptions as any)[v.name];
                            const fieldLabel = v.name.includes('T_MIN') ? 'Min Threshold' :
                                             v.name.includes('T_MAX') ? 'Max Threshold' : 'Policy';

                            return (
                              <div key={v.name} className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <label className="text-sm font-medium text-slate-200">{fieldLabel}</label>
                                  {desc && (
                                    <Tooltip
                                      title={desc.title}
                                      description={desc.description}
                                      impact={desc.impact}
                                      category={desc.category}
                                    >
                                      <div className="w-3 h-3 rounded-full bg-slate-700 text-slate-400 text-xs flex items-center justify-center cursor-help">
                                        ?
                                      </div>
                                    </Tooltip>
                                  )}
                                </div>

                                <div className="text-xs text-slate-500 mb-1">
                                  Current: <span className="font-mono text-blue-400">{String(res?.mappings?.[0]?.value ?? "")}</span>
                                  {v.default !== undefined && (
                                    <span className="ml-2">
                                      Default: <span className="font-mono text-slate-500">{String(v.default)}</span>
                                    </span>
                                  )}
                                </div>

                                <div className="flex gap-2">
                                  <div className="flex-1">
                                    {v.type === "select" && v.options ? (
                                      <Select
                                        value={String(res?.mappings?.[0]?.value ?? "")}
                                        onChange={(value) => {
                                          const m = v.map[0];
                                          onFieldChange(v.name, 0, m.file, "json", { path: m.path, value: value });
                                        }}
                                        options={v.options}
                                        className="w-full"
                                      />
                                    ) : (
                                      <input
                                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
                                        type={v.type === "number" ? "number" : "text"}
                                        step={v.type === "number" ? "0.01" : undefined}
                                        placeholder={String(res?.mappings?.[0]?.value ?? "")}
                                        defaultValue={String(res?.mappings?.[0]?.value ?? "")}
                                        onChange={(e) => {
                                          let value: any = e.target.value;
                                          if (v.type === "number") {
                                            value = parseFloat(value) || 0;
                                          }
                                          const m = v.map[0];
                                          onFieldChange(v.name, 0, m.file, "json", { path: m.path, value: value });
                                        }}
                                      />
                                    )}
                                  </div>
                                  {v.default !== undefined && (
                                    <button
                                      onClick={() => {
                                        const m = v.map[0];
                                        onFieldChange(v.name, 0, m.file, "json", { path: m.path, value: v.default });
                                        window.location.reload();
                                      }}
                                      className="px-3 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded whitespace-nowrap"
                                      title="Reset to default value"
                                    >
                                      Reset
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="grid gap-4">
                  {vs.map((v: any) => {
                  const res = resolveOut.find((r) => r.variable === v.name);
                  const desc = (descriptions as any)[v.name];
                  return (
                    <div key={v.name} className="bg-[#0B121A] border border-slate-800 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
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
                        <div className={`text-xs font-semibold ${res?.valid?.ok ? "text-emerald-400" : "text-red-400"}`}>
                          {res?.valid?.ok ? "✓ SECURE" : `⚠ ALERT (${res?.valid?.reason || "spec"})`}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400 mb-3">{v.help}</div>
                      <div className="grid gap-3">
                        {v.map.map((m: any, i: number) => (
                          <div key={i} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-xs text-slate-500">
                                <span className="font-mono">{m.file}</span>
                                <span className="mx-1">·</span>
                                <span>{m.path ? m.path : m.key ? `${m.section ?? "∅"}/${m.key}` : ""}</span>
                              </div>
                              <div className="text-xs text-slate-400">
                                Current: <span className="font-mono text-blue-400">{String(res?.mappings?.[i]?.value ?? "")}</span>
                                {v.default !== undefined && (
                                  <span className="ml-2">
                                    Default: <span className="font-mono text-slate-500">{String(v.default)}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <div className="flex-1">
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
                              {v.default !== undefined && (
                                <button
                                  onClick={() => {
                                    if (m.path) {
                                      onFieldChange(v.name, i, m.file, "json", { path: m.path, value: v.default });
                                    } else {
                                      onFieldChange(v.name, i, m.file, "conf", { section: m.section ?? null, key: m.key, value: v.default });
                                    }
                                    window.location.reload();
                                  }}
                                  className="px-3 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded whitespace-nowrap"
                                  title="Reset to default value"
                                >
                                  Reset
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}