import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import ConfigNav from "./ConfigNav";
import VersionHistoryModal from "./VersionHistoryModal";

export default function ConfigLayout() {
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  const handleRollbackSuccess = () => {
    // Reload the page to reflect changes
    window.location.reload();
  };

  return (
    <div className="grid grid-cols-[280px_1fr] h-[calc(100vh-104px)]">
      <div className="border-r border-slate-800 bg-[#0C1117] flex flex-col">
        <ConfigNav />
        <div className="mt-auto p-4 border-t border-slate-800">
          <button
            onClick={() => setShowVersionHistory(true)}
            className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Version History
          </button>
        </div>
      </div>
      <div className="overflow-auto bg-[#0F1419]">
        <Outlet />
      </div>

      {showVersionHistory && (
        <VersionHistoryModal
          onClose={() => setShowVersionHistory(false)}
          onRollbackSuccess={handleRollbackSuccess}
        />
      )}
    </div>
  );
}