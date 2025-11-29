/**
 * Help System Types
 *
 * Types for the new GitHub-based documentation system
 * that fetches docs directly from jsDelivr CDN.
 */

/** Single document entry in the help system */
export interface DocEntry {
  /** Unique identifier (e.g., "guides-dashboard") */
  id: string;
  /** Path in repo relative to docs/ (e.g., "guides/dashboard.md") */
  path: string;
  /** Display title */
  title: string;
  /** Category ID this doc belongs to */
  category: string;
  /** Optional emoji or icon name */
  icon?: string;
  /** Sort order within category */
  order?: number;
}

/** Category grouping documents */
export interface DocCategory {
  /** Category identifier */
  id: string;
  /** Display label */
  label: string;
  /** Lucide icon name */
  icon: string;
  /** Sort order */
  order: number;
  /** Documents in this category */
  docs: DocEntry[];
}

/** Heading extracted from markdown for ToC */
export interface Heading {
  /** Generated slug ID */
  id: string;
  /** Heading text */
  text: string;
  /** Heading level (h2, h3, h4) */
  level: 2 | 3 | 4;
}

/** Document fetch state */
export interface DocState {
  /** Loading indicator */
  loading: boolean;
  /** Error message if fetch failed */
  error: string | null;
  /** Raw markdown content */
  content: string | null;
  /** Extracted headings for ToC */
  headings: Heading[];
}

/** GitHub repository configuration */
export interface GitHubConfig {
  /** Repository owner */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch to fetch from */
  branch: string;
  /** Base path for docs in repo */
  basePath: string;
}

/** Search result from Fuse.js */
export interface SearchResult {
  /** Matched document */
  doc: DocEntry;
  /** Match details */
  matches: SearchMatch[];
  /** Fuse.js score (lower is better) */
  score: number;
}

/** Individual match in search result */
export interface SearchMatch {
  /** Field that matched */
  field: 'title' | 'content';
  /** Match indices */
  indices: [number, number][];
  /** Matched value */
  value: string;
}

/** Search index entry for Fuse.js */
export interface SearchIndexEntry {
  /** Document entry */
  doc: DocEntry;
  /** Full content for searching */
  content: string;
}
