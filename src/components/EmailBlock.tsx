import { Mail, Copy, Check, Send, ArrowRight, AtSign, MoreVertical } from "lucide-react";
import { useState, memo } from "react";
import { motion } from "framer-motion";
import { CodeBlock } from "@/components/CodeBlock";
import { Markdown } from "@/components/Markdown";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface EmailBlockProps {
  subject?: string;
  to?: string;
  from?: string;
  cc?: string;
  body: string;
}

const emailMarkdownComponents: any = {
  p({ children }: any) {
    return <p className="mb-3 last:mb-0">{children}</p>;
  },
  strong({ children }: any) {
    return <strong className="font-semibold text-foreground">{children}</strong>;
  },
  em({ children }: any) {
    return <em className="italic text-foreground/80">{children}</em>;
  },
  ul({ children }: any) {
    return <ul className="mb-3 ml-4 space-y-1.5 list-disc">{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="mb-3 ml-4 space-y-1.5 list-decimal">{children}</ol>;
  },
  li({ children }: any) {
    return <li className="text-foreground/85">{children}</li>;
  },
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const codeString = String(children).replace(/\n$/, "");
    if (!match && !codeString.includes("\n")) {
      return (
        <code className="rounded-md border border-border/50 bg-secondary/70 px-1.5 py-0.5 font-mono text-xs text-foreground/90 break-words" {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock language={match?.[1]}>{codeString}</CodeBlock>;
  },
  pre({ children }: any) {
    return <>{children}</>;
  },
  a({ href, children }: any) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground/60 transition-colors"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }: any) {
    return <blockquote className="pl-3 border-l-2 border-muted-foreground/30 text-foreground/70 italic my-3">{children}</blockquote>;
  },
};

export const EmailBlock = memo(function EmailBlock({ subject, to, from, cc, body }: EmailBlockProps) {
  const [copied, setCopied] = useState(false);
  const [markdownCopied, setMarkdownCopied] = useState(false);

  const handleCopy = async () => {
    const emailText = [
      subject ? `Subject: ${subject}` : "",
      to ? `To: ${to}` : "",
      from ? `From: ${from}` : "",
      cc ? `CC: ${cc}` : "",
      "",
      body,
    ]
      .filter(Boolean)
      .join("\n");

    await navigator.clipboard.writeText(emailText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMarkdown = async () => {
    const parts = [
      subject ? `**Subject:** ${subject}` : "",
      from ? `**From:** ${from}` : "",
      to ? `**To:** ${to}` : "",
      cc ? `**CC:** ${cc}` : "",
      "",
      body,
    ].filter(Boolean);

    try {
      await navigator.clipboard.writeText(parts.join("\n"));
      setMarkdownCopied(true);
      setTimeout(() => setMarkdownCopied(false), 2000);
    } catch {
      // Ignore clipboard permission issues in restricted browsers.
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="my-3 overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-b from-secondary/30 to-background/70 shadow-sm"
    >
      {/* Email Header */}
      <div className="sticky top-0 z-10 border-b border-border/30 bg-background/80 px-3 py-2.5 sm:px-4 sm:py-3 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border border-border/50 bg-foreground text-background shadow-sm">
                <Mail className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] sm:text-sm font-semibold text-foreground">Email Draft</span>
                  <span className="inline-flex items-center rounded-full border border-border/50 bg-secondary/60 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70">
                    Message
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground/55">Structured email preview with quick copy</p>
              </div>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <button
              onClick={handleCopyMarkdown}
              title="Copy email as markdown"
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1.5 text-[10px] sm:text-[11px] text-muted-foreground/70 hover:border-border hover:bg-accent hover:text-foreground transition-all"
            >
              {markdownCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Markdown</span>
            </button>
            <button
              onClick={handleCopy}
              title="Copy email"
              className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1.5 text-[10px] sm:text-[11px] text-muted-foreground/70 hover:border-border hover:bg-accent hover:text-foreground transition-all"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Copy</span>
            </button>
          </div>

          <div className="sm:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/40 px-2.5 py-1.5 text-[10px] text-muted-foreground/70 hover:border-border hover:bg-accent hover:text-foreground transition-all"
                  aria-label="Email actions"
                  title="Email actions"
                >
                  <MoreVertical className="w-3.5 h-3.5" />
                  <span>Actions</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onSelect={handleCopy}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy email
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleCopyMarkdown}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy markdown
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => window.print()}>
                  <Mail className="mr-2 h-4 w-4" />
                  Print / share
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Email Fields */}
        <div className="mt-3 grid gap-2 text-xs">
          {subject && (
            <div className="rounded-xl border border-border/50 bg-background/70 px-3 py-2">
              <div className="mb-1.5 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                <Send className="w-3 h-3" />
                Subject
              </div>
              <p className="text-sm font-medium text-foreground leading-relaxed">{subject}</p>
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {from && (
              <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                  <AtSign className="w-3 h-3" />
                  From
                </div>
                <p className="break-all text-foreground/85">{from}</p>
              </div>
            )}
            {to && (
              <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                  <ArrowRight className="w-3 h-3" />
                  To
                </div>
                <p className="break-all text-foreground/85">{to}</p>
              </div>
            )}
          </div>

          {cc && (
            <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/60">
                CC
              </div>
              <p className="break-all text-foreground/85">{cc}</p>
            </div>
          )}
        </div>
      </div>

      {/* Email Body */}
      <div className="px-4 py-4 bg-background/45">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/55">Body</div>
        <div className="prose-sm max-w-none text-sm leading-relaxed text-foreground/88">
          <Markdown content={body} components={emailMarkdownComponents} />
        </div>
      </div>
    </motion.div>
  );
});
