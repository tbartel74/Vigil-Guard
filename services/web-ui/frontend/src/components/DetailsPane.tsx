import React from "react";

interface DetailsPaneProps {
  raw: string | null;
  parsed: any | null;
  file: { name: string; etag: string } | null;
  // NEW v1.7.0: Browser metadata from Investigation panel
  browserData?: {
    client_id?: string;
    browser_name?: string;
    browser_version?: string;
    browser_language?: string;
    browser_timezone?: string;
    os_name?: string;
  };
}

export default function DetailsPane({ raw, parsed, file, browserData }: DetailsPaneProps) {
  return (
    <div className="p-4 h-full overflow-auto">
      <div className="text-sm text-text-secondary mb-2">
        <div className="font-mono">File: {file?.name || "—"}</div>
        <div className="font-mono">ETag: {file?.etag || "—"}</div>
      </div>

      {/* NEW v1.7.0: Browser Metadata Section */}
      {browserData?.client_id && (
        <div className="mb-4 p-3 bg-surface-dark rounded border border-border-subtle">
          <h3 className="text-sm font-semibold text-text-primary mb-2">
            Browser Metadata
          </h3>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-text-secondary">Client ID:</span>
              <span className="ml-2 font-mono text-blue-400">{browserData.client_id}</span>
            </div>
            <div>
              <span className="text-text-secondary">Browser:</span>
              <span className="ml-2">{browserData.browser_name} {browserData.browser_version}</span>
            </div>
            <div>
              <span className="text-text-secondary">OS:</span>
              <span className="ml-2">{browserData.os_name || 'unknown'}</span>
            </div>
            <div>
              <span className="text-text-secondary">Language:</span>
              <span className="ml-2">{browserData.browser_language || 'unknown'}</span>
            </div>
            <div>
              <span className="text-text-secondary">Timezone:</span>
              <span className="ml-2">{browserData.browser_timezone || 'unknown'}</span>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase text-text-secondary mb-1">Raw preview</div>
          <pre className="bg-slate-900 border border-slate-800 rounded p-2 text-xs overflow-auto">{raw}</pre>
        </div>
        <div>
          <div className="text-xs uppercase text-text-secondary mb-1">Parsed object</div>
          <pre className="bg-slate-900 border border-slate-800 rounded p-2 text-xs overflow-auto">{JSON.stringify(parsed, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}