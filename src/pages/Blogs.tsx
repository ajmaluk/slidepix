import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, Calendar, User, ArrowRight, Tag } from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { dbClient } from "@/integrations/firebase/client";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  image_url: string | null;
  published_at: string | null;
  meta_keywords: string[] | null;
}

export default function BlogsPage() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const { data, error } = await dbClient
        .from("content_posts")
        .select("id, title, slug, excerpt, image_url, published_at, meta_keywords")
        .eq("type", "blog")
        .eq("status", "published")
        .order("published_at", { ascending: false });

      if (error) throw error;
      setPosts(data || []);
    } catch (error) {
      console.error("Error fetching blogs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredPosts = posts.filter(post => 
    post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.excerpt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    post.meta_keywords?.some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <PageLayout>
      <SEOHead 
        title="Blog — Insights, Tutorials & Updates" 
        description="Explore the latest insights, tutorials, and product updates from the SlidePix team." 
        path="/blogs"
        keywords="presentation blog, SlidePix blog, presentation tutorials, slide design insights, product news"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Blog", url: "/blogs" }
        ]}
        jsonLd={[
          {
            "@type": "Blog",
            "name": "SlidePix Blog",
            "description": "Insights, tutorials, and product updates from the SlidePix team.",
            "url": "https://dalam.pixtool.in/blogs",
            "publisher": {
              "@type": "Organization",
              "name": "SlidePix",
              "logo": {
                "@type": "ImageObject",
                "url": "https://dalam.pixtool.in/logo-transparent.png"
              }
            }
          },
          ...(posts.length > 0 ? [{
            "@type": "ItemList",
            "itemListElement": posts.slice(0, 10).map((p, i) => ({
              "@type": "ListItem",
              "position": i + 1,
              "url": `https://dalam.pixtool.in/blogs/${p.slug}`,
              "name": p.title
            }))
          }] : [])
        ]}
      />
      
      <div className="max-w-6xl mx-auto px-4 py-12 md:py-24">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-widest mb-4"
          >
            <Tag className="w-3 h-3" />
            Our Blog
          </motion.div>
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold tracking-tight mb-6"
          >
            Insights into the <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Future of AI</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Discover deep dives into presentation workflows, slide design, and guides to mastering SlidePix.
          </motion.p>
        </div>

        {/* Search */}
        <div className="max-w-md mx-auto mb-16 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input 
            placeholder="Search articles..." 
            className="pl-10 h-12 bg-card/10 backdrop-blur-md border-border/40 focus:ring-primary/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[400px] rounded-3xl bg-muted/20 animate-pulse border border-border/10" />
            ))}
          </div>
        ) : filteredPosts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPosts.map((post, i) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="group relative flex flex-col h-full rounded-3xl border border-border/30 bg-card/10 overflow-hidden hover:bg-card/20 transition-all duration-500 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1"
              >
                <Link to={`/blogs/${post.slug}`} className="absolute inset-0 z-10" />
                
                {/* Image Container */}
                <div className="aspect-[16/10] overflow-hidden relative">
                  {post.image_url ? (
                    <img 
                      src={post.image_url} 
                      alt={post.title} 
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                      <Tag className="w-12 h-12 text-primary/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </div>

                {/* Content */}
                <div className="p-6 flex-1 flex flex-col">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-4">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {post.published_at ? format(new Date(post.published_at), "MMM d, yyyy") : "Draft"}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-border" />
                    <span className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      SlidePix Team
                    </span>
                  </div>
                  
                  <h2 className="text-xl font-bold mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                    {post.title}
                  </h2>
                  
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-6 flex-1">
                    {post.excerpt}
                  </p>

                  <div className="flex items-center text-sm font-bold text-primary group-hover:gap-2 transition-all">
                    Read More <ArrowRight className="w-4 h-4 ml-1 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        ) : (
          <div className="text-center py-20 px-4 rounded-3xl border border-dashed border-border/50">
            <h3 className="text-xl font-semibold mb-2">No articles found</h3>
            <p className="text-muted-foreground">Try adjusting your search query or check back later.</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
