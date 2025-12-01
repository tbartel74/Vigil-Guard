/**
 * GitHub Documentation Fetcher
 *
 * Utilities for fetching markdown documentation from GitHub
 * via jsDelivr CDN with caching support.
 * Dynamically discovers docs structure from GitHub API.
 */

import { GITHUB_CONFIG } from '../config/docs-structure';
import type { GitHubConfig, Heading, DocEntry, DocCategory } from '../types/help';

/** GitHub API response types */
interface GitHubFileEntry {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

/** Cached docs structure */
let cachedStructure: { categories: DocCategory[]; allDocs: DocEntry[] } | null = null;

/**
 * Build jsDelivr CDN URL for a markdown file
 *
 * @example
 * buildJsDelivrUrl('README.md')
 * // => 'https://cdn.jsdelivr.net/gh/tbartel74/Vigil-Guard@main/docs/README.md'
 */
export function buildJsDelivrUrl(path: string, config: GitHubConfig = GITHUB_CONFIG): string {
  const cleanPath = path.replace(/^\//, '').replace(/^docs\//, '');
  return `https://cdn.jsdelivr.net/gh/${config.owner}/${config.repo}@${config.branch}/${config.basePath}/${cleanPath}`;
}

/**
 * Fetch markdown content from jsDelivr CDN
 *
 * @param path - Path to markdown file relative to docs/
 * @returns Raw markdown content or null if not found
 * @throws Error on network or server errors (except 404)
 */
export async function fetchMarkdownContent(path: string): Promise<string | null> {
  const url = buildJsDelivrUrl(path);

  console.log(`[Help] Fetching document: ${path}`);
  console.log(`[Help] Full URL: ${url}`);

  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/plain, text/markdown',
      },
      mode: 'cors', // Explicit CORS mode for CDN
      // No credentials needed for public CDN
    });

    console.log(`[Help] Response status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      if (response.status === 404) {
        console.warn(`[Help] Document not found: ${path}`);
        return null;
      }
      throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
    }

    const content = await response.text();
    console.log(`[Help] Fetched ${content.length} bytes for ${path}`);
    return content;
  } catch (error) {
    console.error(`[Help] Error fetching ${path}:`, error);
    if (error instanceof TypeError) {
      console.error(`[Help] Network error - possible CORS issue or network problem`);
    }
    throw error;
  }
}

/**
 * Extract headings from markdown content for Table of Contents
 *
 * Only extracts h2, h3, h4 headings (level 2-4)
 *
 * @param markdown - Raw markdown content
 * @returns Array of headings with id, text, and level
 */
export function extractHeadings(markdown: string): Heading[] {
  const headingRegex = /^(#{2,4})\s+(.+)$/gm;
  const headings: Heading[] = [];

  let match;
  while ((match = headingRegex.exec(markdown)) !== null) {
    const level = match[1].length as 2 | 3 | 4;
    const text = match[2].trim()
      // Remove markdown formatting
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`(.+?)`/g, '$1')
      .replace(/\[(.+?)\]\(.+?\)/g, '$1');

    // Generate slug ID matching rehype-slug
    const id = text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    headings.push({ id, text, level });
  }

  return headings;
}

/**
 * Extract first paragraph from markdown for search preview
 *
 * @param markdown - Raw markdown content
 * @returns First meaningful paragraph or empty string
 */
export function extractFirstParagraph(markdown: string): string {
  // Remove frontmatter if present
  const contentWithoutFrontmatter = markdown.replace(/^---[\s\S]*?---\n*/m, '');

  // Remove headings and find first paragraph
  const lines = contentWithoutFrontmatter.split('\n');
  const paragraphLines: string[] = [];
  let inCodeBlock = false;

  for (const line of lines) {
    // Track code blocks
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    // Skip headings, lists, blockquotes, empty lines at start
    if (line.startsWith('#') || line.startsWith('-') || line.startsWith('>') || line.startsWith('*')) {
      if (paragraphLines.length > 0) break;
      continue;
    }

    const trimmed = line.trim();
    if (trimmed === '') {
      if (paragraphLines.length > 0) break;
      continue;
    }

    paragraphLines.push(trimmed);
  }

  const paragraph = paragraphLines.join(' ')
    // Remove markdown formatting
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1');

  return paragraph.length > 200 ? paragraph.substring(0, 200) + '...' : paragraph;
}

/**
 * Preload multiple documents in parallel
 *
 * @param paths - Array of document paths to preload
 * @returns Map of path to content (excludes failed fetches)
 */
export async function preloadDocuments(paths: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  const fetchPromises = paths.map(async (path) => {
    try {
      const content = await fetchMarkdownContent(path);
      if (content) {
        results.set(path, content);
      }
    } catch (error) {
      console.warn(`[Help] Failed to preload ${path}:`, error);
    }
  });

  await Promise.all(fetchPromises);
  return results;
}

/** jsDelivr file entry from package API */
interface JsDelivrFile {
  name: string;
  hash: string;
  size: number;
}

/**
 * Fetch docs structure dynamically from jsDelivr package API
 *
 * Uses jsDelivr's package API to list all files in the docs directory.
 * This avoids GitHub API rate limits (60/hour for unauthenticated).
 */
export async function fetchDocsStructure(
  config: GitHubConfig = GITHUB_CONFIG
): Promise<{ categories: DocCategory[]; allDocs: DocEntry[] }> {
  // Return cached structure if available
  if (cachedStructure) {
    console.log('[Help] Using cached docs structure');
    return cachedStructure;
  }

  console.log('[Help] Fetching docs structure from jsDelivr...');

  // Use jsDelivr package API - note: only works with tagged versions or 'main'
  // For feature branches, we'll need to fallback to a hardcoded structure
  const apiUrl = `https://data.jsdelivr.com/v1/packages/gh/${config.owner}/${config.repo}@${config.branch}?structure=flat`;

  try {
    const response = await fetch(apiUrl, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // jsDelivr might not support this branch - use fallback structure
      console.warn(`[Help] jsDelivr API returned ${response.status}, using fallback structure`);
      return buildFallbackStructure();
    }

    const data = await response.json();
    const files: JsDelivrFile[] = data.files || [];

    // Filter only markdown files in docs/
    const docFiles = files.filter(f =>
      f.name.startsWith('/docs/') && f.name.endsWith('.md')
    );

    console.log(`[Help] Found ${docFiles.length} markdown files in docs/`);

    // Build structure from file paths
    const categories: DocCategory[] = [];
    const allDocs: DocEntry[] = [];

    // Group files by directory
    const byDir = new Map<string, JsDelivrFile[]>();
    for (const file of docFiles) {
      // /docs/README.md -> ''
      // /docs/guides/dashboard.md -> 'guides'
      const relativePath = file.name.replace('/docs/', '');
      const parts = relativePath.split('/');
      const dir = parts.length > 1 ? parts[0] : '';

      if (!byDir.has(dir)) {
        byDir.set(dir, []);
      }
      byDir.get(dir)!.push(file);
    }

    // Root files go into "Overview" category
    const rootFiles = byDir.get('') || [];
    if (rootFiles.length > 0) {
      const overviewDocs = rootFiles.map((file, index) => {
        const doc = jsDelivrFileToDocEntry(file, 'overview', index + 1);
        allDocs.push(doc);
        return doc;
      });

      categories.push({
        id: 'overview',
        label: 'Overview',
        icon: 'FileText',
        order: 0,
        docs: overviewDocs,
      });
    }

    // Process subdirectories
    let dirIndex = 1;
    for (const [dir, files] of byDir.entries()) {
      if (dir === '') continue; // Skip root files, already processed

      const categoryDocs = files.map((file, fileIndex) => {
        const doc = jsDelivrFileToDocEntry(file, dir, fileIndex + 1);
        return doc;
      });

      categories.push({
        id: dir,
        label: formatCategoryLabel(dir),
        icon: getCategoryIcon(dir),
        order: dirIndex++,
        docs: categoryDocs,
      });

      allDocs.push(...categoryDocs);
    }

    console.log(`[Help] Built structure: ${categories.length} categories, ${allDocs.length} docs`);

    // Cache the result
    cachedStructure = { categories, allDocs };
    return cachedStructure;
  } catch (error) {
    console.error('[Help] Failed to fetch docs structure:', error);
    // Try fallback
    console.log('[Help] Using fallback structure');
    return buildFallbackStructure();
  }
}

