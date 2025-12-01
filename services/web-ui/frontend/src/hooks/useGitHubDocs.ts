/**
 * useGitHubDocs Hook
 *
 * React hook for fetching and caching documentation from GitHub
 * via jsDelivr CDN with session-level caching.
 * Dynamically fetches docs structure from GitHub API.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchMarkdownContent,
  extractHeadings,
  fetchDocsStructure,
  clearDocsStructureCache,
} from '../lib/github-docs';
import { GITHUB_CONFIG } from '../config/docs-structure';
import type { DocState, Heading, DocEntry, DocCategory, SearchIndexEntry } from '../types/help';

/** Session cache for loaded documents */
const docCache = new Map<string, { content: string; headings: Heading[] }>();

/** Search index (built on first search) */
let searchIndex: SearchIndexEntry[] | null = null;
let searchIndexPromise: Promise<SearchIndexEntry[]> | null = null;

export interface UseGitHubDocsOptions {
  /** Initial document ID or path to load */
  initialDoc?: string;
}

export interface UseGitHubDocsReturn extends DocState {
  /** Currently loaded document entry */
  currentDoc: DocEntry | null;
  /** Dynamically loaded categories */
  categories: DocCategory[];
  /** All docs from dynamic structure */
  allDocs: DocEntry[];
  /** Structure loading state */
  structureLoading: boolean;
  /** Structure loading error */
  structureError: string | null;
  /** Load a document by ID or path */
  loadDocument: (idOrPath: string) => Promise<void>;
  /** Reload current document (bypasses cache) */
  reload: () => Promise<void>;
  /** Get search index (lazy loads all docs) */
  getSearchIndex: () => Promise<SearchIndexEntry[]>;
  /** Clear all cached documents and structure */
  clearCache: () => void;
  /** Refresh docs structure from GitHub */
  refreshStructure: () => Promise<void>;
}

/**
 * Hook for fetching documentation from GitHub via jsDelivr
 *
 * @example
 * ```tsx
 * function HelpContent() {
 *   const { content, headings, loading, error, categories, loadDocument } = useGitHubDocs({
 *     initialDoc: 'readme'
 *   });
 *
 *   if (loading) return <Spinner />;
 *   if (error) return <Error message={error} />;
 *
 *   return <ReactMarkdown>{content}</ReactMarkdown>;
 * }
 * ```
 */
