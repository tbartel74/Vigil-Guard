import React from "react";
import { NavLink } from "react-router-dom";
import sections from "../spec/sections.json";

export default function ConfigNav() {
  return (
    <nav className="p-4 space-y-2">
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4">
        Configuration
      </div>

      {sections.sections.map((section) => (
        <NavLink
          key={section.id}
          to={`/config/${section.id}`}
          className={({ isActive }) =>
            `block px-3 py-3 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-darker ${
              isActive
                ? "bg-slate-800 text-white"
                : "text-text-secondary hover:text-white hover:bg-slate-800/50"
            }`
          }
        >
          <div className="font-medium mb-1">{section.title}</div>
          <div className="text-xs text-text-secondary leading-relaxed">
            {section.description}
          </div>
        </NavLink>
      ))}

      {/* Special sections (not variable groups) */}
      <div className="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-4 mt-6">
        System
      </div>

      <NavLink
        to="/config/pii"
        className={({ isActive }) =>
          `block px-3 py-3 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-darker ${
            isActive
              ? "bg-slate-800 text-white"
              : "text-text-secondary hover:text-white hover:bg-slate-800/50"
          }`
        }
      >
        <div className="font-medium mb-1">PII Detection</div>
        <div className="text-xs text-text-secondary leading-relaxed">
          Configure Microsoft Presidio for advanced PII detection (50+ entity types)
        </div>
      </NavLink>

      <NavLink
        to="/config/retention"
        className={({ isActive }) =>
          `block px-3 py-3 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-darker ${
            isActive
              ? "bg-slate-800 text-white"
              : "text-text-secondary hover:text-white hover:bg-slate-800/50"
          }`
        }
      >
        <div className="font-medium mb-1">Data Retention</div>
        <div className="text-xs text-text-secondary leading-relaxed">
          Configure automatic cleanup policies and disk usage monitoring
        </div>
      </NavLink>
    </nav>
  );
}