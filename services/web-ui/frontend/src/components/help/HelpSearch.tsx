/**
 * HelpSearch Component
 *
 * Search input with keyboard shortcut (⌘K / Ctrl+K) and results dropdown.
 * Uses Fuse.js for fuzzy search across all documentation.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, X, FileText, Loader2 } from 'lucide-react';
import Fuse from 'fuse.js';
import type { SearchIndexEntry, DocEntry } from '../../types/help';

interface HelpSearchProps {
  /** Callback when document is selected */
  onSelectDoc: (docId: string) => void;
  /** Function to get search index (lazy loads all docs) */
  getSearchIndex: () => Promise<SearchIndexEntry[]>;
}

interface SearchResult {
  doc: DocEntry;
  score: number;
  snippet: string;
}

export default function HelpSearch({ onSelectDoc, getSearchIndex }: HelpSearchProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchIndex, setSearchIndex] = useState<SearchIndexEntry[] | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Fuse search
  const fuse = useMemo(() => {
    if (!searchIndex) return null;

    return new Fuse(searchIndex, {
      keys: [
        { name: 'doc.title', weight: 2 },
        { name: 'content', weight: 1 },
      ],
      threshold: 0.3,
      includeMatches: true,
      minMatchCharLength: 2,
      ignoreLocation: true,
    });
  }, [searchIndex]);

  // Load search index when opening
  const loadIndex = useCallback(async () => {
    if (searchIndex) return;

    setIsLoading(true);
    try {
      const index = await getSearchIndex();
      setSearchIndex(index);
    } catch (error) {
      console.error('[HelpSearch] Failed to load index:', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchIndex, getSearchIndex]);

  // Handle search
  useEffect(() => {
    if (!fuse || query.length < 2) {
      setResults([]);
      return;
    }

    const fuseResults = fuse.search(query).slice(0, 8);

    const formattedResults: SearchResult[] = fuseResults.map((result) => {
      // Extract snippet from content match
      let snippet = '';
      const contentMatch = result.matches?.find((m) => m.key === 'content');
      if (contentMatch && contentMatch.value) {
        const firstIndex = contentMatch.indices[0]?.[0] || 0;
        const start = Math.max(0, firstIndex - 30);
        const end = Math.min(contentMatch.value.length, firstIndex + 100);
        snippet = (start > 0 ? '...' : '') + contentMatch.value.slice(start, end) + (end < contentMatch.value.length ? '...' : '');
      }

      return {
        doc: result.item.doc,
        score: result.score || 0,
        snippet,
      };
    });

    setResults(formattedResults);
    setSelectedIndex(0);
  }, [query, fuse]);

  // Keyboard shortcut to open (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen(true);
        loadIndex();
        setTimeout(() => inputRef.current?.focus(), 0);
      }

      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        setQuery('');
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loadIndex]);

  // Handle keyboard navigation in results
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!results.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      e.preventDefault();
      selectResult(results[selectedIndex]);
    }
  };

  // Select result
  const selectResult = (result: SearchResult) => {
    onSelectDoc(result.doc.id);
    setIsOpen(false);
    setQuery('');
    setResults([]);
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={containerRef} className="relative">
      {/* Search trigger button */}
      <button
        onClick={() => {
          setIsOpen(true);
          loadIndex();
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="
          flex items-center gap-2 px-3 py-1.5
          bg-slate-800 border border-slate-700 rounded-md
          text-sm text-slate-400 hover:text-white hover:border-slate-600
          transition-colors w-64
        "
      >
        <Search className="w-4 h-4" />
        <span className="flex-1 text-left">Search docs...</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs bg-slate-900 rounded border border-slate-700">
          <span className="text-[10px]">⌘</span>K
        </kbd>
      </button>

      {/* Search modal */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-surface-darker border border-slate-700 rounded-lg shadow-xl z-50">
          {/* Input */}
          <div className="flex items-center gap-2 p-3 border-b border-slate-800">
            <Search className="w-4 h-4 text-slate-500" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search documentation..."
              className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
              autoComplete="off"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-slate-500 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-80 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading search index...</span>
              </div>
            ) : query.length < 2 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                Type at least 2 characters to search
              </div>
            ) : results.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-sm">
                No results found for "{query}"
              </div>
            ) : (
              <ul className="py-2">
                {results.map((result, index) => (
                  <li key={result.doc.id}>
                    <button
                      onClick={() => selectResult(result)}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`
                        w-full text-left px-3 py-2 flex items-start gap-3
                        transition-colors
                        ${index === selectedIndex ? 'bg-slate-800' : 'hover:bg-slate-800/50'}
                      `}
                    >
                      <FileText className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white flex items-center gap-2">
                          {result.doc.icon && <span>{result.doc.icon}</span>}
                          {result.doc.title}
                        </div>
                        {result.snippet && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                            {result.snippet}
                          </p>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-slate-800 text-xs text-slate-500">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>Esc Close</span>
          </div>
        </div>
      )}
    </div>
  );
}
