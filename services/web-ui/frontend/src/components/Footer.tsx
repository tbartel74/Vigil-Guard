import React from "react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="h-12 px-4 flex items-center justify-between bg-surface-darkest border-t border-slate-800 text-xs">
      <div className="flex items-center gap-4">
        <div className="text-slate-500">
          © {currentYear} Vigil Guard. All rights reserved.
        </div>
        <div className="text-slate-600">
          Version 1.3.0
        </div>
        <a
          href="https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M"
          target="_blank"
          rel="noopener noreferrer"
          className="text-slate-500 hover:text-slate-400 transition-colors"
          title="Powered by Meta Llama Prompt Guard 2"
        >
          Built with Llama 🦙
        </a>
      </div>
      <div className="flex items-center gap-4 text-slate-500">
        <div>Enterprise Security Platform</div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
          <span>System Operational</span>
        </div>
      </div>
    </div>
  );
}