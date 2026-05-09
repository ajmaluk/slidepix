import { useEffect, useState, memo } from "react";
import { Copy, Check, Terminal, WrapText, Download, ChevronDown, ChevronUp, MoreVertical, Eye, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Markdown } from "@/components/Markdown";

interface CodeBlockProps {
  language?: string;
  children: string;
}

const LANGUAGE_LABELS: Record<string, string> = {
  js: "JavaScript",
  jsx: "React JSX",
  ts: "TypeScript",
  tsx: "React TSX",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  cs: "C#",
  sh: "Shell",
  bash: "Bash",
  zsh: "Zsh",
  sql: "SQL",
  json: "JSON",
  yml: "YAML",
  yaml: "YAML",
  md: "Markdown",
  html: "HTML",
  css: "CSS",
  text: "Text",
};

const LANGUAGE_EXTENSIONS: Record<string, string> = {
  javascript: "js",
  js: "js",
  jsx: "jsx",
  typescript: "ts",
  ts: "ts",
  tsx: "tsx",
  python: "py",
  py: "py",
  ruby: "rb",
  rb: "rb",
  go: "go",
  rust: "rs",
  rs: "rs",
  c: "c",
  cpp: "cpp",
  csharp: "cs",
  cs: "cs",
  shell: "sh",
  sh: "sh",
  bash: "sh",
  zsh: "zsh",
  sql: "sql",
  json: "json",
  yaml: "yml",
  yml: "yml",
  markdown: "md",
  md: "md",
  html: "html",
  css: "css",
};

