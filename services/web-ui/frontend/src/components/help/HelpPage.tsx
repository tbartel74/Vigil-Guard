/**
 * HelpPage Component
 *
 * Main documentation page with 3-column layout:
 * - Left: Navigation sidebar
 * - Center: Document content
 * - Right: Table of Contents
 *
 * Fetches documentation directly from GitHub via jsDelivr CDN.
 * Navigation structure is dynamically loaded from GitHub API.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useGitHubDocs } from '../../hooks/useGitHubDocs';
import HelpSidebar from './HelpSidebar';
import HelpContent from './HelpContent';
import HelpTableOfContents from './HelpTableOfContents';
import HelpBreadcrumb from './HelpBreadcrumb';
import HelpNavigation from './HelpNavigation';
import HelpSearch from './HelpSearch';
import ScrollArea from '../ui/ScrollArea';

export default function HelpPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Get initial doc from URL
  const docParam = searchParams.get('doc');

  // Fetch documentation with dynamic structure
  const {
    content,
    headings,
    loading,
    error,
    currentDoc,
    categories,
    allDocs,
    structureLoading,
    structureError,
    loadDocument,
    reload,
    getSearchIndex,
    refreshStructure,
  } = useGitHubDocs({ initialDoc: docParam || undefined });

  // Navigate to document
  const handleNavigate = useCallback(
    (docId: string) => {
      // Find doc in dynamic structure
      const doc = allDocs.find(d => d.id === docId);
      if (doc) {
        // Update URL
        setSearchParams({ doc: docId });
        // Load document
        loadDocument(docId);
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [loadDocument, setSearchParams, allDocs]
  );

  // Navigate home (first doc)
  const handleNavigateHome = useCallback(() => {
    if (allDocs.length > 0) {
      handleNavigate(allDocs[0].id);
    }
  }, [handleNavigate, allDocs]);

  // Handle URL changes (back/forward navigation)
  useEffect(() => {
    const docParam = searchParams.get('doc');
    if (docParam && docParam !== currentDoc?.id && !structureLoading) {
      loadDocument(docParam);
    }
  }, [searchParams, currentDoc?.id, loadDocument, structureLoading]);

  return (
    <div className="flex h-screen bg-surface-base text-slate-100">
      {/* Sidebar */}
      <HelpSidebar
        activeDocId={currentDoc?.id || null}
        categories={categories}
        structureLoading={structureLoading}
        structureError={structureError}
        onSelectDoc={handleNavigate}
        onRefresh={refreshStructure}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3 bg-surface-darker">
          <div className="flex items-center gap-3">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-md hover:bg-slate-800"
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* Search */}
            <HelpSearch
              onSelectDoc={handleNavigate}
              getSearchIndex={getSearchIndex}
            />
          </div>

          {/* Version badge */}
          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">v2.0.0</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Document content */}
          <ScrollArea className="flex-1">
            <div className="max-w-4xl mx-auto px-6 py-8">
              {/* Breadcrumb */}
              <HelpBreadcrumb
                currentDoc={currentDoc}
                categories={categories}
                onNavigateHome={handleNavigateHome}
              />

              {/* Document title (from metadata, not from markdown) */}
              {currentDoc && !loading && content && (
                <div className="mb-6">
                  <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    {currentDoc.icon && <span className="text-4xl">{currentDoc.icon}</span>}
                    {currentDoc.title}
                  </h1>
                </div>
              )}

              {/* Markdown content */}
              <HelpContent
                content={content}
                loading={loading || structureLoading}
                error={error || structureError}
                allDocs={allDocs}
                onNavigate={handleNavigate}
                onReload={reload}
              />

              {/* Prev/Next navigation */}
              {currentDoc && !loading && !error && (
                <HelpNavigation
                  currentDocId={currentDoc.id}
                  allDocs={allDocs}
                  onNavigate={handleNavigate}
                />
              )}
            </div>
          </ScrollArea>

          {/* Table of Contents */}
          <HelpTableOfContents headings={headings} className="w-56 p-6 border-l border-slate-800" />
        </div>
      </main>
    </div>
  );
}
