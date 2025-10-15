import { useEffect, useState } from 'react';

interface LiveRegionProps {
  message: string;
  level?: 'polite' | 'assertive';
}

/**
 * LiveRegion component for screen reader announcements
 *
 * Announces dynamic content changes to screen readers without visually interrupting the user.
 * Used for status messages, form validation, async updates, etc.
 *
 * @param message - The message to announce to screen readers
 * @param level - 'polite' (default) waits for silence, 'assertive' interrupts immediately
 *
 * @example
 * // Polite announcement (waits for user to finish reading)
 * <LiveRegion message="Configuration saved successfully" />
 *
 * @example
 * // Assertive announcement (interrupts immediately for critical errors)
 * <LiveRegion message="Connection lost" level="assertive" />
 */
export function LiveRegion({ message, level = 'polite' }: LiveRegionProps) {
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    // Update announcement to trigger screen reader
    setAnnouncement(message);

    // Clear after announcement (prevents re-reading on unmount)
    const timer = setTimeout(() => setAnnouncement(''), 1000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <div
      role={level === 'assertive' ? 'alert' : 'status'}
      aria-live={level}
      aria-atomic="true"
      className="sr-only"
    >
      {announcement}
    </div>
  );
}
