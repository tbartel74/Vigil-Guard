import React, { useState, useEffect } from 'react';

interface GrafanaEmbedProps {
  src: string;
  title: string;
  width?: string;
  height?: string;
  refreshInterval?: number;
}

export default function GrafanaEmbed({ src, title, width = "100%", height = "250", refreshInterval = 0 }: GrafanaEmbedProps) {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'blocked'>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [iframeSrc, setIframeSrc] = useState(src);

  useEffect(() => {
    // Update iframe src when src prop changes
    setIframeSrc(src);
  }, [src]);

  useEffect(() => {
    // Skip CORS test and try iframe directly
    // Grafana server is known to be running on localhost:3001
    setStatus('success');

    // Auto-refresh functionality
    if (refreshInterval > 0) {
      const interval = setInterval(() => {
        // Force refresh by updating cache buster
        const urlObj = new URL(iframeSrc);
        urlObj.searchParams.set('_', Date.now().toString());
        setIframeSrc(urlObj.toString());
      }, refreshInterval * 1000);

      return () => clearInterval(interval);
    }
  }, [refreshInterval, iframeSrc]);

  const handleIframeError = () => {
    setStatus('blocked');
    setErrorMessage('Iframe blocked by X-Frame-Options or CSP policy');
  };

  const openInNewTab = () => {
    // Convert solo URL to full dashboard URL
    const fullUrl = iframeSrc.replace('/d-solo/', '/d/').replace(/&__feature\.dashboardSceneSolo=true/, '');
    window.open(fullUrl, '_blank');
  };

  if (status === 'loading') {
    return (
      <div className="bg-slate-900/50 rounded-lg p-2">
        <div className={`h-[${height}px] flex items-center justify-center text-text-secondary border border-slate-700 rounded`}>
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
            <div className="text-sm">Loading Grafana dashboard...</div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'error' || status === 'blocked') {
    return (
      <div className="bg-slate-900/50 rounded-lg p-2">
        <div className={`h-[${height}px] flex flex-col items-center justify-center text-text-secondary border border-slate-700 rounded`}>
          <div className="text-center space-y-3">
            <div className="text-red-400 font-semibold">⚠ Dashboard Unavailable</div>
            <div className="text-sm">{errorMessage}</div>

            {status === 'error' && (
              <div className="text-xs text-text-secondary space-y-1">
                <div>Solutions:</div>
                <div>• Start Grafana: <code className="bg-slate-800 px-1 rounded">docker run -p 3001:3000 grafana/grafana</code></div>
                <div>• Or use Grafana Cloud URL instead of localhost</div>
              </div>
            )}

            {status === 'blocked' && (
              <div className="text-xs text-text-secondary space-y-1">
                <div>iframe embedding blocked. Add to Grafana config:</div>
                <code className="bg-slate-800 px-2 py-1 rounded text-xs block mt-1">
                  [security]<br/>
                  allow_embedding = true<br/>
                  cookie_samesite = none
                </code>
              </div>
            )}

            <button
              onClick={openInNewTab}
              className="mt-3 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            >
              Open Dashboard in New Tab
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Try to load iframe
  return (
    <div className="bg-slate-900/50 rounded-lg p-2">
      <iframe
        src={iframeSrc}
        width={width}
        height={height}
        frameBorder="0"
        className="rounded border border-slate-700 w-full"
        title={title}
        onError={handleIframeError}
        onLoad={() => {
          console.log('Grafana iframe loaded successfully');
          setStatus('success');
        }}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      />
    </div>
  );
}