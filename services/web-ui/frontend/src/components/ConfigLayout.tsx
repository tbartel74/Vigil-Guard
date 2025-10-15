import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import ConfigNav from "./ConfigNav";
import VersionHistoryModal from "./VersionHistoryModal";
import { useMobile } from "../context/MobileContext";

export default function ConfigLayout() {
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const { isMobile, isSidebarOpen, setSidebarOpen } = useMobile();

  const handleRollbackSuccess = () => {
    // Reload the page to reflect changes
    window.location.reload();
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      <ConfigNav />
      <div className="mt-auto p-4 border-t border-slate-800">
        <button
          onClick={() => setShowVersionHistory(true)}
          title="View configuration version history and rollback to previous versions"
          className="w-full px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Version History
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative flex h-[calc(100vh-104px)]">
      {/* Desktop: sidebar always visible */}
      {!isMobile && (
        <div className="w-[280px] border-r border-slate-800 bg-surface-darker">
          {sidebarContent}
        </div>
      )}

      {/* Mobile: offcanvas overlay */}
      {isMobile && isSidebarOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sidebar */}
          <div className="fixed left-0 top-14 bottom-12 w-[280px] z-50 bg-surface-darker border-r border-slate-800 overflow-y-auto transform transition-transform duration-300">
            {sidebarContent}
          </div>
        </>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-auto bg-surface-base">
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