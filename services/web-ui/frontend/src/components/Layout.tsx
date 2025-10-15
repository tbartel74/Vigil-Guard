import React from "react";
import Footer from "./Footer";
import { useMobile } from "../context/MobileContext";

export default function Layout({ header, sidebar, children }:{ header:React.ReactNode; sidebar:React.ReactNode; children:React.ReactNode; }) {
  const { isMobile, isSidebarOpen, setSidebarOpen } = useMobile();

  return (
    <div className="min-h-screen grid grid-rows-[56px_1fr_48px]">
      <header>{header}</header>
      <div className="relative flex">
        {/* Desktop: sidebar always visible */}
        {!isMobile && (
          <aside className="w-[260px] border-r border-slate-800 bg-surface-darker overflow-y-auto">
            {sidebar}
          </aside>
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
            <aside className="fixed left-0 top-14 bottom-12 w-[280px] z-50 bg-surface-darker border-r border-slate-800 overflow-y-auto transform transition-transform duration-300">
              {sidebar}
            </aside>
          </>
        )}

        {/* Main content */}
        <main className="flex-1 bg-surface-base overflow-auto">{children}</main>
      </div>
      <Footer />
    </div>
  );
}