/**
 * HelpNavigation Component
 *
 * Previous/Next navigation buttons for documents.
 */

import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { DocEntry } from '../../types/help';

interface HelpNavigationProps {
  /** Current document ID */
  currentDocId: string | null;
  /** All documents for navigation */
  allDocs?: DocEntry[];
  /** Callback to navigate to document */
  onNavigate: (docId: string) => void;
}

export default function HelpNavigation({ currentDocId, allDocs = [], onNavigate }: HelpNavigationProps) {
  // Calculate adjacent docs from dynamic structure
  const { prev, next } = useMemo(() => {
    if (!currentDocId || allDocs.length === 0) {
      return { prev: null, next: null };
    }

    const currentIndex = allDocs.findIndex(doc => doc.id === currentDocId);
    if (currentIndex === -1) {
      return { prev: null, next: null };
    }

    return {
      prev: currentIndex > 0 ? allDocs[currentIndex - 1] : null,
      next: currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null,
    };
  }, [currentDocId, allDocs]);

  if (!prev && !next) {
    return null;
  }

  return (
    <nav
      aria-label="Document navigation"
      className="flex items-center justify-between mt-12 pt-6 border-t border-slate-800"
    >
      {/* Previous */}
      {prev ? (
        <button
          onClick={() => onNavigate(prev.id)}
          className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
        >
          <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
          <div className="text-left">
            <div className="text-xs text-slate-500 mb-0.5">Previous</div>
            <div className="text-sm font-medium flex items-center gap-1.5">
              {prev.icon && <span>{prev.icon}</span>}
              {prev.title}
            </div>
          </div>
        </button>
      ) : (
        <div /> // Spacer
      )}

      {/* Next */}
      {next ? (
        <button
          onClick={() => onNavigate(next.id)}
          className="group flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-right"
        >
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Next</div>
            <div className="text-sm font-medium flex items-center justify-end gap-1.5">
              {next.icon && <span>{next.icon}</span>}
              {next.title}
            </div>
          </div>
          <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
      ) : (
        <div /> // Spacer
      )}
    </nav>
  );
}
