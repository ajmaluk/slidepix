import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Calendar, ArrowRight, Newspaper, Bell } from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { dbClient } from "@/integrations/firebase/client";
import { format } from "date-fns";
import { Link } from "react-router-dom";

interface NewsPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  published_at: string | null;
  meta_keywords: string[] | null;
}

export default function NewsPage() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNews();
  }, []);

  const fetchNews = async () => {
    try {
      const { data, error } = await dbClient
        .from("content_posts")
        .select("id, title, slug, excerpt, published_at, meta_keywords")
        .eq("type", "news")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error("Error fetching news:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout>
      <SEOHead 
        title="News — Latest Announcements" 
        description="Stay up to date with the latest news, press releases, and major announcements from the SlidePix ecosystem." 
        path="/news"
        keywords="SlidePix news, announcements, product updates, press releases"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "News", url: "/news" }
        ]}
        jsonLd={[
          {
            "@type": "CollectionPage",
            "name": "SlidePix News",
            "description": "Latest news and announcements from the SlidePix ecosystem.",
            "url": "https://dalam.pixtool.in/news",
            "publisher": {
              "@type": "Organization",
              "name": "SlidePix"
            }
          },
          ...(posts.length > 0 ? [{
            "@type": "ItemList",
            "itemListElement": posts.slice(0, 10).map((p, i) => ({
              "@type": "ListItem",
              "position": i + 1,
              "url": `https://dalam.pixtool.in/news/${p.slug}`,
              "name": p.title
            }))
          }] : [])
        ]}
      />
      
      <div className="max-w-4xl mx-auto px-4 py-12 md:py-24">
        {/* Header */}
        <div className="mb-16">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-bold uppercase tracking-widest mb-4"
          >
            <Bell className="w-3 h-3" />
            Latest News
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-bold tracking-tight mb-6"
          >
            Press & <span className="bg-gradient-to-r from-amber-400 to-amber-600 bg-clip-text text-transparent">Announcements</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground"
          >
            All the official updates, partnerships, and product launches from SlidePix in one place.
          </motion.p>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-32 rounded-2xl bg-muted/20 animate-pulse border border-border/10" />
            ))}
          </div>
        ) : posts.length > 0 ? (
          <div className="space-y-6">
            {posts.map((post, i) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="group relative p-6 rounded-2xl border border-border/30 bg-card/10 hover:bg-card/20 transition-all duration-300"
              >
                <Link to={`/news/${post.slug}`} className="absolute inset-0 z-10" />
                
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
                       <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        {post.published_at ? format(new Date(post.published_at), "MMMM d, yyyy") : "Draft"}
                      </span>
                    </div>
                    
                    <h2 className="text-xl font-bold mb-2 group-hover:text-amber-500 transition-colors">
                      {post.title}
                    </h2>
                    
                    <p className="text-sm text-muted-foreground line-clamp-2 max-w-2xl">
                      {post.excerpt}
                    </p>
                  </div>

                  <div className="flex items-center text-sm font-bold text-amber-500 group-hover:translate-x-1 transition-transform">
                    View Details <ArrowRight className="w-4 h-4 ml-1" />
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 px-4 rounded-3xl border border-dashed border-border/50">
            <Newspaper className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No news yet</h3>
            <p className="text-muted-foreground">We haven't posted any announcements yet. Check back soon!</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