export function useGitHubDocs(options: UseGitHubDocsOptions = {}): UseGitHubDocsReturn {
  const { initialDoc } = options;
  const docsRef = GITHUB_CONFIG.branch;

  // Document content state
  const [state, setState] = useState<DocState>({
    loading: false,
    error: null,
    content: null,
    headings: [],
  });

  const [currentDoc, setCurrentDoc] = useState<DocEntry | null>(null);
  const currentPathRef = useRef<string | null>(null);

  // Dynamic structure state
  const [categories, setCategories] = useState<DocCategory[]>([]);
  const [allDocs, setAllDocs] = useState<DocEntry[]>([]);
  const [structureLoading, setStructureLoading] = useState(true);
  const [structureError, setStructureError] = useState<string | null>(null);

  /**
   * Find document by ID in dynamic structure
   */
  const findDoc = useCallback((idOrPath: string): DocEntry | undefined => {
    // Try by ID first
    let doc = allDocs.find(d => d.id === idOrPath);
    if (doc) return doc;

    // Try by path
    const normalizedPath = idOrPath.replace(/^\//, '').replace(/^docs\//, '');
    doc = allDocs.find(d =>
      d.path === normalizedPath ||
      d.path === idOrPath ||
      d.path.toLowerCase() === normalizedPath.toLowerCase()
    );

    return doc;
  }, [allDocs]);

  /**
   * Load a document by ID or path
   */
  const loadDocument = useCallback(async (idOrPath: string) => {
    // Find document entry in dynamic structure
    const doc = findDoc(idOrPath);

    if (!doc) {
      // If structure is loaded but doc not found, show error
      if (!structureLoading && allDocs.length > 0) {
        setState({
          loading: false,
          error: `Document not found: ${idOrPath}`,
          content: null,
          headings: [],
        });
        setCurrentDoc(null);
      }
      return;
    }

    const path = doc.path;
    currentPathRef.current = path;
    setCurrentDoc(doc);

    // Check cache first
    const cached = docCache.get(path);
    if (cached) {
      setState({
        loading: false,
        error: null,
        content: cached.content,
        headings: cached.headings,
      });
      return;
    }

    // Fetch from CDN
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const rawContent = await fetchMarkdownContent(path);

      // Check if path changed during fetch
      if (currentPathRef.current !== path) return;

      if (rawContent === null) {
        setState({
          loading: false,
          error: `Document not found: ${path}`,
          content: null,
          headings: [],
        });
        return;
      }

      const headings = extractHeadings(rawContent);

      // Cache result
      docCache.set(path, { content: rawContent, headings });

      setState({
        loading: false,
        error: null,
        content: rawContent,
        headings,
      });
    } catch (error) {
      // Check if path changed during fetch
      if (currentPathRef.current !== path) return;

      console.error('[Help] Load error:', error);
      const errorMsg = error instanceof Error
        ? `${error.message} (${path})`
        : `Failed to load document: ${path}`;

      setState({
        loading: false,
        error: errorMsg,
        content: null,
        headings: [],
      });
    }
  }, [findDoc, structureLoading, allDocs.length]);

  /**
   * Reload current document (bypasses cache)
   */
  const reload = useCallback(async () => {
    if (!currentPathRef.current) return;

    const path = currentPathRef.current;

    // Remove from cache
    docCache.delete(path);

    // Reload
    const doc = findDoc(path);
    if (doc) {
      await loadDocument(doc.id);
    }
  }, [loadDocument, findDoc]);

  /**
   * Get search index (lazy loads all documents)
   */
  const getSearchIndex = useCallback(async (): Promise<SearchIndexEntry[]> => {
    // Return cached index
    if (searchIndex) return searchIndex;

    // Return pending promise if already loading
    if (searchIndexPromise) return searchIndexPromise;

    // Build search index using dynamic structure
    searchIndexPromise = (async () => {
      const entries: SearchIndexEntry[] = [];

      // Fetch all documents in parallel
      const fetchPromises = allDocs.map(async (doc) => {
        try {
          // Check cache first
          const cached = docCache.get(doc.path);
          if (cached) {
            return { doc, content: cached.content };
          }

          const content = await fetchMarkdownContent(doc.path);
          if (content) {
            // Cache while we're at it
            const headings = extractHeadings(content);
            docCache.set(doc.path, { content, headings });
            return { doc, content };
          }
        } catch (error) {
          console.warn(`[Help] Failed to index ${doc.path}:`, error);
        }
        return null;
      });

      const results = await Promise.all(fetchPromises);

      for (const result of results) {
        if (result) {
          entries.push(result);
        }
      }

      searchIndex = entries;
      searchIndexPromise = null;
      return entries;
    })();

    return searchIndexPromise;
  }, [allDocs]);

  /**
   * Clear all cached documents and structure
   */
  const clearCache = useCallback(() => {
    docCache.clear();
    searchIndex = null;
    searchIndexPromise = null;
    clearDocsStructureCache();
  }, []);

  /**
   * Refresh docs structure from GitHub
   */
  const refreshStructure = useCallback(async () => {
    setStructureLoading(true);
    setStructureError(null);
    clearDocsStructureCache();

    try {
      const { categories: cats, allDocs: docs } = await fetchDocsStructure();
      setCategories(cats);
      setAllDocs(docs);
    } catch (error) {
      console.error('[Help] Failed to refresh structure:', error);
      setStructureError(
        error instanceof Error ? error.message : 'Failed to load documentation structure'
      );
    } finally {
      setStructureLoading(false);
    }
  }, []);

  // Load structure on mount or when docsRef changes
  useEffect(() => {
    let mounted = true;

    async function loadStructure() {
      try {
        const { categories: cats, allDocs: docs } = await fetchDocsStructure();
        if (!mounted) return;

        setCategories(cats);
        setAllDocs(docs);
        setStructureLoading(false);

        // Load initial document after structure is ready
        // Default to first doc (usually README) if no initial doc specified
        const docToLoad = initialDoc || (docs.length > 0 ? docs[0].id : null);
        if (docToLoad) {
          loadDocument(docToLoad);
        }
      } catch (error) {
        if (!mounted) return;

        console.error('[Help] Failed to load structure:', error);
        setStructureError(
          error instanceof Error ? error.message : 'Failed to load documentation structure'
        );
        setStructureLoading(false);
      }
    }

    loadStructure();

    return () => {
      mounted = false;
    };
  }, [initialDoc, docsRef]); // Reload when docs ref changes

  // Load document when initialDoc changes (after structure is ready)
  useEffect(() => {
    if (initialDoc && !structureLoading && allDocs.length > 0) {
      loadDocument(initialDoc);
    }
  }, [initialDoc, structureLoading, allDocs.length, loadDocument]);

  return {
    ...state,
    currentDoc,
    categories,
    allDocs,
    structureLoading,
    structureError,
    loadDocument,
    reload,
    getSearchIndex,
    clearCache,
    refreshStructure,
  };
}

/**
 * Preload documents into cache (for faster navigation)
 *
 * @param docs - Array of DocEntry to preload
 */
export async function preloadDocs(docs: DocEntry[]): Promise<void> {
  await Promise.all(
    docs.map(async (doc) => {
      if (docCache.has(doc.path)) return;

      try {
        const content = await fetchMarkdownContent(doc.path);
        if (content) {
          const headings = extractHeadings(content);
          docCache.set(doc.path, { content, headings });
        }
      } catch (error) {
        console.warn(`[Help] Failed to preload ${doc.path}:`, error);
      }
    })
  );
}
