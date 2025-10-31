import React, { useState, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import { BookOpen, HelpCircle, Search, ArrowRight, X } from "lucide-react";
import Fuse from "fuse.js";
import { Card, CardHeader, CardBody } from "./ui/Card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/Tabs";
import Input from "./ui/Input";
import Button from "./ui/Button";
import ScrollArea from "./ui/ScrollArea";
import docsManifest from "../generated/docs-manifest.json";
import type { DocsManifest } from "../types/docs-manifest";

// Documentation version and build info
const DOC_VERSION = "1.6.10";
const BUILD_DATE = "2025-10-31";

// Documentation structure matching the docs/ directory
interface DocSection {
  id: string;
  title: string;
  file: string;
  category: string;
  icon?: string;
}

interface DocContent {
  section: DocSection;
  content: string;
}

interface SearchResult {
  section: DocSection;
  matches: { value: string; indices: readonly [number, number][] }[];
}

const docSections: DocSection[] = [
  // Getting Started
  { id: "overview", title: "Overview", file: "README", category: "Getting Started", icon: "📘" },
  { id: "installation", title: "Installation", file: "INSTALLATION", category: "Getting Started", icon: "⚙️" },
  { id: "user-guide", title: "User Guide", file: "USER_GUIDE", category: "Getting Started", icon: "📖" },

  // Configuration
  { id: "configuration", title: "Configuration", file: "CONFIGURATION", category: "Configuration", icon: "🧠" },
  { id: "config-variables", title: "Config Variables", file: "CONFIG_VARIABLES", category: "Configuration", icon: "📋" },

  // Security & API
  { id: "authentication", title: "Authentication & Users", file: "AUTHENTICATION", category: "Security & API", icon: "🔐" },
  { id: "api", title: "API Reference", file: "API", category: "Security & API", icon: "🔌" },
  { id: "security", title: "Security Guide", file: "SECURITY", category: "Security & API", icon: "🛡️" },

  // Browser Extension
  { id: "browser-extension", title: "Browser Extension Overview", file: "plugin/BROWSER_EXTENSION", category: "Browser Extension", icon: "🧩" },
  { id: "plugin-quick-start", title: "Quick Start Guide", file: "plugin/QUICK_START", category: "Browser Extension", icon: "🚀" },
  { id: "plugin-architecture", title: "Technical Architecture", file: "plugin/HYBRID_ARCHITECTURE", category: "Browser Extension", icon: "🏗️" },

  // Advanced
  { id: "detection-categories", title: "Detection Categories", file: "DETECTION_CATEGORIES", category: "Advanced", icon: "🎯" },
  { id: "grafana-setup", title: "Grafana Setup", file: "GRAFANA_SETUP", category: "Advanced", icon: "📊" },
  { id: "clickhouse-retention", title: "Data Retention Policy", file: "CLICKHOUSE_RETENTION", category: "Advanced", icon: "🗄️" },
  { id: "accessibility", title: "Accessibility (WCAG 2.1)", file: "ACCESSIBILITY", category: "Advanced", icon: "♿" },
];

// Group sections by category
const groupedSections = docSections.reduce((acc, section) => {
  if (!acc[section.category]) {
    acc[section.category] = [];
  }
  acc[section.category].push(section);
  return acc;
}, {} as Record<string, DocSection[]>);

const categoryOrder = ["Getting Started", "Configuration", "Security & API", "Browser Extension", "Advanced"];

// Map categories to tab values
const categoryToTab: Record<string, string> = {
  "Getting Started": "getting-started",
  "Configuration": "configuration",
  "Security & API": "security-api",
  "Browser Extension": "browser-extension",
  "Advanced": "advanced"
};

const tabToCategory: Record<string, string> = {
  "getting-started": "Getting Started",
  "configuration": "Configuration",
  "security-api": "Security & API",
  "browser-extension": "Browser Extension",
  "advanced": "Advanced"
};

export default function Documentation() {
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [activeTab, setActiveTab] = useState<string>("getting-started");
  const [content, setContent] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [allDocs, setAllDocs] = useState<DocContent[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchActive, setSearchActive] = useState<boolean>(false);
  const [externalDoc, setExternalDoc] = useState<{ title: string; path: string } | null>(null);

  // Markdown cache - stable reference across renders
  const markdownCache = useRef<Map<string, string>>(new Map()).current;

  // Type-safe manifest with runtime validation
  const typedManifest = docsManifest as DocsManifest;

  // Load all documentation on mount for search indexing (parallel fetch)
  useEffect(() => {
    const loadAllDocs = async () => {
      // Fetch all documents in parallel instead of sequentially
      const fetchPromises = docSections.map(async (section) => {
        try {
          const response = await fetch(`/ui/docs/${section.file}.md`);
          if (response.ok) {
            const text = await response.text();
            // Cache the markdown content
            markdownCache.set(section.file, text);
            return { section, content: text };
          }
        } catch (err) {
          console.error(`Error loading ${section.file}:`, err);
        }
        return null;
      });

      // Wait for all fetches to complete
      const results = await Promise.all(fetchPromises);
      const docs = results.filter((doc): doc is DocContent => doc !== null);

      setAllDocs(docs);
    };

    loadAllDocs();
  }, []); // Run only once on mount

  // Initialize Fuse search
  const fuse = useMemo(() => {
    if (allDocs.length === 0) return null;

    return new Fuse(allDocs, {
      keys: [
        { name: 'section.title', weight: 2 },
        { name: 'content', weight: 1 }
      ],
      threshold: 0.3,
      includeMatches: true,
      minMatchCharLength: 3,
      ignoreLocation: true,
    });
  }, [allDocs]);

  // Handle search
  const handleSearch = () => {
    if (!fuse || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchActive(false);
      return;
    }

    const results = fuse.search(searchQuery);
    const formattedResults: SearchResult[] = results.map(result => ({
      section: result.item.section,
      matches: result.matches?.map(m => ({
        value: m.value || '',
        indices: m.indices || []
      })) || []
    }));

    setSearchResults(formattedResults);
    setSearchActive(true);
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSearchActive(false);
  };

  // Load markdown content when section changes (with cache)
  useEffect(() => {
    const loadContent = async () => {
      setLoading(true);

      try {
        const section = docSections.find((s) => s.id === activeSection);
        if (!section) {
          throw new Error("Section not found");
        }

        // Check cache first to avoid redundant fetches
        const cachedContent = markdownCache.get(section.file);
        if (cachedContent) {
          setContent(cachedContent);
          setLoading(false);
          return;
        }

        // Fetch if not in cache
        const response = await fetch(`/ui/docs/${section.file}.md`);

        if (!response.ok) {
          throw new Error(`Failed to load documentation: ${response.statusText}`);
        }

        const text = await response.text();
        // Update cache
        markdownCache.set(section.file, text);
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
  }, [activeSection]); // markdownCache has stable reference via useRef

  // Navigate to a section
  const navigateToSection = (sectionId: string) => {
    const section = docSections.find(s => s.id === sectionId);
    if (section) {
      setActiveSection(sectionId);
      setActiveTab(categoryToTab[section.category]);
      setExternalDoc(null); // Clear external doc when navigating to curated section
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  };

  // Load external document from manifest (with cache)
  const loadExternalDoc = async (url: string, title: string, path: string) => {
    setLoading(true);
    try {
      // Check cache first
      const cachedContent = markdownCache.get(path);
      if (cachedContent) {
        setContent(cachedContent);
        setExternalDoc({ title, path });
        setActiveSection('external-document');
        setSidebarOpen(false);
        window.scrollTo({ top: 0, behavior: 'auto' });
        setLoading(false);
        return;
      }

      // Fetch if not cached
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load document: ${response.statusText}`);
      }
      const text = await response.text();

      // Update cache
      markdownCache.set(path, text);

      setContent(text);
      setExternalDoc({ title, path });
      setActiveSection('external-document'); // Special marker for external docs
      setSidebarOpen(false);
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
      console.error('[Documentation] Error loading external document:', err);
      setContent(`# Error Loading Document\n\nCould not load **${path}**\n\nPlease verify the file exists.`);
    } finally {
      setLoading(false);
    }
  };

  // Scroll to heading (using scrollIntoView for nested scroll containers)
  const scrollToHeading = (headingId: string) => {
    const element = document.getElementById(headingId);
    if (element) {
      // scrollIntoView automatically finds the nearest scrollable ancestor (ScrollArea)
      // block: 'start' scrolls element to the top of the visible area
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    }
  };

  const currentSection = docSections.find(s => s.id === activeSection);
  const currentCategory = currentSection?.category || "Getting Started";

  return (
    <div className="flex h-screen bg-surface-base text-slate-100">
      {/* Sidebar */}
      <aside className={`
        fixed lg:relative z-30 h-full w-64
        bg-surface-darker border-r border-slate-800 overflow-y-auto
        transform transition-transform duration-300 ease-in-out
        lg:transform-none
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-4 flex flex-col gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-400" /> Docs Center
          </h2>

          {/* Mobile search - visible only on small screens */}
          <div className="lg:hidden">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search docs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full text-sm pl-10 pr-8"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <nav className="flex flex-col gap-2 text-sm">
            {docSections.map((section) => (
              <button
                key={section.id}
                onClick={() => navigateToSection(section.id)}
                className={`text-left px-3 py-2 rounded-md transition-colors ${
                  activeSection === section.id
                    ? "bg-blue-500/20 text-blue-400 font-medium"
                    : "text-slate-300 hover:text-blue-400 hover:bg-slate-800/50"
                }`}
              >
                {section.icon} {section.title}
              </button>
            ))}
          </nav>
          <div className="mt-auto pt-4 border-t border-slate-800 text-xs text-slate-500">
            <p>Vigil Guard Docs v{DOC_VERSION}</p>
            <p className="text-slate-600 mt-1">Updated: {BUILD_DATE}</p>
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
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 text-slate-400 hover:text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {sidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            <HelpCircle className="w-5 h-5 text-blue-400" />
            <h1 className="text-xl font-semibold">Assistant & Documentation</h1>
          </div>
          <div className="hidden sm:flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Search documentation..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="w-72 text-sm pl-10 pr-8"
              />
              {searchQuery && (
                <button
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="getting-started" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col p-6 overflow-hidden">
          {!searchActive && (
            <TabsList className="bg-slate-800 border border-slate-600">
              <TabsTrigger value="getting-started">Getting Started</TabsTrigger>
              <TabsTrigger value="configuration">Configuration</TabsTrigger>
              <TabsTrigger value="security-api">Security & API</TabsTrigger>
              <TabsTrigger value="advanced">Advanced</TabsTrigger>
            </TabsList>
          )}

          {searchActive && (
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">
                Search Results for "{searchQuery}" ({searchResults.length} found)
              </h2>
              <Button variant="ghost" onClick={clearSearch}>
                <X className="w-4 h-4 mr-1" /> Clear Search
              </Button>
            </div>
          )}

          <ScrollArea className="mt-6 flex-1">
            {searchActive ? (
              <div className="space-y-4">
                {searchResults.length === 0 ? (
                  <Card className="border-slate-700">
                    <CardBody>
                      <p className="text-slate-400 text-center py-8">
                        No results found for "{searchQuery}". Try different keywords.
                      </p>
                    </CardBody>
                  </Card>
                ) : (
                  searchResults.map((result, idx) => (
                    <Card
                      key={idx}
                      className="border-slate-700 hover:border-blue-500/50 cursor-pointer transition-all"
                      onClick={() => {
                        navigateToSection(result.section.id);
                        clearSearch();
                      }}
                    >
                      <CardHeader>
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <span className="text-2xl">{result.section.icon}</span>
                          {result.section.title}
                        </h3>
                        <p className="text-xs text-slate-500">{result.section.category}</p>
                      </CardHeader>
                      <CardBody>
                        {result.matches.slice(0, 2).map((match, midx) => {
                          const snippet = match.value.substring(0, 200);
                          return (
                            <p key={midx} className="text-sm text-slate-400 mb-2 line-clamp-2">
                              ...{snippet}...
                            </p>
                          );
                        })}
                      </CardBody>
                    </Card>
                  ))
                )}
              </div>
            ) : (
              categoryOrder.map((category) => {
                const tabValue = categoryToTab[category];
                const sections = groupedSections[category] || [];

                return (
                  <TabsContent key={tabValue} value={tabValue}>
                  {loading ? (
                    <div className="flex items-center justify-center py-20">
                      <div className="text-center">
                        <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                        <p className="text-slate-400">Loading documentation...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Quick navigation cards for current category */}
                      {sections.length > 1 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                          {sections.map((section) => (
                            <Card
                              key={section.id}
                              className={`cursor-pointer transition-all ${
                                activeSection === section.id
                                  ? "bg-blue-500/10 border-blue-500/50"
                                  : "border-slate-700 hover:border-blue-500/30"
                              }`}
                              onClick={() => navigateToSection(section.id)}
                            >
                              <CardHeader>
                                <h3 className="text-slate-100 flex items-center gap-2">
                                  <span className="text-2xl">{section.icon}</span>
                                  <span className="font-semibold">{section.title}</span>
                                </h3>
                              </CardHeader>
                            </Card>
                          ))}
                        </div>
                      )}

                      {/* Active document content */}
                      {currentCategory === category && (
                        <Card className="border-slate-700">
                          <CardHeader>
                            {externalDoc ? (
                              <div>
                                <div className="text-sm text-slate-400 mb-2">
                                  📄 External Document: <code className="text-blue-400">{externalDoc.path}</code>
                                </div>
                                <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                                  {externalDoc.title}
                                </h2>
                              </div>
                            ) : (
                              <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                                <span className="text-3xl">{currentSection?.icon}</span>
                                {currentSection?.title}
                              </h2>
                            )}
                          </CardHeader>
                          <CardBody>
                            <article className="prose prose-invert prose-slate max-w-none">
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
                                    <h1 className="text-3xl font-bold text-white mb-4 mt-2" {...props} />
                                  ),
                                  h2: ({ node, ...props }) => (
                                    <h2 className="text-2xl font-bold text-white mt-10 mb-4 pb-2 border-b border-slate-800" {...props} />
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
                                              // Remove common prefixes: docs/, ../, ./
                                              let docName = href
                                                .replace(/^docs\//, '')           // docs/API.md → API.md
                                                .replace(/^\.\.\/.*?\//, '')      // ../prompt-guard-api/README.md → README.md
                                                .replace(/^\.\//, '')             // ./FILE.md → FILE.md
                                                .replace('.md', '');              // API.md → API

                                              // First try curated sections
                                              const section = docSections.find(s =>
                                                s.file === docName ||
                                                s.file.toUpperCase() === docName.toUpperCase() ||
                                                s.id === docName.toLowerCase()
                                              );

                                              if (section) {
                                                navigateToSection(section.id);
                                              } else {
                                                // Fallback to manifest for uncurated documents
                                                const manifestEntry = typedManifest.documents?.find(doc =>
                                                  href.includes(doc.path) ||
                                                  href.endsWith(doc.file + '.md') ||
                                                  doc.path.endsWith(href)
                                                );

                                                if (manifestEntry) {
                                                  if (import.meta.env.DEV) {
                                                    console.log(`[Documentation] Loading external doc from manifest: ${manifestEntry.path}`);
                                                  }
                                                  loadExternalDoc(manifestEntry.url, manifestEntry.title, manifestEntry.path);
                                                } else {
                                                  console.warn(`[Documentation] No section or manifest entry found for: ${href}`);
                                                }
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
                                      className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-4 overflow-x-auto"
                                      {...props}
                                    />
                                  ),
                                  ul: ({ node, ...props }) => (
                                    <ul className="list-disc list-outside ml-5 text-slate-300 mb-4 space-y-1" {...props} />
                                  ),
                                  ol: ({ node, ...props }) => (
                                    <ol className="list-decimal list-outside ml-5 text-slate-300 mb-4 space-y-1" {...props} />
                                  ),
                                  li: ({ node, ...props }) => (
                                    <li className="text-slate-300 leading-6 pl-1" {...props} />
                                  ),
                                  blockquote: ({ node, ...props }) => (
                                    <blockquote
                                      className="border-l-4 border-blue-500/50 bg-blue-500/5 pl-4 pr-4 py-2 my-4 italic text-slate-400"
                                      {...props}
                                    />
                                  ),
                                  table: ({ node, ...props }) => (
                                    <div className="my-4 overflow-x-auto">
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
                                    <hr className="border-slate-800 my-6" {...props} />
                                  ),
                                  img: ({ node, src, alt, ...props }: any) => {
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
                          </CardBody>
                        </Card>
                      )}
                    </div>
                  )}
                </TabsContent>
              );
            })
            )}
          </ScrollArea>
        </Tabs>
      </main>
    </div>
  );
}
