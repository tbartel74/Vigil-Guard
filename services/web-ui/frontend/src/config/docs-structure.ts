/**
 * Documentation Structure Configuration
 *
 * Contains only GitHub configuration.
 * Actual structure is fetched dynamically from GitHub API.
 */

import type { GitHubConfig } from '../types/help';

/** GitHub repository configuration for jsDelivr CDN */
export const GITHUB_CONFIG: GitHubConfig = {
  owner: 'tbartel74',
  repo: 'Vigil-Guard',
  // Using 'main' branch for jsDelivr Package API compatibility
  // jsDelivr package API only works with main/tags, not feature branches
  branch: 'main',
  basePath: 'docs',
};
