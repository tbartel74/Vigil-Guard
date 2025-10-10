import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

// Documentation structure matching the docs/ directory
interface DocSection {
  id: string;
  title: string;
  file: string;
  category: string;
}

const docSections: DocSection[] = [
  {
    id: "overview",
    title: "Overview",
    file: "README",
    category: "Getting Started"
  },
  {
    id: "installation",
    title: "Installation Guide",
    file: "INSTALLATION",
    category: "Getting Started"
  },
  {
    id: "user-guide",
    title: "User Guide",
    file: "USER_GUIDE",
    category: "Guides"
  },
  {
    id: "configuration",
    title: "Configuration",
    file: "CONFIGURATION",
    category: "Guides"
  },
  {
    id: "authentication",
    title: "Authentication",
    file: "AUTHENTICATION",
    category: "Guides"
  },
  {
    id: "config-variables",
    title: "Config Variables",
    file: "CONFIG_VARIABLES",
    category: "Reference"
  },
  {
    id: "api",
    title: "API Reference",
    file: "API",
    category: "Reference"
  },
  {
    id: "grafana",
    title: "Grafana Setup",
    file: "GRAFANA_SETUP",
    category: "Advanced"
  },
  {
    id: "architecture",
    title: "Architecture",
    file: "architecture/architecture",
    category: "Advanced"
  },
];

// Group sections by category
const groupedSections = docSections.reduce((acc, section) => {
  if (!acc[section.category]) {
    acc[section.category] = [];
  }
  acc[section.category].push(section);
  return acc;
}, {} as Record<string, DocSection[]>);

const categoryOrder = ["Getting Started", "Guides", "Reference", "Advanced"];