/**
 * Convert jsDelivr file entry to DocEntry
 */
function jsDelivrFileToDocEntry(file: JsDelivrFile, category: string, order: number): DocEntry {
  // /docs/guides/dashboard.md -> guides/dashboard.md
  const path = file.name.replace('/docs/', '');
  const filename = path.split('/').pop() || '';
  const name = filename.replace(/\.md$/, '');

  const title = formatDocTitle(name);
  const id = path
    .replace(/\.md$/, '')
    .replace(/\//g, '-')
    .toLowerCase();

  return {
    id,
    path,
    title,
    category,
    icon: getDocIcon(name),
    order,
  };
}

/**
 * Fallback structure when jsDelivr API is not available
 * (e.g., for feature branches not yet on main)
 */
function buildFallbackStructure(): { categories: DocCategory[]; allDocs: DocEntry[] } {
  console.log('[Help] Building fallback docs structure');

  // Minimal fallback - just README
  const allDocs: DocEntry[] = [
    { id: 'readme', path: 'README.md', title: 'Overview', category: 'overview', icon: '📘', order: 1 },
    { id: 'architecture', path: 'ARCHITECTURE.md', title: 'Architecture', category: 'overview', icon: '🏛️', order: 2 },
    { id: 'api', path: 'API.md', title: 'API Reference', category: 'overview', icon: '🔌', order: 3 },
    { id: 'security', path: 'SECURITY.md', title: 'Security', category: 'overview', icon: '🛡️', order: 4 },
    { id: 'troubleshooting', path: 'TROUBLESHOOTING.md', title: 'Troubleshooting', category: 'overview', icon: '🔧', order: 5 },
  ];

  const categories: DocCategory[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: 'FileText',
      order: 0,
      docs: allDocs,
    },
  ];

  cachedStructure = { categories, allDocs };
  return cachedStructure;
}

