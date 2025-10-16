import React from 'react';

interface ScrollAreaProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function ScrollArea({ children, className = '', style }: ScrollAreaProps) {
  return (
    <div
      className={`overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-slate-900 ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}
