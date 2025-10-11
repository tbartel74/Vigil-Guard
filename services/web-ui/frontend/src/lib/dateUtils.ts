/**
 * Date utilities for timezone-aware formatting
 *
 * All timestamps from the backend are in UTC ISO 8601 format.
 * This utility converts them to the user's preferred timezone.
 */

/**
 * Format a UTC timestamp string to the user's timezone
 *
 * @param utcTimestamp - ISO 8601 timestamp string from backend (e.g., "2025-10-10T21:08:37")
 * @param userTimezone - User's preferred timezone (e.g., "Europe/Warsaw", "UTC")
 * @returns Formatted date string in the user's timezone
 */
export function formatTimestamp(utcTimestamp: string, userTimezone: string = 'UTC'): string {
  if (!utcTimestamp) return 'N/A';

  try {
    // Parse the UTC timestamp - add 'Z' suffix if not present to indicate UTC
    const timestamp = utcTimestamp.endsWith('Z') ? utcTimestamp : `${utcTimestamp}Z`;
    const date = new Date(timestamp);

    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.error('Invalid timestamp:', utcTimestamp);
      return utcTimestamp;
    }

    // Format using Intl.DateTimeFormat with user's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    return formatter.format(date);
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return utcTimestamp;
  }
}

/**
 * Format a UTC timestamp string for compact display (e.g., dropdown previews)
 *
 * @param utcTimestamp - ISO 8601 timestamp string from backend
 * @param userTimezone - User's preferred timezone
 * @returns Compact formatted date string (MM/DD/YYYY, HH:mm:ss)
 */
export function formatTimestampCompact(utcTimestamp: string, userTimezone: string = 'UTC'): string {
  if (!utcTimestamp) return 'N/A';

  try {
    const timestamp = utcTimestamp.endsWith('Z') ? utcTimestamp : `${utcTimestamp}Z`;
    const date = new Date(timestamp);

    if (isNaN(date.getTime())) {
      return utcTimestamp;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: userTimezone,
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });

    return formatter.format(date);
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return utcTimestamp;
  }
}
