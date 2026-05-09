import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { 
  sharedRemarkPlugins, 
  sharedMarkdownComponents, 
  normalizeMarkdownText 
} from "@/lib/markdown";

interface MarkdownProps {
  content: string;
  className?: string;
  components?: Components;
}

export const Markdown = memo(({ content, className, components }: MarkdownProps) => {
  const normalizedContent = useMemo(() => normalizeMarkdownText(content), [content]);
  const mergedComponents = useMemo(
    () => ({ ...sharedMarkdownComponents, ...(components || {}) }),
    [components]
  );

  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={sharedRemarkPlugins}
        components={mergedComponents}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
});

Markdown.displayName = "Markdown";
