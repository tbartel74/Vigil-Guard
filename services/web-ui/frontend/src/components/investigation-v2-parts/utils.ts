/**
 * Utility functions for Investigation V2 components
 * Shared helpers for score display and formatting
 */

/**
 * Returns Tailwind color class based on threat score
 */
export function getScoreColor(score: number): string {
  if (score >= 85) return 'text-red-400';
  if (score >= 65) return 'text-orange-400';
  if (score >= 30) return 'text-yellow-400';
  return 'text-emerald-400';
}

/**
 * Returns Tailwind background class based on threat score
 */
export function getScoreBg(score: number): string {
  if (score >= 85) return 'bg-red-500/20';
  if (score >= 65) return 'bg-orange-500/20';
  if (score >= 30) return 'bg-yellow-500/20';
  return 'bg-emerald-500/20';
}

/**
 * Returns status badge styling classes
 */
export function getStatusClasses(status: string): string {
  switch (status) {
    case 'ALLOWED':
      return 'bg-emerald-500/20 text-emerald-400';
    case 'SANITIZED':
      return 'bg-yellow-500/20 text-yellow-400';
    default:
      return 'bg-red-500/20 text-red-400';
  }
}

/**
 * Format status for display (SANITIZED -> PII Redacted)
 */
export function formatStatus(status: string): string {
  return status === 'SANITIZED' ? 'PII Redacted' : status;
}
