/**
 * ServiceStatusPanel - Displays Presidio API status
 * Part of PIISettings component refactoring (Sprint 3.2)
 */

import React from 'react';

interface ServiceStatus {
  status: 'online' | 'offline';
  version?: string;
  recognizers_loaded?: number;
  spacy_models?: string[];
  fallback?: string;
  error?: string;
}

interface ServiceStatusPanelProps {
  serviceStatus: ServiceStatus | null;
}

export default function ServiceStatusPanel({ serviceStatus }: ServiceStatusPanelProps) {
  const getStatusColor = () => {
    if (!serviceStatus) return 'bg-slate-600';
    return serviceStatus.status === 'online' ? 'bg-green-500' : 'bg-red-500';
  };

  const getStatusText = () => {
    if (!serviceStatus) return 'Unknown';
    return serviceStatus.status === 'online' ? 'Online' : 'Offline';
  };

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Service Status</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-center space-x-3">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <div>
            <div className="text-sm text-slate-400">Presidio API</div>
            <div className="text-white font-medium">{getStatusText()}</div>
          </div>
        </div>
        {serviceStatus?.status === 'online' && (
          <>
            <div>
              <div className="text-sm text-slate-400">Recognizers Loaded</div>
              <div className="text-white font-medium">{serviceStatus.recognizers_loaded || 0}</div>
            </div>
            <div>
              <div className="text-sm text-slate-400">spaCy Models</div>
              <div className="text-white font-medium">{serviceStatus.spacy_models?.length || 0} loaded</div>
            </div>
          </>
        )}
        {serviceStatus?.status === 'offline' && (
          <div className="col-span-2">
            <div className="text-sm text-slate-400">Fallback Mode</div>
            <div className="text-yellow-400 font-medium">Using regex rules (13 patterns)</div>
          </div>
        )}
      </div>
    </div>
  );
}
