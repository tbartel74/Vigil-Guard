import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export default function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`
        px-3 py-2 rounded-md
        bg-slate-800 border border-slate-700
        text-white text-sm
        placeholder:text-slate-500
        focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500
        disabled:opacity-50 disabled:cursor-not-allowed
        transition-colors
        ${className}
      `.trim().replace(/\s+/g, ' ')}
      {...props}
    />
  );
}
