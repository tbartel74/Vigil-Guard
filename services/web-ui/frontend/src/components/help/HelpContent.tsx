/**
 * HelpContent Component
 *
 * Renders markdown documentation with styled components.
 * Uses react-markdown with rehype plugins for security and features.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { RefreshCw, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import type { DocEntry } from '../../types/help';

interface HelpContentProps {
  /** Raw markdown content */
  content: string | null;
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** All documents (for resolving internal links) */
  allDocs?: DocEntry[];
  /** Callback to navigate to another document */
  onNavigate: (docId: string) => void;
  /** Callback to reload current document */
  onReload?: () => void;
}

/**
 * Scroll to heading element
 */
function scrollToHeading(headingId: string): void {
  const element = document.getElementById(headingId);
  if (element) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
      inline: 'nearest',
    });
  }
}

/**
 * Find document by path in allDocs
 */
function findDocByPath(allDocs: DocEntry[], path: string): DocEntry | undefined {
  const normalizedPath = path.replace(/^\//, '').replace(/^docs\//, '');
  return allDocs.find(d =>
    d.path === normalizedPath ||
    d.path === path ||
    d.path.toLowerCase() === normalizedPath.toLowerCase()
  );
}

export default function HelpContent({
  content,
  loading,
  error,
  allDocs = [],
  onNavigate,
  onReload,
}: HelpContentProps) {
  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">Loading documentation...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Failed to Load Document</h2>
        <p className="text-slate-400 mb-6 max-w-md">{error}</p>
        {onReload && (
          <Button variant="secondary" onClick={onReload}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        )}
      </div>
    );
  }

  // No content
  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-slate-400">No document selected</p>
      </div>
    );
  }

  return (
    <article className="prose prose-invert prose-slate max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeRaw,
          rehypeSanitize,
          rehypeSlug,
          [rehypeAutolinkHeadings, { behavior: 'wrap' }],
        ]}
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-3xl font-bold text-white mb-4 mt-2" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2
              className="text-2xl font-bold text-white mt-10 mb-4 pb-2 border-b border-slate-800"
              {...props}
            />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-xl font-semibold text-white mt-8 mb-3" {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className="text-lg font-semibold text-white mt-6 mb-2" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="text-slate-300 text-base leading-7 mb-4" {...props} />
          ),
          a: ({ node, href, ...props }: any) => {
            const isInternal =
              href && (href.startsWith('#') || href.startsWith('/') || !href.startsWith('http'));

            if (isInternal && href) {
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();

                    if (href.startsWith('#')) {
                      // Anchor link - scroll to heading
                      const targetId = href.substring(1);
                      scrollToHeading(targetId);
                    } else if (href.endsWith('.md')) {
                      // Markdown link - navigate to document
                      const cleanPath = href
                        .replace(/^docs\//, '')
                        .replace(/^\.\.\/.*?\//, '')
                        .replace(/^\.\//, '');

                      const doc = findDocByPath(allDocs, cleanPath);
                      if (doc) {
                        onNavigate(doc.id);
                      } else {
                        console.warn(`[Help] Document not found for link: ${href}`);
                      }
                    }
                  }}
                  className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                  {...props}
                />
              );
            }

            // External link
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline"
                {...props}
              />
            );
          },
          strong: ({ node, ...props }) => (
            <strong className="text-white font-semibold" {...props} />
          ),
          code: ({ node, inline, ...props }: any) =>
            inline ? (
              <code
                className="text-pink-400 bg-slate-800/60 px-1.5 py-0.5 rounded font-mono text-sm"
                {...props}
              />
            ) : (
              <code className="block text-slate-300 font-mono text-sm leading-6" {...props} />
            ),
          pre: ({ node, ...props }) => (
            <pre
              className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-4 overflow-x-auto"
              {...props}
            />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-outside ml-5 text-slate-300 mb-4 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol
              className="list-decimal list-outside ml-5 text-slate-300 mb-4 space-y-1"
              {...props}
            />
          ),
          li: ({ node, ...props }) => <li className="text-slate-300 leading-6 pl-1" {...props} />,
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-blue-500/50 bg-blue-500/5 pl-4 pr-4 py-2 my-4 italic text-slate-400"
              {...props}
            />
          ),
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto">
              <table
                className="w-full border-collapse border border-slate-800 rounded-lg overflow-hidden"
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => <thead className="bg-slate-800/50" {...props} />,
          th: ({ node, ...props }) => (
            <th
              className="text-left text-slate-300 font-semibold px-4 py-3 text-sm border-b border-slate-700"
              {...props}
            />
          ),
          tbody: ({ node, ...props }) => <tbody className="bg-slate-900/30" {...props} />,
          td: ({ node, ...props }) => (
            <td className="text-slate-300 px-4 py-3 text-sm border-b border-slate-800/50" {...props} />
          ),
          tr: ({ node, ...props }) => (
            <tr className="hover:bg-slate-800/30 transition-colors" {...props} />
          ),
          hr: ({ node, ...props }) => <hr className="border-slate-800 my-6" {...props} />,
          img: ({ node, src, alt, ...props }: any) => {
            // Hide shields.io badges
            if (src && src.includes('shields.io')) {
              return null;
            }
            return (
              <img
                src={src}
                alt={alt || ''}
                className="rounded-lg border border-slate-800 my-4 max-w-full h-auto"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
                {...props}
              />
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
