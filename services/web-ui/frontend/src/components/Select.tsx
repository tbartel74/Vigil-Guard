import React from "react";

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  className?: string;
}

export default function Select({ value, onChange, options, className = "" }: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}