import React, { useState } from "react";

interface TooltipProps {
  title: string;
  description: string;
  impact?: string;
  category?: string;
  children: React.ReactNode;
}

export default function Tooltip({ title, description, impact, category, children }: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);

  const getImpactColor = (impact?: string) => {
    switch (impact?.toLowerCase()) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="relative inline-block">
      <div
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>

      {isVisible && (
        <div className="absolute z-50 w-80 p-3 mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl left-0">
          <div className="text-sm font-semibold text-white mb-1">{title}</div>
          {category && (
            <div className="text-xs text-slate-400 mb-2">
              Category: {category}
              {impact && (
                <span className="ml-2">
                  • Impact: <span className={getImpactColor(impact)}>{impact}</span>
                </span>
              )}
            </div>
          )}
          <div className="text-xs text-slate-300 leading-relaxed">{description}</div>
        </div>
      )}
    </div>
  );
}