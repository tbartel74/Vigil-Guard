/**
 * HelpBreadcrumb Component
 *
 * Shows navigation path: Category > Document title
 */

import React from 'react';
import { ChevronRight, Home } from 'lucide-react';
import type { DocEntry, DocCategory } from '../../types/help';

interface HelpBreadcrumbProps {
  /** Current document */
  currentDoc: DocEntry | null;
  /** All categories (for finding parent) */
  categories?: DocCategory[];
  /** Callback to navigate to doc list */
  onNavigateHome?: () => void;
}

export default function HelpBreadcrumb({ currentDoc, categories = [], onNavigateHome }: HelpBreadcrumbProps) {
  if (!currentDoc) {
    return null;
  }

  // Find category for current doc
  const category = categories.find(cat => cat.docs.some(doc => doc.id === currentDoc.id));

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-2 text-sm text-slate-400 mb-4"
    >
      {/* Home */}
      <button
        onClick={onNavigateHome}
        className="flex items-center gap-1 hover:text-white transition-colors"
        title="Documentation Home"
      >
        <Home className="w-3.5 h-3.5" />
        <span>Docs</span>
      </button>

      <ChevronRight className="w-3.5 h-3.5 text-slate-600" />

      {/* Category */}
      {category && (
        <>
          <span className="text-slate-500">{category.label}</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
        </>
      )}

      {/* Current document */}
      <span className="text-white font-medium flex items-center gap-1.5">
        {currentDoc.icon && <span>{currentDoc.icon}</span>}
        {currentDoc.title}
      </span>
    </nav>
  );
}
