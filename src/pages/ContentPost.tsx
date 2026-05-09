import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Calendar, User, ArrowLeft, Tag, Share2 } from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { dbClient } from "@/integrations/firebase/client";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/validation";

interface ContentPost {
  title: string;
  content: string;
  image_url: string | null;
  published_at: string | null;
  type: 'blog' | 'news';
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string[] | null;
}

export default function ContentPostPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<ContentPost | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPost = useCallback(async () => {
    try {
      const { data, error } = await dbClient
        .from("content_posts")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        navigate("/404");
        return;
      }
      setPost(data as ContentPost);
    } catch (error) {
      console.error("Error fetching post:", error);
    } finally {
      setLoading(false);
    }
  }, [navigate, slug]);

  useEffect(() => {
    if (slug) fetchPost();
  }, [fetchPost, slug]);

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: post?.title,
        url: window.location.href
      });
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </PageLayout>
    );
  }

  if (!post) return null;

  return (
    <PageLayout>
      <SEOHead 
        title={post.meta_title || post.title} 
        description={post.meta_description || post.title} 
        path={`/${post.type === 'blog' ? 'blogs' : 'news'}/${slug}`}
        type="article"
        image={post.image_url || undefined}
        publishedTime={post.published_at || undefined}
        author="SlidePix"
        keywords={post.meta_keywords?.join(", ")}
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: post.type === 'blog' ? 'Blog' : 'News', url: post.type === 'blog' ? '/blogs' : '/news' },
          { name: post.title, url: `/${post.type === 'blog' ? 'blogs' : 'news'}/${slug}` }
        ]}
        jsonLd={{
          "@type": post.type === 'news' ? "NewsArticle" : "BlogPosting",
          "headline": post.title,
          "description": post.meta_description || post.title,
          "image": post.image_url || "https://dalam.pixtool.in/og-image.jpg",
          "datePublished": post.published_at,
          "dateModified": post.published_at,
          "author": {
            "@type": "Organization",
            "name": "SlidePix",
            "url": "https://dalam.pixtool.in"
          },
          "publisher": {
            "@type": "Organization",
            "name": "SlidePix",
            "logo": {
              "@type": "ImageObject",
              "url": "https://dalam.pixtool.in/logo-transparent.png"
            }
          },
          "mainEntityOfPage": {
            "@type": "WebPage",
            "@id": `https://dalam.pixtool.in/${post.type === 'blog' ? 'blogs' : 'news'}/${slug}`
          }
        }}
      />
      
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-24">
        {/* Navigation */}
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => navigate(post.type === 'blog' ? '/blogs' : '/news')}
          className="mb-12 gap-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" /> Back to {post.type === 'blog' ? 'Blog' : 'News'}
        </Button>

        {/* Hero */}
        <div className="mb-12 text-center">
          <div className="flex items-center justify-center gap-4 text-xs font-medium text-primary uppercase tracking-widest mb-6 px-1">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {post.published_at ? format(new Date(post.published_at), "MMMM d, yyyy") : "Draft"}
            </span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <span className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" />
              SlidePix Team
            </span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-8">
            {post.title}
          </h1>

          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleShare} className="rounded-full gap-2">
              <Share2 className="w-4 h-4" /> Share Post
            </Button>
          </div>
        </div>

        {/* Featured Image */}
        {post.image_url && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-16 aspect-[21/9] rounded-3xl overflow-hidden border border-border/30"
          >
            <img 
              src={post.image_url} 
              alt={post.title} 
              className="w-full h-full object-cover"
            />
          </motion.div>
        )}

        {/* Content */}
        <div className="prose prose-invert prose-lg max-w-none prose-headings:font-bold prose-p:text-muted-foreground prose-a:text-primary mb-16">
          <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }} />
        </div>

        {/* Tags */}
        {post.meta_keywords && post.meta_keywords.length > 0 && (
          <div className="pt-8 border-t border-border/10 flex flex-wrap gap-2">
            {post.meta_keywords.map(tag => (
              <span key={tag} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/30 text-xs font-medium text-muted-foreground">
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