/**
 * Convert GitHub file entry to DocEntry
 */
function fileToDocEntry(file: GitHubFileEntry, category: string, order: number): DocEntry {
  // Remove docs/ prefix and .md extension for path
  const path = file.path.replace(/^docs\//, '');
  const name = file.name.replace(/\.md$/, '');

  // Generate readable title from filename
  const title = formatDocTitle(name);

  // Generate unique ID from path
  const id = path
    .replace(/\.md$/, '')
    .replace(/\//g, '-')
    .toLowerCase();

  return {
    id,
    path,
    title,
    category,
    icon: getDocIcon(name),
    order,
  };
}

/**
 * Format filename to readable title
 */
function formatDocTitle(filename: string): string {
  // Handle README specially
  if (filename.toLowerCase() === 'readme') {
    return 'Overview';
  }

  // Convert SCREAMING_CASE or kebab-case to Title Case
  return filename
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/Pii/g, 'PII')
    .replace(/Api/g, 'API')
    .replace(/Ci /g, 'CI ')
    .replace(/Cd/g, 'CD')
    .replace(/Wcag/g, 'WCAG');
}

/**
 * Format directory name to category label
 */
function formatCategoryLabel(dirname: string): string {
  return dirname
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/Api/g, 'API')
    .replace(/Pii/g, 'PII');
}

/**
 * Get icon for category
 */
function getCategoryIcon(dirname: string): string {
  const icons: Record<string, string> = {
    'guides': 'BookOpen',
    'config': 'Settings',
    'api': 'Code',
    'security': 'Shield',
    'operations': 'Server',
    'plugin': 'Puzzle',
    'overview': 'Rocket',
    'services': 'Layers',
    'tests': 'CheckSquare',
  };
  return icons[dirname.toLowerCase()] || 'Folder';
}

/**
 * Get emoji icon for document
 */
function getDocIcon(filename: string): string {
  const lower = filename.toLowerCase();
  const icons: Record<string, string> = {
    'readme': '📘',
    'quickstart': '🚀',
    'installation': '📦',
    'authentication': '🔐',
    'security': '🛡️',
    'api': '🔌',
    'architecture': '🏛️',
    'troubleshooting': '🔧',
    'accessibility': '♿',
    'grafana': '📊',
    'clickhouse': '🗄️',
    'docker': '🐳',
    'webhook': '🔗',
    'pii': '🔒',
    'dashboard': '📊',
    'investigation': '🔍',
    'configuration': '⚙️',
    'administration': '👥',
    'settings': '🔧',
    'plugin': '🧩',
    'browser': '🌐',
  };

  // Find matching icon
  for (const [key, icon] of Object.entries(icons)) {
    if (lower.includes(key)) return icon;
  }

  return '📄';
}

/**
 * Clear cached structure (for refresh)
 */
export function clearDocsStructureCache(): void {
  cachedStructure = null;
  console.log('[Help] Docs structure cache cleared');
}