export default function Documentation() {
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Load markdown content when section changes
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);

      try {
        const section = docSections.find((s) => s.id === activeSection);
        if (!section) {
          throw new Error("Section not found");
        }

        const response = await fetch(`/ui/docs/${section.file}.md`);

        if (!response.ok) {
          throw new Error(`Failed to load documentation: ${response.statusText}`);
        }

        const text = await response.text();
        setContent(text);
      } catch (err) {
        console.error("Error loading documentation:", err);
        setContent(`# Error Loading Documentation\n\nCould not load the requested documentation section.`);
      } finally {
        setLoading(false);
      }
    };

    loadContent();
    setSidebarOpen(false);
  }, [activeSection]);

  // Navigate to a section
  const navigateToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  // Scroll to heading
  const scrollToHeading = (headingId: string) => {
    const element = document.getElementById(headingId);
    if (element) {
      const yOffset = -80;
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const currentSection = docSections.find(s => s.id === activeSection);

  return (
    <div className="flex min-h-screen">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Vigil Guard Docs</h2>
            <p className="text-xs text-slate-500">{currentSection?.title}</p>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 text-slate-400 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {sidebarOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Left Sidebar - Navigation */}
      <aside className={`
        fixed lg:relative z-30 h-full w-64
        bg-slate-900/30 border-r border-slate-800 overflow-y-auto
        transform transition-transform duration-300 ease-in-out
        lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-6">
          {/* Logo/Title */}
          <div className="mb-8">
            <h2 className="text-sm font-semibold text-white mb-1">Documentation</h2>
            <p className="text-xs text-slate-500">Vigil Guard</p>
          </div>

          {/* Navigation */}
          <nav className="space-y-6">
            {categoryOrder.map((category) => {
              const sections = groupedSections[category] || [];
              if (sections.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 px-3">
                    {category}
                  </h3>
                  <ul className="space-y-1">
                    {sections.map((section) => (
                      <li key={section.id}>
                        <button
                          onClick={() => navigateToSection(section.id)}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                            activeSection === section.id
                              ? "bg-blue-500/10 text-blue-400 font-medium"
                              : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                          }`}
                        >
                          {section.title}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>

          {/* Quick Links */}
          <div className="mt-8 pt-6 border-t border-slate-800">
            <div className="space-y-2">
              <a
                href="https://github.com/tbartel74/Vigil-Guard"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white rounded-md hover:bg-slate-800/50 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </a>
              <a
                href="https://github.com/tbartel74/Vigil-Guard/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white rounded-md hover:bg-slate-800/50 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Report Issue
              </a>
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <main className="flex-1 min-w-0 pt-16 lg:pt-0">
        <div className="w-full px-6 sm:px-8 lg:px-12 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-400">Loading documentation...</p>
              </div>
            </div>
          ) : (
            <article>
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[
                  rehypeRaw,
                  rehypeSanitize,
                  rehypeSlug,
                  [rehypeAutolinkHeadings, { behavior: "wrap" }],
                ]}
                components={{
                  h1: ({ node, ...props }) => (
                    <h1 className="text-4xl font-bold text-white mb-4 mt-2" {...props} />
                  ),
                  h2: ({ node, ...props }) => (
                    <h2 className="text-3xl font-bold text-white mt-12 mb-4 pb-2 border-b border-slate-800" {...props} />
                  ),
                  h3: ({ node, ...props }) => (
                    <h3 className="text-2xl font-semibold text-white mt-10 mb-4" {...props} />
                  ),
                  h4: ({ node, ...props }) => (
                    <h4 className="text-xl font-semibold text-white mt-8 mb-3" {...props} />
                  ),
                  p: ({ node, ...props }) => (
                    <p className="text-slate-300 text-base leading-7 mb-6" {...props} />
                  ),
                  a: ({ node, href, ...props }: any) => {
                    const isInternal = href && (href.startsWith('#') || href.startsWith('/') || !href.startsWith('http'));

                    if (isInternal && href) {
                      return (
                        <a
                          href={href}
                          onClick={(e) => {
                            e.preventDefault();
                            if (href.startsWith('#')) {
                              const targetId = href.substring(1);
                              scrollToHeading(targetId);
                            } else if (href.endsWith('.md')) {
                              const docName = href.replace('.md', '').replace(/\.\//g, '');
                              const section = docSections.find(s =>
                                s.file === docName ||
                                s.file.endsWith('/' + docName) ||
                                s.id === docName.toLowerCase()
                              );
                              if (section) {
                                navigateToSection(section.id);
                              }
                            }
                          }}
                          className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                          {...props}
                        />
                      );
                    }

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
                  em: ({ node, ...props }) => (
                    <em className="text-slate-300 italic" {...props} />
                  ),
                  code: ({ node, inline, ...props }: any) =>
                    inline ? (
                      <code
                        className="text-pink-400 bg-slate-800/60 px-1.5 py-0.5 rounded font-mono text-sm"
                        {...props}
                      />
                    ) : (
                      <code
                        className="block text-slate-300 font-mono text-sm leading-6"
                        {...props}
                      />
                    ),
                  pre: ({ node, ...props }) => (
                    <pre
                      className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-6 overflow-x-auto"
                      {...props}
                    />
                  ),
                  ul: ({ node, ...props }) => (
                    <ul className="list-disc list-outside ml-5 text-slate-300 mb-6 space-y-2" {...props} />
                  ),
                  ol: ({ node, ...props }) => (
                    <ol className="list-decimal list-outside ml-5 text-slate-300 mb-6 space-y-2" {...props} />
                  ),
                  li: ({ node, ...props }) => (
                    <li className="text-slate-300 leading-7 pl-1" {...props} />
                  ),
                  blockquote: ({ node, ...props }) => (
                    <blockquote
                      className="border-l-4 border-blue-500/50 bg-blue-500/5 pl-4 pr-4 py-2 my-6 italic text-slate-400"
                      {...props}
                    />
                  ),
                  table: ({ node, ...props }) => (
                    <div className="my-6 overflow-x-auto">
                      <table className="w-full border-collapse border border-slate-800 rounded-lg overflow-hidden" {...props} />
                    </div>
                  ),
                  thead: ({ node, ...props }) => (
                    <thead className="bg-slate-800/50" {...props} />
                  ),
                  th: ({ node, ...props }) => (
                    <th
                      className="text-left text-slate-300 font-semibold px-4 py-3 text-sm border-b border-slate-700"
                      {...props}
                    />
                  ),
                  tbody: ({ node, ...props }) => (
                    <tbody className="bg-slate-900/30" {...props} />
                  ),
                  td: ({ node, ...props }) => (
                    <td
                      className="text-slate-300 px-4 py-3 text-sm border-b border-slate-800/50"
                      {...props}
                    />
                  ),
                  tr: ({ node, ...props }) => (
                    <tr className="hover:bg-slate-800/30 transition-colors" {...props} />
                  ),
                  hr: ({ node, ...props }) => (
                    <hr className="border-slate-800 my-8" {...props} />
                  ),
                  // Hide broken images (SVG badges from shields.io that don't load)
                  img: ({ node, src, alt, ...props }: any) => {
                    // Skip rendering badge images from shields.io
                    if (src && src.includes('shields.io')) {
                      return null;
                    }
                    return (
                      <img
                        src={src}
                        alt={alt || ''}
                        className="rounded-lg border border-slate-800 my-6 max-w-full h-auto"
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
          )}
        </div>
      </main>
    </div>
  );
}
