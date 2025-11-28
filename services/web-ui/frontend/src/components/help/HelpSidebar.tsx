/**
 * HelpSidebar Component
 *
 * Navigation sidebar for documentation with collapsible categories.
 * Uses dynamically loaded categories from GitHub.
 */

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, BookOpen, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import type { DocCategory, DocEntry } from '../../types/help';

interface HelpSidebarProps {
  /** Currently active document ID */
  activeDocId: string | null;
  /** Dynamically loaded categories */
  categories: DocCategory[];
  /** Loading state for structure */
  structureLoading: boolean;
  /** Error loading structure */
  structureError: string | null;
  /** Callback when document is selected */
  onSelectDoc: (docId: string) => void;
  /** Callback to refresh structure */
  onRefresh?: () => void;
  /** Whether sidebar is open (mobile) */
  isOpen?: boolean;
  /** Callback to close sidebar (mobile) */
  onClose?: () => void;
}

/** Get Lucide icon component by name */
function getIcon(iconName: string): React.ComponentType<{ className?: string }> {
  const icons = LucideIcons as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] || BookOpen;
}

/** Category accordion item */
function CategoryItem({
  category,
  activeDocId,
  onSelectDoc,
  defaultExpanded,
}: {
  category: DocCategory;
  activeDocId: string | null;
  onSelectDoc: (docId: string) => void;
  defaultExpanded: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const Icon = getIcon(category.icon);
  const hasActiveDoc = category.docs.some((doc) => doc.id === activeDocId);

  return (
    <div className="mb-2">
      {/* Category header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`
          w-full flex items-center justify-between px-3 py-2 rounded-md
          text-sm font-medium transition-colors
          ${hasActiveDoc ? 'text-blue-400' : 'text-slate-300 hover:text-white'}
          hover:bg-slate-800/50
        `}
      >
        <span className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          {category.label}
        </span>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {/* Documents list */}
      {isExpanded && (
        <ul className="mt-1 ml-4 space-y-0.5">
          {category.docs.map((doc) => (
            <li key={doc.id}>
              <button
                onClick={() => onSelectDoc(doc.id)}
                className={`
                  w-full text-left px-3 py-1.5 rounded-md text-sm
                  transition-colors flex items-center gap-2
                  ${
                    activeDocId === doc.id
                      ? 'bg-blue-500/20 text-blue-400 font-medium'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                  }
                `}
              >
                {doc.icon && <span className="text-base">{doc.icon}</span>}
                <span className="truncate">{doc.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function HelpSidebar({
  activeDocId,
  categories,
  structureLoading,
  structureError,
  onSelectDoc,
  onRefresh,
  isOpen = true,
  onClose,
}: HelpSidebarProps) {
  // Find which category has the active doc (to expand it by default)
  const activeCategoryId = activeDocId
    ? categories.find((cat) => cat.docs.some((doc) => doc.id === activeDocId))?.id
    : null;

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && onClose && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 z-30
          h-screen w-64 lg:w-56
          bg-surface-darker border-r border-slate-800
          transform transition-transform duration-300 ease-in-out
          lg:transform-none overflow-hidden
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-400" />
              Documentation
            </h2>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1.5 text-slate-500 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
                title="Refresh from GitHub"
                disabled={structureLoading}
              >
                <RefreshCw className={`w-4 h-4 ${structureLoading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-3">
            {structureLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : structureError ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
                <p className="text-sm text-slate-400 mb-3">{structureError}</p>
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    Try again
                  </button>
                )}
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">
                No documentation found
              </div>
            ) : (
              categories.map((category) => (
                <CategoryItem
                  key={category.id}
                  category={category}
                  activeDocId={activeDocId}
                  onSelectDoc={(docId) => {
                    onSelectDoc(docId);
                    onClose?.();
                  }}
                  defaultExpanded={
                    category.id === activeCategoryId || category.id === 'overview'
                  }
                />
              ))
            )}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-slate-800 text-xs text-slate-500">
            <p>Vigil Guard Docs v2.0</p>
            <p className="text-slate-600 mt-1">
              <a
                href="https://github.com/tbartel74/Vigil-Guard/tree/main/docs"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-slate-400 transition-colors"
              >
                View on GitHub →
              </a>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
