import React, { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { resolveSpec, saveChanges } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import spec from "../spec/variables.json";
import descriptions from "../spec/descriptions.json";
import Select from "./Select";
import Tooltip from "./Tooltip";

type Chg = { file: string; payloadType: "json" | "conf"; updates: any[] };

interface BranchHealthStatus {
  heuristics: { status: string; latency_ms: number };
  semantic: { status: string; latency_ms: number };
  llm_guard: { status: string; latency_ms: number };
}

export default function ArbiterSettings() {
  const { user } = useAuth();
  const [changes, setChanges] = useState<Chg[]>([]);
  const [resolveOut, setResolveOut] = useState<any[]>([]);
  const [defaultValues, setDefaultValues] = useState<any[]>([]);
  const [resetKey, setResetKey] = useState<number>(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [branchHealth, setBranchHealth] = useState<BranchHealthStatus | null>(null);
  const [isLoadingHealth, setIsLoadingHealth] = useState(false);

  // Filter variables for arbiter groups only
  const arbiterWeights = (spec.variables || []).filter((v: any) => v.groupId === "arbiter_weights");
  const arbiterBoosts = (spec.variables || []).filter((v: any) => v.groupId === "arbiter_boosts");

  async function doResolve() {
    try {
      const r = await resolveSpec(spec);
      setResolveOut(r.results);
      setDefaultValues(JSON.parse(JSON.stringify(r.results)));
      setLoadError(null);
    } catch (error: any) {
      console.error("Failed to resolve config:", error);
      setLoadError(`Configuration load failed: ${error.message}`);
      toast.error("Failed to load configuration. Please refresh the page.");
    }
  }

  async function fetchBranchHealth() {
    setIsLoadingHealth(true);
    try {
      const API = import.meta.env.VITE_API_BASE || "/ui/api";
      const token = localStorage.getItem('token');
      const response = await fetch(`${API}/branches/health`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setBranchHealth(data);
      }
    } catch (error) {
      console.error("Failed to fetch branch health:", error);
    } finally {
      setIsLoadingHealth(false);
    }
  }

  function mergeUpdates(existing: any[], u: any) {
    const idx = existing.findIndex((x) => u.path ? x.path === u.path : x.key === u.key && (x.section ?? null) === (u.section ?? null));
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

  function getCurrentValue(file: string, mapping: any, originalValue: any): any {
    const fileChanges = changes.find(c => c.file === file);
    if (!fileChanges) return originalValue;
    const change = fileChanges.updates.find((u: any) => {
      if (mapping.path) return u.path === mapping.path;
      return u.key === mapping.key && (u.section ?? null) === (mapping.section ?? null);
    });
    return change ? change.value : originalValue;
  }

  function getValue(varName: string): any {
    const res = resolveOut.find((r) => r.variable === varName);
    const v = (spec.variables || []).find((x: any) => x.name === varName);
    if (!res || !v) return null;
    return getCurrentValue(v.map[0].file, v.map[0], res?.mappings?.[0]?.value);
  }

  async function onSave() {
    if (!user) {
      toast.error("Error: User not authenticated");
      return;
    }

    const toastId = toast.loading("Saving Arbiter configuration...");

    try {
      const changeTag = user.username;
      const out = await saveChanges({ changes, spec, changeTag });
      toast.success(`Configuration saved successfully. ${out.results.length} file(s) updated.`, { id: toastId });
      const savedChanges = [...changes];
      setChanges([]);
      try {
        await doResolve();
      } catch (reloadError: any) {
        console.error("Failed to reload config after save:", reloadError);
        toast.error("Config saved but reload failed. Please refresh the page.", { id: toastId });
        setChanges(savedChanges);
      }
    } catch (e: any) {
      const errorMsg = e.conflict ? "File changed on disk — reload or force save." : `Error: ${e.message}`;
      toast.error(errorMsg, { id: toastId });
    }
  }

  function handleResetAll() {
    if (changes.length === 0) return;
    const confirmed = window.confirm('Are you sure? This will discard all unsaved changes and restore values from the server.');
    if (!confirmed) return;
    setResolveOut(JSON.parse(JSON.stringify(defaultValues)));
    setChanges([]);
    setResetKey(prev => prev + 1);
    toast.success('All changes discarded. Values restored from server.');
  }

  useEffect(() => {
    doResolve();
    fetchBranchHealth();
    // Refresh health every 30 seconds
    const interval = setInterval(fetchBranchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  const renderVariable = (v: any, hideFile = false) => {
    const res = resolveOut.find((r) => r.variable === v.name);
    const m = v.map[0];
    const currentValue = getCurrentValue(m.file, m, res?.mappings?.[0]?.value);
    const desc = (descriptions as any)[v.name];

    return (
      <div key={v.name} className="bg-surface-dark border border-slate-800 rounded-xl p-4">
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
                <div className="w-3 h-3 rounded-full bg-slate-700 text-text-secondary text-xs flex items-center justify-center cursor-help">
                  ?
                </div>
              </Tooltip>
            )}
          </div>
          <div className={`text-xs font-semibold ${res?.valid?.ok ? "text-emerald-400" : "text-red-400"}`}>
            {res?.valid?.ok ? "SECURE" : `ALERT (${res?.valid?.reason || "spec"})`}
          </div>
        </div>
        <div className="text-xs text-text-secondary mb-3">{v.help}</div>
        {!hideFile && (
          <div className="text-xs text-text-secondary mb-2">
            <span className="font-mono">{m.file}</span>
            <span className="mx-1">·</span>
            <span>{m.path}</span>
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="text-xs text-text-secondary">
            <span className="font-medium">Current:</span>{" "}
            <span className="font-mono text-blue-400">{String(res?.mappings?.[0]?.value ?? "")}</span>
          </div>
          {v.default !== undefined && (
            <div className="text-xs text-text-secondary">
              <span className="font-medium">Default:</span>{" "}
              <span className="font-mono">{String(v.default)}</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <div className="flex-1">
            {v.type === "boolean" ? (
              <Select
                value={String(currentValue ?? "")}
                onChange={(value) => {
                  onFieldChange(v.name, 0, m.file, "json", { path: m.path, value: value === "true" });
                }}
                options={[
                  { value: "true", label: "Enabled" },
                  { value: "false", label: "Disabled" }
                ]}
                className="w-full"
              />
            ) : v.type === "select" && v.options ? (
              <Select
                value={String(currentValue ?? "")}
                onChange={(value) => {
                  onFieldChange(v.name, 0, m.file, "json", { path: m.path, value });
                }}
                options={v.options}
                className="w-full"
              />
            ) : (
              <input
                key={`${v.name}-${resetKey}`}
                className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
                type={v.type === "number" ? "number" : "text"}
                step={v.type === "number" ? "0.01" : undefined}
                placeholder={String(res?.mappings?.[0]?.value ?? "")}
                defaultValue={String(res?.mappings?.[0]?.value ?? "")}
                onChange={(e) => {
                  let value: any = e.target.value;
                  if (v.type === "number") value = parseFloat(value) || 0;
                  onFieldChange(v.name, 0, m.file, "json", { path: m.path, value });
                }}
              />
            )}
          </div>
          {v.default !== undefined && (
            <button
              onClick={() => {
                onFieldChange(v.name, 0, m.file, "json", { path: m.path, value: v.default });
                setResetKey(prev => prev + 1);
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
  };

  if (loadError) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-500 rounded p-4">
          <h3 className="font-bold text-red-400 mb-2">Configuration Load Error</h3>
          <p className="text-red-300 mb-4">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded text-white transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  // Get current weight values for visualization
  const heuristicsWeight = Number(getValue("ARBITER_WEIGHT_HEURISTICS")) || 0.3;
  const semanticWeight = Number(getValue("ARBITER_WEIGHT_SEMANTIC")) || 0.35;
  const llmGuardWeight = Number(getValue("ARBITER_WEIGHT_LLM_GUARD")) || 0.35;
  const blockThreshold = Number(getValue("ARBITER_BLOCK_SCORE")) || 50;

  return (
    <div className="p-6 overflow-auto">
      {/* Section Header */}
      <div className="mb-8">
        <div className="mb-4">
          <h1 className="text-2xl font-bold text-white mb-2">Arbiter Configuration</h1>
          <p className="text-text-secondary">Configure weighted voting and priority boosts for the 3-Branch decision engine</p>
        </div>
        <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            The Arbiter combines scores from all 3 detection branches using weighted voting.
            Configure branch weights (default: Heuristics 30%, Semantic 35%, NLP Analysis 35%),
            priority boosts for edge cases, and thresholds for ALLOW/BLOCK decisions.
            Degraded weights are used when branches are offline.
          </p>
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
        <button
          onClick={handleResetAll}
          disabled={changes.length === 0}
          className="px-4 py-2 rounded bg-orange-600 hover:bg-orange-700 disabled:bg-slate-800/50 disabled:cursor-not-allowed text-white transition-colors"
          title="Restore all values from server (discards unsaved changes)"
        >
          Reset All Changes
        </button>
      </div>

      {/* 3-Branch Visual Overview */}
      <div className="mb-8 rounded-2xl border border-slate-800 p-6 bg-gradient-to-br from-slate-900 to-slate-800">
        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
          3-Branch Detection Architecture
        </h2>

        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Branch A - Heuristics */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-amber-500 rounded-full"></div>
                <span className="font-semibold text-amber-400">Branch A</span>
              </div>
              {branchHealth?.heuristics && (
                <span className={`text-xs px-2 py-1 rounded ${
                  branchHealth.heuristics.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {branchHealth.heuristics.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
                </span>
              )}
            </div>
            <h3 className="text-lg font-medium text-white mb-1">Heuristics Service</h3>
            <p className="text-xs text-text-secondary mb-3">
              Pattern matching, entropy analysis, structure detection
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all duration-500"
                  style={{ width: `${heuristicsWeight * 100}%` }}
                ></div>
              </div>
              <span className="text-sm font-mono text-amber-400">{(heuristicsWeight * 100).toFixed(0)}%</span>
            </div>
            {branchHealth?.heuristics?.latency_ms && (
              <div className="mt-2 text-xs text-text-secondary">
                Latency: {branchHealth.heuristics.latency_ms}ms
              </div>
            )}
          </div>

          {/* Branch B - Semantic */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                <span className="font-semibold text-purple-400">Branch B</span>
              </div>
              {branchHealth?.semantic && (
                <span className={`text-xs px-2 py-1 rounded ${
                  branchHealth.semantic.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {branchHealth.semantic.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
                </span>
              )}
            </div>
            <h3 className="text-lg font-medium text-white mb-1">Semantic Service</h3>
            <p className="text-xs text-text-secondary mb-3">
              Embedding similarity via ClickHouse HNSW index
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${semanticWeight * 100}%` }}
                ></div>
              </div>
              <span className="text-sm font-mono text-purple-400">{(semanticWeight * 100).toFixed(0)}%</span>
            </div>
            {branchHealth?.semantic?.latency_ms && (
              <div className="mt-2 text-xs text-text-secondary">
                Latency: {branchHealth.semantic.latency_ms}ms
              </div>
            )}
          </div>

          {/* Branch C - NLP Analysis */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-cyan-500 rounded-full"></div>
                <span className="font-semibold text-cyan-400">Branch C</span>
              </div>
              {branchHealth?.llm_guard && (
                <span className={`text-xs px-2 py-1 rounded ${
                  branchHealth.llm_guard.status === 'healthy' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                }`}>
                  {branchHealth.llm_guard.status === 'healthy' ? 'ONLINE' : 'OFFLINE'}
                </span>
              )}
            </div>
            <h3 className="text-lg font-medium text-white mb-1">NLP Safety Analysis</h3>
            <p className="text-xs text-text-secondary mb-3">
              NLP safety classifier (Llama Guard-based)
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-cyan-500 transition-all duration-500"
                  style={{ width: `${llmGuardWeight * 100}%` }}
                ></div>
              </div>
              <span className="text-sm font-mono text-cyan-400">{(llmGuardWeight * 100).toFixed(0)}%</span>
            </div>
            {branchHealth?.llm_guard?.latency_ms && (
              <div className="mt-2 text-xs text-text-secondary">
                Latency: {branchHealth.llm_guard.latency_ms}ms
              </div>
            )}
          </div>
        </div>

        {/* Decision Flow Visualization */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-xs text-text-secondary mb-1">Combined Score</div>
              <div className="text-2xl font-mono font-bold text-white">
                {(heuristicsWeight * 100).toFixed(0)}A + {(semanticWeight * 100).toFixed(0)}B + {(llmGuardWeight * 100).toFixed(0)}C
              </div>
            </div>
            <div className="text-3xl text-slate-600">→</div>
            <div className="text-center">
              <div className="text-xs text-text-secondary mb-1">Decision Threshold</div>
              <div className="text-2xl font-mono font-bold">
                <span className="text-emerald-400">&lt;{blockThreshold}</span>
                <span className="text-slate-500 mx-2">/</span>
                <span className="text-red-400">&ge;{blockThreshold}</span>
              </div>
            </div>
            <div className="text-3xl text-slate-600">→</div>
            <div className="text-center">
              <div className="text-xs text-text-secondary mb-1">Decision</div>
              <div className="flex gap-2">
                <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded text-sm font-semibold">ALLOW</span>
                <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-sm font-semibold">BLOCK</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Branch Weights Section */}
      <div className="mb-8 rounded-2xl border border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <h2 className="text-xl font-semibold">Branch Weights</h2>
        </div>
        <p className="text-text-secondary text-sm mb-4">
          Configure how much each branch contributes to the combined threat score. Weights must sum to 1.0.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {arbiterWeights.filter((v: any) =>
            ['ARBITER_WEIGHT_HEURISTICS', 'ARBITER_WEIGHT_SEMANTIC', 'ARBITER_WEIGHT_LLM_GUARD',
             'ARBITER_DEGRADED_HEURISTICS', 'ARBITER_DEGRADED_SEMANTIC',
             'ARBITER_BLOCK_SCORE', 'ARBITER_CONFIDENCE_MIN'].includes(v.name)
          ).map((v: any) => renderVariable(v, true))}
        </div>
      </div>

      {/* Priority Boosts Section */}
      <div className="rounded-2xl border border-slate-800 p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
          <h2 className="text-xl font-semibold">Priority Boosts</h2>
        </div>
        <p className="text-text-secondary text-sm mb-4">
          Special rules that override the weighted voting for edge cases.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {arbiterBoosts.map((v: any) => renderVariable(v, true))}
        </div>

        {/* Boost Explanations */}
        <div className="mt-6 bg-slate-900/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Boost Priority Order</h3>
          <div className="space-y-2 text-xs">
            <div className="flex items-start gap-2">
              <span className="text-red-400 font-semibold">1.</span>
              <div>
                <span className="text-white font-medium">CONSERVATIVE_OVERRIDE</span>
                <span className="text-text-secondary ml-2">— Block if ANY branch reports HIGH threat (&ge;70)</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-red-400 font-semibold">2.</span>
              <div>
                <span className="text-white font-medium">LLM_GUARD_VETO</span>
                <span className="text-text-secondary ml-2">— Force BLOCK if NLP analysis score &gt; 90</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-emerald-400 font-semibold">3.</span>
              <div>
                <span className="text-white font-medium">UNANIMOUS_LOW</span>
                <span className="text-text-secondary ml-2">— Force ALLOW if all 3 branches report LOW (&le;30)</span>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-yellow-400 font-semibold">4.</span>
              <div>
                <span className="text-white font-medium">SEMANTIC_HIGH_SIMILARITY</span>
                <span className="text-text-secondary ml-2">— Add +15 boost when similarity &gt; 0.85</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
