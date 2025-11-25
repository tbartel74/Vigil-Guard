import React from "react";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <div className="h-12 px-4 flex items-center justify-between bg-surface-darkest border-t border-slate-800 text-xs">
      <div className="flex items-center gap-4">
        <div className="text-text-secondary">
          © {currentYear} Vigil Guard. All rights reserved.
        </div>
        <div className="text-text-secondary">
          Version 2.0.0
        </div>
        <a
          href="https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M"
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-secondary hover:text-white transition-colors"
          title="Powered by Meta Llama Prompt Guard 2"
        >
          Built with Llama 🦙
        </a>
      </div>
      <div className="flex items-center gap-4 text-text-secondary">
        <div>Enterprise Security Platform</div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
          <span>System Operational</span>
        </div>
      </div>
    </div>
  );
}