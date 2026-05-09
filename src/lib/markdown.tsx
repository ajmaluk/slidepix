import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import type { MouseEvent } from "react";
import { CodeBlock } from "@/components/CodeBlock";

export const sharedRemarkPlugins = [remarkGfm];

export const navigateInternal = (href: string) => {
  if (typeof document === "undefined") return false;
  const hash = href.split("#")[1];
  if (hash) {
    const el = document.getElementById(hash);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      return true;
    }
  }
  return false;
};

export const sanitizeExternalHref = (href: string): string => {
  if (!href) return "#";
  if (
    href.startsWith("#") ||
    href.startsWith("/") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("blob:")
  ) {
    return href;
  }
  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return href;
    }
  } catch {
    // Not a valid URL
  }
  return "#";
};

export const sanitizeImageSrc = (src: string): string => {
  if (!src) return "";
  if (src.startsWith("/") || src.startsWith("data:") || src.startsWith("blob:")) return src;
  try {
    const url = new URL(src);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return src;
    }
  } catch {
    // Not a valid URL
  }
  return "";
};

export const isLikelyImageUrl = (url: string): boolean => {
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".avif", ".svg"];
  const lowerUrl = url.toLowerCase();
  return imageExtensions.some((ext) => lowerUrl.endsWith(ext)) || /(images\.unsplash\.com|pexels\.com|pixabay\.com|wikimedia\.org|imgur\.com|gstatic\.com)/.test(lowerUrl);
};

export const normalizeMarkdownText = (text: string): string => {
  if (!text) return "";
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
};

export const sharedMarkdownComponents: Components = {
  code({ _node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    return !inline && match ? (
      <CodeBlock language={match[1]}>{String(children)}</CodeBlock>
    ) : (
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm font-medium" {...props}>
        {children}
      </code>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  table({ children }) {
    return (
      <div className="my-6 w-full overflow-x-auto overflow-y-hidden rounded-xl border border-border/50 bg-secondary/20 shadow-sm scrollbar-thin">
        <table className="min-w-full table-auto border-collapse text-left text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-secondary/40 font-semibold text-foreground/80">{children}</thead>;
  },
  th({ children }) {
    return <th className="border-b border-border/40 px-4 py-3 align-top font-semibold first:rounded-tl-xl last:rounded-tr-xl whitespace-normal break-words">{children}</th>;
  },
  td({ children }) {
    return <td className="border-b border-border/30 px-4 py-3 align-top text-foreground/90 whitespace-normal break-words">{children}</td>;
  },
  h1({ children }) {
    return <h1 className="mb-6 mt-10 scroll-m-20 text-3xl font-bold tracking-tight text-foreground first:mt-0">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-4 mt-8 scroll-m-20 border-b border-border/40 pb-2 text-2xl font-semibold tracking-tight text-foreground/90 first:mt-0">{children}</h2>;
  },
  h3({ children }) {
    return (
      <h3 className="mb-3 mt-6 flex items-center gap-2 scroll-m-20 text-xl font-semibold tracking-tight text-foreground/80 first:mt-0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4 text-primary/60">
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
        {children}
      </h3>
    );
  },
  p({ children }) {
    return <p className="leading-7 text-foreground/90 [&:not(:first-child)]:mt-4">{children}</p>;
  },
  ul({ children }) {
    return <ul className="my-5 ml-6 list-disc space-y-2 text-foreground/90">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-5 ml-6 list-decimal space-y-2 text-foreground/90">{children}</ol>;
  },
  li({ children }) {
    return <li className="pl-1 leading-normal">{children}</li>;
  },
  blockquote({ children }) {
    return <blockquote className="my-6 border-l-4 border-primary/30 bg-primary/5 px-5 py-4 italic text-foreground/80 rounded-r-lg">{children}</blockquote>;
  },
  hr() {
    return <hr className="my-8 border-border/40" />;
  },
  a({ href, children, ...props }: any) {
    const isInternal = href?.startsWith("#");
    const sanitizedHref = isInternal ? href : sanitizeExternalHref(href);

    const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
      if (isInternal && href) {
        e.preventDefault();
        navigateInternal(href);
      }
    };

    return (
      <a
        href={sanitizedHref}
        onClick={handleClick}
        className="font-medium text-primary underline decoration-primary/30 underline-offset-4 transition-all hover:text-primary/80 hover:decoration-primary"
        target={isInternal ? undefined : "_blank"}
        rel={isInternal ? undefined : "noopener noreferrer"}
        {...props}
      >
        {children}
      </a>
    );
  },
  img({ src, alt, ...props }: any) {
    const sanitizedSrc = sanitizeImageSrc(src);
    if (!sanitizedSrc) return null;

    return (
      <span className="my-8 block overflow-hidden rounded-2xl border border-border/50 bg-secondary/30 shadow-md">
        <img src={sanitizedSrc} alt={alt} className="h-auto w-full object-cover transition-transform hover:scale-[1.01]" loading="lazy" {...props} />
        {alt && <span className="block border-t border-border/30 bg-background/50 px-4 py-2.5 text-center text-[11px] font-medium text-muted-foreground/70">{alt}</span>}
      </span>
    );
  },
};
