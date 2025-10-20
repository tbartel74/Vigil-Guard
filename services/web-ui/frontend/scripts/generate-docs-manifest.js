#!/usr/bin/env node

/**
 * Documentation Manifest Generator
 *
 * Scans public/docs recursively and generates a manifest with metadata
 * for all .md files. This enables dynamic routing for any markdown file,
 * not just those in the curated docSections list.
 *
 * Output: src/generated/docs-manifest.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const DOCS_DIR = path.join(__dirname, '../public/docs');
const OUTPUT_DIR = path.join(__dirname, '../src/generated');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'docs-manifest.json');

console.log('📚 Documentation Manifest Generator');
console.log('===================================');
console.log(`Source: ${DOCS_DIR}`);
console.log(`Output: ${OUTPUT_FILE}\n`);

/**
 * Extract title from markdown content
 * Looks for first H1 (#) heading
 */
function extractTitle(content, filename) {
  // Try to find # Heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }

  // Fallback to filename without extension
  return path.basename(filename, '.md')
    .replace(/-/g, ' ')
    .replace(/_/g, ' ');
}

/**
 * Recursively scan directory for .md files
 */
function scanDirectory(dir, baseDir = dir) {
  const entries = [];

  const items = fs.readdirSync(dir);

  for (const item of items) {
    // Skip hidden files and pic directory
    if (item.startsWith('.') || item === 'pic') {
      continue;
    }

    const fullPath = path.join(dir, item);

    // Security: Prevent path traversal via symlinks
    const normalizedPath = path.normalize(fullPath);
    const normalizedBase = path.normalize(baseDir);
    if (!normalizedPath.startsWith(normalizedBase)) {
      console.warn(`⚠️  Skipping path outside base directory: ${fullPath}`);
      continue;
    }

    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      // Recursively scan subdirectories
      entries.push(...scanDirectory(fullPath, baseDir));
    } else if (item.endsWith('.md')) {
      // Process markdown file
      const relativePath = path.relative(baseDir, fullPath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      const title = extractTitle(content, item);

      // Compute category from directory structure
      const pathParts = relativePath.split(path.sep);
      const category = pathParts.length > 1
        ? pathParts[pathParts.length - 2]
        : 'root';

      entries.push({
        // File paths
        path: relativePath.replace(/\\/g, '/'), // Normalize to forward slashes
        file: path.basename(fullPath, '.md'),
        directory: path.dirname(relativePath).replace(/\\/g, '/'),

        // URL for fetching
        url: `/ui/docs/${relativePath.replace(/\\/g, '/')}`,

        // Metadata
        title,
        category,

        // Stats
        size: stats.size,
        modified: stats.mtime.toISOString(),
      });

      console.log(`  ✓ ${relativePath} → "${title}"`);
    }
  }

  return entries;
}

// Main execution
try {
  // Validate source exists
  if (!fs.existsSync(DOCS_DIR)) {
    throw new Error(`Docs directory not found: ${DOCS_DIR}`);
  }

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Scan documentation
  console.log('🔍 Scanning documentation files:\n');
  const manifest = scanDirectory(DOCS_DIR);

  // Sort by path for deterministic output
  manifest.sort((a, b) => a.path.localeCompare(b.path));

  // Write manifest
  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify({
      generated: new Date().toISOString(),
      count: manifest.length,
      documents: manifest
    }, null, 2)
  );

  console.log(`\n✅ Manifest generated: ${manifest.length} documents`);
  console.log(`📄 Output: ${OUTPUT_FILE}`);

} catch (error) {
  console.error('\n❌ Generation failed:', error.message);
  process.exit(1);
}
