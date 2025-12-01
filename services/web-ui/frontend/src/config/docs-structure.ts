/**
 * Documentation Structure Configuration
 *
 * Contains only GitHub configuration.
 * Actual structure is fetched dynamically from GitHub API.
 */

import type { GitHubConfig } from '../types/help';

/** GitHub repository configuration for jsDelivr CDN */
const DOCS_REF = import.meta.env.VITE_DOCS_REF || 'main';

export const GITHUB_CONFIG: GitHubConfig = {
  owner: 'tbartel74',
  repo: 'Vigil-Guard',
  // Use versioned ref (commit SHA/tag). Default: main.
  branch: DOCS_REF,
  basePath: 'docs',
};
