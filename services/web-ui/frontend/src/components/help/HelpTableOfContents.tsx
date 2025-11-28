/**
 * HelpTableOfContents Component
 *
 * Sticky table of contents showing headings from current document.
 */

import React, { useEffect, useState } from 'react';
import { List } from 'lucide-react';
import type { Heading } from '../../types/help';

interface HelpTableOfContentsProps {
  /** Headings extracted from document */
  headings: Heading[];
  /** Class name for container */
  className?: string;
}

export default function HelpTableOfContents({ headings, className = '' }: HelpTableOfContentsProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Track which heading is in view
  useEffect(() => {
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first visible heading
        const visible = entries.find((entry) => entry.isIntersecting);
        if (visible) {
          setActiveId(visible.target.id);
        }
      },
      {
        rootMargin: '-80px 0px -80% 0px',
        threshold: 0,
      }
    );

    // Observe all heading elements
    headings.forEach((heading) => {
      const element = document.getElementById(heading.id);
      if (element) {
        observer.observe(element);
      }
    });

    return () => observer.disconnect();
  }, [headings]);

  // Scroll to heading
  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      setActiveId(id);
    }
  };

  // Don't render if no headings
  if (headings.length === 0) {
    return null;
  }

  return (
    <aside className={`hidden xl:block ${className}`}>
      <div className="sticky top-6">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <List className="w-3.5 h-3.5" />
          On This Page
        </h4>

        <nav className="space-y-1">
          {headings.map((heading) => (
            <button
              key={heading.id}
              onClick={() => scrollToHeading(heading.id)}
              className={`
                block w-full text-left text-sm py-1 transition-colors
                ${heading.level === 2 ? 'pl-0' : ''}
                ${heading.level === 3 ? 'pl-3' : ''}
                ${heading.level === 4 ? 'pl-6' : ''}
                ${
                  activeId === heading.id
                    ? 'text-blue-400 font-medium'
                    : 'text-slate-500 hover:text-slate-300'
                }
              `}
            >
              <span className="line-clamp-2">{heading.text}</span>
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}
