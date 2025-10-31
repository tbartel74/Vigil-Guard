#!/usr/bin/env node

/**
 * Sync Documentation Script
 *
 * Copies all documentation from /docs (single source of truth)
 * to services/web-ui/frontend/public/docs (UI consumed)
 *
 * Runs automatically before build via prebuild hook.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const SOURCE_DIR = path.join(REPO_ROOT, 'docs');
const TARGET_DIR = path.join(__dirname, '../public/docs');

console.log('📚 Documentation Sync');
console.log('====================');
console.log(`Source: ${SOURCE_DIR}`);
console.log(`Target: ${TARGET_DIR}\n`);

/**
 * Recursively copy directory
 */
function copyRecursive(src, dest) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    // Create directory if doesn't exist
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    // Copy all children
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      // Skip hidden files and system files
      if (entry.startsWith('.') || entry === 'node_modules') {
        continue;
      }

      copyRecursive(
        path.join(src, entry),
        path.join(dest, entry)
      );
    }
  } else {
    // Copy file and preserve timestamps
    fs.copyFileSync(src, dest);
    const srcStats = fs.statSync(src);
    fs.utimesSync(dest, srcStats.atime, srcStats.mtime);
    console.log(`  ✓ ${path.relative(TARGET_DIR, dest)}`);
  }
}

/**
 * Clean target directory (remove old files)
 */
function cleanTarget() {
  if (fs.existsSync(TARGET_DIR)) {
    const entries = fs.readdirSync(TARGET_DIR);
    for (const entry of entries) {
      // Skip pic/ directory (UI-specific assets)
      if (entry === 'pic') {
        continue;
      }

      const fullPath = path.join(TARGET_DIR, entry);
      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        fs.rmSync(fullPath, { recursive: true });
      } else {
        fs.unlinkSync(fullPath);
      }
    }
  }
}

// Main execution
try {
  // Validate source exists
  if (!fs.existsSync(SOURCE_DIR)) {
    // In Docker build, docs are already copied by Dockerfile COPY ./docs ./public/docs
    console.log('⚠️  Source directory not found (expected in Docker build)');
    console.log('✅ Assuming docs are already in place via Dockerfile COPY\n');
    process.exit(0);
  }

  // Clean old files
  console.log('🧹 Cleaning target directory...');
  cleanTarget();

  // Copy documentation
  console.log('\n📋 Copying documentation files:');
  copyRecursive(SOURCE_DIR, TARGET_DIR);

  // Count files
  const countFiles = (dir) => {
    let count = 0;
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        count += countFiles(fullPath);
      } else if (entry.endsWith('.md')) {
        count++;
      }
    }
    return count;
  };

  const fileCount = countFiles(TARGET_DIR);

  console.log(`\n✅ Sync complete: ${fileCount} markdown files copied`);

} catch (error) {
  console.error('\n❌ Sync failed:', error.message);
  process.exit(1);
}