export const CodeBlock = memo(function CodeBlock({ language, children }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState<"preview" | "code">("preview");
  const [highlighter, setHighlighter] = useState<any>(null);
  const [theme, setTheme] = useState<any>(null);
  const [wrapLines, setWrapLines] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;

    Promise.all([
      import("@/lib/syntaxHighlighter"),
    ])
      .then(([mod]) => {
        if (!mounted) return;
        setHighlighter(() => mod.SyntaxHighlighter);
        setTheme(mod.oneDark);
      })
      .catch(() => {
        if (!mounted) return;
        setHighlighter(null);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const codeText = children.replace(/\n$/, "");
  const lines = codeText.split("\n").length;
  const chars = codeText.length;
  const normalizedLanguage = (language || "text").toLowerCase();
  const languageLabel = LANGUAGE_LABELS[normalizedLanguage] || normalizedLanguage.toUpperCase();
  const fileExtension = LANGUAGE_EXTENSIONS[normalizedLanguage] || "txt";
  const isHtmlLike = normalizedLanguage === "html" || normalizedLanguage === "htm" || codeText.includes("<!DOCTYPE html") || codeText.includes("<html");
  const isMarkdownLike = normalizedLanguage === "md" || normalizedLanguage === "markdown";
  const isLargeSnippet = lines > 18 || chars > 1200;
  const isCollapsed = isLargeSnippet && !expanded;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard permission issues in restricted browsers.
    }
  };

  const handleDownload = () => {
    const blob = new Blob([codeText], { type: "text/plain;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `snippet.${fileExtension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const previewHtml = isHtmlLike ? codeText : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">${normalizedLanguage === "css" ? `<style>${codeText}</style>` : ""}</head><body>${codeText}</body></html>`;

  const renderPreviewSurface = () => {
    if (isHtmlLike) {
      return (
        <iframe
          title="HTML preview"
          className="h-full w-full bg-white"
          sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin"
          srcDoc={previewHtml}
        />
      );
    }

    if (isMarkdownLike) {
      return (
        <Markdown
          content={codeText}
          className="mx-auto h-full w-full max-w-4xl overflow-auto bg-background px-4 py-5 shadow-sm sm:px-6 sm:py-8 prose prose-sm max-w-none text-foreground dark:prose-invert prose-headings:text-foreground prose-a:text-foreground prose-strong:text-foreground"
        />
      );
    }

    return (
      <div className="mx-auto w-full max-w-[1200px] rounded-2xl border border-border/50 bg-secondary/30 shadow-sm">
        {renderCodeSurface("min-h-full")}
      </div>
    );
  };

  const renderCodeSurface = (surfaceClassName = "") => {
    if (highlighter && theme) {
      const SyntaxHighlighter = highlighter;
      return (
        <SyntaxHighlighter
          language={language || "text"}
          style={theme}
          showLineNumbers={lines > 3}
          lineNumberStyle={{
            minWidth: "2.5em",
            paddingRight: "1em",
            color: "hsl(var(--muted-foreground) / 0.25)",
            fontSize: "12px",
          }}
          customStyle={{
            margin: 0,
            padding: "1rem",
            fontSize: "13px",
            lineHeight: "1.7",
            background: "hsl(var(--secondary) / 0.6)",
            borderRadius: 0,
            overflowX: "auto",
            minHeight: "100%",
          }}
          wrapLongLines={wrapLines}
          codeTagProps={{
            style: { fontFamily: "'JetBrains Mono', monospace" },
          }}
          className={surfaceClassName}
        >
          {codeText}
        </SyntaxHighlighter>
      );
    }

    return (
      <pre
        className={`m-0 p-4 text-[13px] leading-[1.7] bg-secondary/60 ${wrapLines ? "whitespace-pre-wrap break-words" : "overflow-x-auto"} ${surfaceClassName}`}
      >
        <code style={{ fontFamily: "'JetBrains Mono', monospace" }}>{codeText}</code>
      </pre>
    );
  };

  return (
    <div className="relative group rounded-xl border border-border/60 my-4 bg-gradient-to-b from-secondary/40 to-secondary/30 shadow-sm">
      {/* Header bar */}
      <div className="sticky top-0 z-10 flex flex-col gap-2 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-3 sm:py-2.5 bg-secondary/90 backdrop-blur border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <Terminal className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-muted-foreground/60" />
          <span className="inline-flex items-center px-1.5 py-0.5 sm:px-2 rounded-md border border-border/60 bg-background/40 text-[9px] sm:text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider">
            {languageLabel}
          </span>
          <span className="text-[9px] sm:text-[10px] text-muted-foreground/45 hidden sm:inline">
            {lines} {lines === 1 ? "line" : "lines"} • {chars.toLocaleString()} chars
          </span>
        </div>
        <div className="hidden sm:flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border/50 hover:bg-accent"
            aria-label="Preview code"
            title="Preview code"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Preview</span>
          </button>

          {isLargeSnippet && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border/50 hover:bg-accent"
              aria-label={expanded ? "Collapse code" : "Expand code"}
              title={expanded ? "Collapse code" : "Expand code"}
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{expanded ? "Collapse" : "Expand"}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setWrapLines((prev) => !prev)}
              className={`inline-flex items-center gap-1 text-[10px] sm:text-[11px] px-2 py-1 rounded-md border transition-colors ${
              wrapLines
                ? "border-foreground/25 bg-foreground/10 text-foreground"
                : "border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-accent"
            }`}
            aria-label={wrapLines ? "Disable line wrap" : "Enable line wrap"}
            title={wrapLines ? "Disable line wrap" : "Enable line wrap"}
          >
            <WrapText className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Wrap</span>
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border/50 hover:bg-accent"
            aria-label="Download code"
            title="Download code"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-muted-foreground/70 hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border/50 hover:bg-accent"
            aria-label="Copy code"
            title="Copy code"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center justify-end sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-border/50 bg-background/50 px-2.5 py-1.5 text-[11px] text-muted-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                aria-label="Code actions"
                title="Code actions"
              >
                <MoreVertical className="w-3.5 h-3.5" />
                <span>Actions</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onSelect={() => setPreviewOpen(true)}>
                <Eye className="mr-2 h-4 w-4" />
                Preview
              </DropdownMenuItem>
              {isLargeSnippet && (
                <DropdownMenuItem onSelect={() => setExpanded((prev) => !prev)}>
                  {expanded ? <ChevronUp className="mr-2 h-4 w-4" /> : <ChevronDown className="mr-2 h-4 w-4" />}
                  {expanded ? "Collapse" : "Expand"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setWrapLines((prev) => !prev)}>
                <WrapText className="mr-2 h-4 w-4" />
                {wrapLines ? "Disable wrap" : "Wrap lines"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleDownload}>
                <Download className="mr-2 h-4 w-4" />
                Save file
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleCopy}>
                <Copy className="mr-2 h-4 w-4" />
                Copy code
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="relative">
        <div className={isCollapsed ? "max-h-[18rem] overflow-auto overscroll-contain scrollbar-thin" : ""}>
          {renderCodeSurface()}
        </div>

        {isCollapsed && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-secondary/90 to-transparent" />
        )}
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="fixed inset-0 h-[100dvh] w-[100vw] max-w-none translate-x-0 translate-y-0 rounded-none border-0 bg-background p-0 shadow-none sm:h-[100dvh] sm:w-[100vw] sm:rounded-none sm:border-0 [&>button:last-child]:hidden">
          <div className="flex h-full flex-col">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border/50 bg-background/90 px-4 py-3 backdrop-blur-xl">
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Terminal className="h-4 w-4 text-muted-foreground/60" />
                  <span className="truncate text-sm font-semibold text-foreground">Code Preview</span>
                  <span className="inline-flex items-center rounded-full border border-border/60 bg-secondary/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {languageLabel}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground/55">
                  {lines} {lines === 1 ? "line" : "lines"} • {chars.toLocaleString()} chars
                </p>
              </div>

              <div className="flex items-center gap-1 flex-wrap justify-end">
                {isHtmlLike || isMarkdownLike ? (
                  <button
                    type="button"
                    onClick={() => setPreviewMode((prev) => (prev === "preview" ? "code" : "preview"))}
                    className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{previewMode === "preview" ? "Code" : "Preview"}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setPreviewOpen(false)}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Close</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWrapLines((prev) => !prev)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                    wrapLines ? "border-foreground/25 bg-foreground/10 text-foreground" : "border-border/50 text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <WrapText className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Wrap</span>
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Save</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded-md border border-border/50 px-2.5 py-1.5 text-xs text-muted-foreground/70 hover:bg-accent hover:text-foreground transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  <span className="hidden sm:inline">Copy</span>
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-secondary/20 p-3 sm:p-4">
              {previewMode === "preview" ? (
                isHtmlLike || isMarkdownLike ? (
                  renderPreviewSurface()
                ) : (
                  renderPreviewSurface()
                )
              ) : (
                <div className="mx-auto w-full max-w-[1200px] rounded-2xl border border-border/50 bg-secondary/30 shadow-sm">
                  {renderCodeSurface("min-h-full")}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
