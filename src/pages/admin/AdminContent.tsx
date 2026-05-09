import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { 
  Plus, Search, Edit3, Trash2, Tag, 
  ExternalLink, Check, X, Newspaper, 
  Layout, Eye, Globe, Image as ImageIcon
} from "lucide-react";
import { dbClient } from "@/integrations/firebase/client";
import { authClient } from "@/lib/authClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Select, SelectContent, SelectItem, 
  SelectTrigger, SelectValue 
} from "@/components/ui/select";
import { toast } from "sonner";
import { sanitizeHtml } from "@/lib/validation";

interface ContentPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  image_url: string | null;
  type: 'blog' | 'news';
  status: 'draft' | 'published';
  meta_title: string | null;
  meta_description: string | null;
  meta_keywords: string[] | null;
  published_at: string | null;
  updated_at: string;
  created_at: string;
}

export default function AdminContent() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isPreview, setIsPreview] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPost, setCurrentPost] = useState<Partial<ContentPost>>({
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    image_url: "",
    type: "blog",
    status: "draft",
    meta_title: "",
    meta_description: "",
    meta_keywords: []
  });

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const { data, error } = await dbClient
        .from("content_posts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setPosts(data as ContentPost[]);
    } catch (error) {
      console.error("Error fetching admin posts:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentPost.title || !currentPost.slug || !currentPost.content) {
      toast.error("Title, Slug, and Content are required");
      return;
    }

    try {
      const { data: { session } } = await authClient.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const postData = {
        title: currentPost.title ?? "",
        slug: currentPost.slug ?? "",
        content: currentPost.content ?? "",
        type: (currentPost.type || 'blog') as 'blog' | 'news',
        status: (currentPost.status || 'draft') as 'draft' | 'published',
        excerpt: currentPost.excerpt || null,
        image_url: currentPost.image_url || null,
        meta_title: currentPost.meta_title || null,
        meta_description: currentPost.meta_description || null,
        meta_keywords: currentPost.meta_keywords || [],
        author_id: session.user.id,
        updated_at: new Date().toISOString(),
        published_at: currentPost.status === 'published' 
          ? (currentPost.published_at || new Date().toISOString()) 
          : null
      };

      let error;
      if (currentPost.id) {
        const { error: updateError } = await dbClient
          .from("content_posts")
          .update(postData)
          .eq("id", currentPost.id);
        error = updateError;
      } else {
        const { error: insertError } = await dbClient
          .from("content_posts")
          .insert([postData]);
        error = insertError;
      }

      if (error) {
        if (error.code === '23505') {
          toast.error("An article with this slug already exists.");
        } else {
          throw error;
        }
        return;
      }

      toast.success("Post saved successfully");
      setIsEditing(false);
      fetchPosts();
    } catch (error: any) {
      toast.error(error.message || "Failed to save post");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      const { error } = await dbClient
        .from("content_posts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Post deleted");
      fetchPosts();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete post");
    }
  };

  const handleEdit = (post: ContentPost) => {
    setCurrentPost(post);
    setIsEditing(true);
  };

  const generateSlug = (title: string) => {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  };

  const filteredPosts = posts.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.slug.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-8 p-4 md:p-8">
        <div className="h-8 w-64 rounded bg-muted/30 animate-pulse" />
        <div className="h-24 rounded-2xl bg-muted/20 animate-pulse" />
        <div className="h-24 rounded-2xl bg-muted/20 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Content Management</h1>
          <p className="text-muted-foreground">Create and manage your blogs, news, and SEO metadata.</p>
        </div>
        <Button onClick={() => {
          setCurrentPost({
            title: "",
            slug: "",
            content: "",
            excerpt: "",
            image_url: "",
            type: "blog",
            status: "draft",
            meta_title: "",
            meta_description: "",
            meta_keywords: []
          });
          setIsEditing(true);
        }} className="gap-2 rounded-full">
          <Plus className="w-4 h-4" /> New Article
        </Button>
      </div>

      {!isEditing ? (
        <div className="space-y-6">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder="Search by title or slug..." 
              className="pl-9 bg-card/10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="grid gap-4">
            {filteredPosts.map((post) => (
              <motion.div
                key={post.id}
                layout
                className="flex items-center justify-between p-4 rounded-2xl border border-border/30 bg-card/10 hover:bg-card/20 transition-all"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`p-2 rounded-xl border ${post.type === 'blog' ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-amber-500/10 border-amber-500/20 text-amber-500'}`}>
                    {post.type === 'blog' ? <Layout className="w-5 h-5" /> : <Newspaper className="w-5 h-5" />}
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{post.title}</h3>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" /> /{post.type === 'blog' ? 'blogs' : 'news'}/{post.slug}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span className={`flex items-center gap-1 ${post.status === 'published' ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {post.status === 'published' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                        {post.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="ghost" size="icon" onClick={() => window.open(`/${post.type === 'blog' ? 'blogs' : 'news'}/${post.slug}`, '_blank')}>
                    <ExternalLink className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleEdit(post)}>
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(post.id)} className="text-rose-400 hover:text-rose-500 hover:bg-rose-500/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-8"
        >
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <div className="space-y-4 p-6 rounded-3xl border border-border/30 bg-card/10">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Edit3 className="w-5 h-5" /> Editor
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Title</label>
                  <Input 
                    placeholder="Enter article title..." 
                    value={currentPost.title}
                    onChange={(e) => {
                      const title = e.target.value;
                      setCurrentPost(prev => ({ 
                        ...prev, 
                        title,
                        slug: prev.id ? prev.slug : generateSlug(title)
                      }));
                    }}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Slug URL</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono">
                      /{currentPost.type === 'blog' ? 'blogs' : 'news'}/
                    </span>
                    <Input 
                      placeholder="my-post-url" 
                      className="pl-16 font-mono text-sm"
                      value={currentPost.slug}
                      onChange={(e) => setCurrentPost(prev => ({ ...prev, slug: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Excerpt</label>
                  <Textarea 
                    placeholder="Brief summary of the article..." 
                    rows={3}
                    value={currentPost.excerpt}
                    onChange={(e) => setCurrentPost(prev => ({ ...prev, excerpt: e.target.value }))}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium mb-1.5 block">Article Content (HTML supported)</label>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setIsPreview(!isPreview)}
                    className="h-8 gap-2 text-xs"
                  >
                    {isPreview ? <Edit3 className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {isPreview ? "Edit Mode" : "Preview Mode"}
                  </Button>
                </div>
                {isPreview ? (
                  <div className="prose prose-invert prose-sm max-w-none p-4 rounded-xl border border-border/20 bg-black/20 min-h-[300px]">
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentPost.content || 'Nothing to preview...') }} />
                  </div>
                ) : (
                  <Textarea 
                    placeholder="Write your article here..." 
                    rows={12}
                    className="font-mono text-sm"
                    value={currentPost.content}
                    onChange={(e) => setCurrentPost(prev => ({ ...prev, content: e.target.value }))}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Sidebar / Settings */}
          <div className="space-y-6">
            <div className="p-6 rounded-3xl border border-border/30 bg-card/10 space-y-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Tag className="w-5 h-5" /> Settings
              </h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Content Type</label>
                  <Select value={currentPost.type} onValueChange={(val: any) => setCurrentPost(prev => ({ ...prev, type: val }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="blog">Blog Post</SelectItem>
                      <SelectItem value="news">News Update</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Status</label>
                  <Select value={currentPost.status} onValueChange={(val: any) => setCurrentPost(prev => ({ ...prev, status: val }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Featured Image URL</label>
                  <div className="relative">
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input 
                      placeholder="https://..." 
                      className="pl-9"
                      value={currentPost.image_url}
                      onChange={(e) => setCurrentPost(prev => ({ ...prev, image_url: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-border/10">
                <div className="flex gap-2">
                  <Button onClick={handleSave} className="flex-1 rounded-full">Save Changes</Button>
                  <Button variant="ghost" onClick={() => setIsEditing(false)} className="rounded-full">Cancel</Button>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-3xl border border-border/30 bg-card/10 space-y-4 text-xs">
               <h3 className="font-bold flex items-center gap-2 text-muted-foreground uppercase tracking-widest">
                <Search className="w-3.5 h-3.5" /> SEO Indexing
              </h3>
              <div>
                <label className="font-medium mb-1 block">SEO Title</label>
                <Input size={1} value={currentPost.meta_title} onChange={e => setCurrentPost(prev => ({...prev, meta_title: e.target.value}))} className="h-8 text-xs bg-black/20" />
              </div>
              <div>
                <label className="font-medium mb-1 block">SEO Description</label>
                <Textarea value={currentPost.meta_description} onChange={e => setCurrentPost(prev => ({...prev, meta_description: e.target.value}))} className="text-xs bg-black/20" rows={2} />
              </div>
              <div>
                <label className="font-medium mb-1 block">Keywords (comma separated)</label>
                <Input 
                  value={currentPost.meta_keywords?.join(', ')} 
                  onChange={e => setCurrentPost(prev => ({...prev, meta_keywords: e.target.value.split(',').map(k => k.trim())}))} 
                  className="h-8 text-xs bg-black/20" 
                />
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
