import { useEffect, useState, useCallback } from "react";
import { CheckCircle2, Clock3, Search, ShieldAlert, Star, Trash2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/authClient";
import { dbClient } from "@/integrations/firebase/client";
import { toast } from "sonner";

type ReviewRow = {
  id: string;
  rating: number;
  review: string | null;
  display_name: string | null;
  created_at: string;
  approved: boolean | null;
  approved_at: string | null;
  user_id: string;
  conversation_id?: string | null;
  user_subscriptions?: {
    full_name: string | null;
    email: string | null;
  } | null;
};

type StatusFilter = "all" | "pending" | "approved";

export default function AdminTestimonials() {
  const PAGE_SIZE = 15;
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [actingId, setActingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);

  const getMatchingUserIds = useCallback(async (term: string) => {
    const { data, error } = await dbClient
      .from("user_subscriptions")
      .select("user_id")
      .or(`full_name.ilike.${term},email.ilike.${term}`)
      .limit(200);

    if (error || !data) return [];
    return data
      .map((row) => String(row.user_id || "").replace(/,/g, ""))
      .filter(Boolean);
  }, []);

  const fetchRows = useCallback(async () => {
    try {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = dbClient
        .from("user_ratings")
        .select(`
          id,
          rating,
          review,
          display_name,
          created_at,
          approved,
          approved_at,
          user_id,
          conversation_id,
          user_subscriptions(full_name, email)
        `, { count: "exact" })
        .not("review", "is", null)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (statusFilter === "pending") {
        query = query.or("approved.eq.false,approved.is.null");
      }

      if (statusFilter === "approved") {
        query = query.eq("approved", true);
      }

      const normalizedSearch = debouncedSearch.trim();
      if (normalizedSearch) {
        const escaped = normalizedSearch.replace(/,/g, " ").replace(/%/g, "");
        const term = `%${escaped}%`;
        const orParts = [`review.ilike.${term}`, `display_name.ilike.${term}`];
        const matchingUserIds = await getMatchingUserIds(term);

        if (matchingUserIds.length > 0) {
          orParts.push(`user_id.in.(${matchingUserIds.join(",")})`);
        }

        query = query.or(orParts.join(","));
      }

      const { data, error, count } = await query;

      if (error) throw error;
      setRows((data as unknown as ReviewRow[]) || []);
      setTotalCount(count ?? 0);

      const { count: pending, error: pendingError } = await dbClient
        .from("user_ratings")
        .select("id", { count: "exact", head: true })
        .not("review", "is", null)
        .or("approved.eq.false,approved.is.null");

      if (!pendingError) {
        setPendingCount(pending ?? 0);
      }
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error?.message || "Failed to load testimonials");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedSearch, getMatchingUserIds]);

  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  useEffect(() => {
    setLoading(true);
    fetchRows();
  }, [fetchRows]);

  const setApproval = async (item: ReviewRow, approved: boolean) => {
    setActingId(item.id);
    try {
      const {
        data: { session },
      } = await authClient.auth.getSession();

      const payload = approved
        ? {
            approved: true,
            approved_at: new Date().toISOString(),
            approved_by: session?.user?.id || null,
          }
        : {
            approved: false,
            approved_at: null,
            approved_by: null,
          };
      
      const updateData = payload as { [key: string]: any };

      const { error } = await dbClient.from("user_ratings").update(updateData).eq("id", item.id);
      if (error) throw error;

      toast.success(approved ? "Testimonial approved" : "Approval removed");
      await fetchRows();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error?.message || "Failed to update testimonial");
    } finally {
      setActingId(null);
    }
  };

  const handleDelete = async (item: ReviewRow) => {
    if (!window.confirm(`Delete this testimonial from "${item.display_name || "Anonymous"}"? This cannot be undone.`)) return;
    setActingId(item.id);
    try {
      const { error } = await dbClient.from("user_ratings").delete().eq("id", item.id);
      if (error) throw error;
      toast.success("Testimonial deleted");
      await fetchRows();
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete testimonial");
    } finally {
      setActingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Testimonials Moderation</h2>
          <p className="text-muted-foreground mt-1">Approve testimonials before they become visible on the homepage.</p>
        </div>
        <Badge variant="secondary" className="text-xs">
          <Clock3 className="w-3 h-3 mr-1" />
          {pendingCount} pending
        </Badge>
      </div>

      <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              Review Queue
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center w-full md:w-auto">
              <div className="relative w-full sm:w-[280px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search testimonials..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-background/50"
                />
              </div>
              <div className="flex gap-1 rounded-lg border border-border/50 p-1">
                <Button size="sm" variant={statusFilter === "all" ? "default" : "ghost"} onClick={() => setStatusFilter("all")}>
                  All
                </Button>
                <Button size="sm" variant={statusFilter === "pending" ? "default" : "ghost"} onClick={() => setStatusFilter("pending")}>
                  Pending
                </Button>
                <Button size="sm" variant={statusFilter === "approved" ? "default" : "ghost"} onClick={() => setStatusFilter("approved")}>
                  Approved
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 rounded-lg">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-lg">Testimonial</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium text-right rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-muted-foreground">
                      Loading testimonials...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-10 text-center text-muted-foreground">
                      {debouncedSearch
                        ? `No testimonials match "${debouncedSearch}".`
                        : statusFilter === "pending"
                        ? "No pending testimonials — everything is reviewed."
                        : "No testimonials found for this filter."}
                    </td>
                  </tr>
                ) : (
                  rows.map((item) => (
                    <tr key={item.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 align-top max-w-xl">
                        <div className="flex items-center gap-1.5 mb-2">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star
                              key={`${item.id}-${i}`}
                              className={`w-3.5 h-3.5 ${i < item.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/35"}`}
                            />
                          ))}
                          <span className="text-xs text-muted-foreground ml-0.5">{item.rating}/5</span>
                          {item.conversation_id && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 ml-2 opacity-60">
                              Conv: {item.conversation_id.slice(0, 8)}...
                            </Badge>
                          )}
                        </div>
                        <p className="text-foreground/90 line-clamp-3">{item.review}</p>
                        <p className="text-xs text-muted-foreground mt-2">{new Date(item.created_at).toLocaleString()}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="font-medium">{item.display_name || item.user_subscriptions?.full_name || "Anonymous"}</p>
                        <p className="text-xs text-muted-foreground">{item.user_subscriptions?.email || "No email"}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {item.approved ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Approved
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Clock3 className="w-3 h-3 mr-1" /> Pending
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex justify-end gap-2">
                          {!item.approved ? (
                            <Button
                              size="sm"
                              onClick={() => setApproval(item, true)}
                              disabled={actingId === item.id}
                              className="h-8"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setApproval(item, false)}
                              disabled={actingId === item.id}
                              className="h-8"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1" /> Unapprove
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(item)}
                            disabled={actingId === item.id}
                            className="h-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Delete testimonial"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {!loading && totalCount > 0 && (
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>
                Page {page} of {totalPages} ({totalCount} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
