import React from "react";
import { NavLink } from "react-router-dom";
import sections from "../spec/sections.json";

export default function ConfigNav() {
  return (
    <nav className="p-4 space-y-2">
      <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">
        Configuration
      </div>

      {sections.sections.map((section) => (
        <NavLink
          key={section.id}
          to={`/config/${section.id}`}
          className={({ isActive }) =>
            `block px-3 py-3 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              isActive
                ? "bg-slate-800 text-white"
                : "text-slate-400 hover:text-white hover:bg-slate-800/50"
            }`
          }
        >
          <div className="font-medium mb-1">{section.title}</div>
          <div className="text-xs text-text-secondary leading-relaxed">
            {section.description}
          </div>
        </NavLink>
      ))}
    </nav>
  );
}