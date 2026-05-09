import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Quote, Star, Plus, X, Loader2, MessageSquare, LogIn } from "lucide-react";
import { dbClient } from "@/integrations/firebase/client";
import { authClient } from "@/lib/authClient";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Testimonial = {
  id: string;
  rating: number;
  review: string;
  displayName: string;
  createdAt: string;
  userId: string;
};

function StarPicker({ value, onChange }: { value: number; onChange: (next: number) => void }) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3, 4, 5].map((s) => {
        const active = s <= (hovered || value);
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            onMouseEnter={() => setHovered(s)}
            onMouseLeave={() => setHovered(0)}
            className="transition-transform active:scale-90"
            aria-label={`Set rating to ${s}`}
          >
            <Star 
              className={`w-8 h-8 ${active ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} 
            />
          </button>
        );
      })}
    </div>
  );
}

export default function TestimonialsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userTestimonial, setUserTestimonial] = useState<Testimonial | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");

  const averageRating = useMemo(() => {
    if (!items.length) return 0;
    return items.reduce((sum, item) => sum + item.rating, 0) / items.length;
  }, [items]);

  const fetchTestimonials = async () => {
    try {
      const { data, error } = await dbClient
        .from("user_ratings")
        .select("id, rating, review, display_name, created_at, user_id")
        .eq("approved", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setItems((data || []).map((row: any) => ({
        id: row.id,
        rating: row.rating,
        review: row.review,
        displayName: row.display_name || "SlidePix User",
        createdAt: row.created_at,
        userId: row.user_id
      })));
    } catch (err) {
      console.error("Error fetching testimonials:", err);
    } finally {
      setLoading(false);
    }
  };

  const checkUserStatus = async () => {
    const { data: { session } } = await authClient.auth.getSession();
    if (session?.user) {
      setCurrentUser(session.user);
      const { data } = await dbClient
        .from("user_ratings")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      
      const ownRating = Array.isArray(data) ? data[0] : null;
      if (ownRating) {
        setUserTestimonial({
          id: ownRating.id,
          rating: ownRating.rating,
          review: ownRating.review,
          displayName: ownRating.display_name || "You",
          createdAt: ownRating.created_at,
          userId: ownRating.user_id
        });
      }
    }
  };

  useEffect(() => {
    fetchTestimonials();
    checkUserStatus();
  }, []);

  const handleSubmit = async () => {
    if (!currentUser) {
      navigate("/auth");
      return;
    }

    if (rating < 1) {
      toast.error("Please select a rating.");
      return;
    }

    if (review.trim().length < 10) {
      toast.error("Testimonial is too short.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: profile } = await dbClient
        .from("user_subscriptions")
        .select("full_name")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      const { error } = await dbClient.from("user_ratings").upsert({
        user_id: currentUser.id,
        rating,
        review: review.trim(),
        display_name: profile?.full_name || currentUser.email.split('@')[0],
        approved: false // Require re-approval on edit
      });

      if (error) throw error;

      toast.success("Testimonial submitted! It will appear after review.");
      setShowAddForm(false);
      checkUserStatus();
    } catch (err: any) {
      toast.error(err.message || "Failed to submit testimonial");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout>
      <SEOHead 
        title="Testimonials — User Experiences with SlidePix" 
        description="Read what our community has to say about SlidePix. Real reviews from users who are transforming their presentation workflows." 
        path="/testimonials"
        keywords="SlidePix reviews, user testimonials, presentation software feedback"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Testimonials", url: "/testimonials" }
        ]}
        jsonLd={{
          "@type": "Product",
          "name": "SlidePix",
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": averageRating.toFixed(1),
            "reviewCount": items.length || 1
          },
          "review": items.slice(0, 5).map(item => ({
            "@type": "Review",
            "reviewRating": {
              "@type": "Rating",
              "ratingValue": item.rating
            },
            "author": {
              "@type": "Person",
              "name": item.displayName
            },
            "reviewBody": item.review,
            "datePublished": item.createdAt.split('T')[0]
          }))
        }}
      />

      <div className="pt-24 pb-20 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-4"
            >
              <Star className="w-3 h-3 fill-current" />
              User Reviews
            </motion.div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
              Hear from our <span className="text-primary">Community</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Real stories and experiences from the researchers, creators, and developers who use SlidePix every day.
            </p>
          </div>

          {/* Stats & Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-16">
            <div className="p-8 rounded-3xl border border-border/40 bg-card/20 backdrop-blur-xl flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Average Rating</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{averageRating.toFixed(1)}</span>
                  <span className="text-muted-foreground">/ 5.0</span>
                </div>
                <div className="flex items-center gap-1 mt-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star 
                      key={i} 
                      className={`w-4 h-4 ${i < Math.floor(averageRating) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} 
                    />
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground mb-1">Total Reviews</p>
                <p className="text-4xl font-bold">{items.length}</p>
              </div>
            </div>

            <div className="p-8 rounded-3xl border border-primary/20 bg-primary/5 backdrop-blur-xl flex flex-col justify-center">
              {!currentUser ? (
                <div className="text-center">
                  <p className="font-semibold mb-4 text-lg">Share your own experience</p>
                  <Button 
                    onClick={() => navigate("/auth")}
                    className="w-full md:w-auto gap-2 rounded-2xl h-12 px-8"
                  >
                    <LogIn className="w-4 h-4" /> Login to Add Testimonial
                  </Button>
                </div>
              ) : userTestimonial ? (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-semibold">Your Testimonial</p>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">
                      Under Review
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 italic mb-4">"{userTestimonial.review}"</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setRating(userTestimonial.rating);
                      setReview(userTestimonial.review);
                      setShowAddForm(true);
                    }}
                    className="rounded-xl gap-2"
                  >
                    <Plus className="w-4 h-4" /> Edit Your Testimonial
                  </Button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="font-semibold mb-4 text-lg">How are you liking SlidePix?</p>
                  <Button 
                    onClick={() => setShowAddForm(true)}
                    className="w-full md:w-auto gap-2 rounded-2xl h-12 px-8"
                  >
                    <Plus className="w-4 h-4" /> Add Testimonial
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Add/Edit Form Overlay */}
          <AnimatePresence>
            {showAddForm && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowAddForm(false)}
                  className="absolute inset-0 bg-background/80 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative w-full max-w-lg bg-card border border-border p-8 rounded-3xl shadow-2xl"
                >
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-2xl font-bold">Share your thoughts</h2>
                    <Button variant="ghost" size="icon" onClick={() => setShowAddForm(false)}>
                      <X className="w-5 h-5" />
                    </Button>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="text-sm font-medium mb-3 block text-muted-foreground">Overall Rating</label>
                      <StarPicker value={rating} onChange={setRating} />
                    </div>

                    <div>
                      <label className="text-sm font-medium mb-3 block text-muted-foreground">Your Message</label>
                      <Textarea 
                        placeholder="Tell us what you love about SlidePix..."
                        rows={5}
                        value={review}
                        onChange={e => setReview(e.target.value)}
                        className="rounded-2xl resize-none bg-background/50"
                      />
                    </div>

                    <Button 
                      onClick={handleSubmit} 
                      className="w-full h-12 rounded-2xl font-bold text-lg"
                      disabled={submitting}
                    >
                      {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : userTestimonial ? "Update Testimonial" : "Submit Testimonial"}
                    </Button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Testimonials Grid */}
          {loading ? (
            <div className="py-20 flex flex-col items-center gap-4 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p>Fetching testimonials...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 text-center rounded-3xl border-2 border-dashed border-border/40">
              <MessageSquare className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">No testimonials yet. Be the first to share your story!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {items.map((item, idx) => (
                <motion.article
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="p-6 rounded-3xl border border-border/40 bg-card/10 hover:bg-card/20 transition-all group"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-3.5 h-3.5 ${i < item.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} 
                        />
                      ))}
                    </div>
                    <Quote className="w-5 h-5 text-muted-foreground/10 group-hover:text-primary/20 transition-colors" />
                  </div>
                  <p className="text-sm text-foreground/90 leading-relaxed mb-6 italic">"{item.review}"</p>
                  <div className="flex items-center justify-between pt-4 border-t border-border/10">
                    <span className="text-sm font-bold text-foreground/80">{item.displayName}</span>
                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">
                      {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </motion.article>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
