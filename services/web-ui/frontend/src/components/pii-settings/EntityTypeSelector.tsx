/**
 * EntityTypeSelector - Multi-select for PII entity types
 * Part of PIISettings component refactoring (Sprint 3.2)
 */

import React from 'react';

interface EntityType {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface EntityTypeSelectorProps {
  entityTypes: EntityType[];
  selectedEntities: string[];
  onToggle: (entityId: string) => void;
}

export default function EntityTypeSelector({
  entityTypes,
  selectedEntities,
  onToggle
}: EntityTypeSelectorProps) {
  return (
    <div className="pb-6 border-b border-slate-700">
      <label className="block text-sm font-medium text-slate-300 mb-3">
        Detected Entity Types ({selectedEntities.length} selected)
      </label>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
        {entityTypes.map((entity) => (
          <label
            key={entity.id}
            className="flex items-start space-x-3 p-3 rounded-lg border border-slate-700 hover:bg-slate-800/50 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={selectedEntities.includes(entity.id)}
              onChange={() => onToggle(entity.id)}
              className="mt-1 w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-600 focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex-1 min-w-0">
              <div className="text-slate-200 font-medium text-sm">{entity.name}</div>
              <div className="text-xs text-blue-400 capitalize">{entity.category}</div>
              <div className="text-xs text-text-secondary mt-1">{entity.description}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
