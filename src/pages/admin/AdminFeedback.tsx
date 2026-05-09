import { useState, useEffect } from "react";
import { MessageSquare, Search, CheckCircle2, Circle, AlertCircle, HelpCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { dbClient } from "@/integrations/firebase/client";
import { toast } from "sonner";

export default function AdminFeedback() {
  const [feedbacks, setFeedbacks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchFeedbacks = async () => {
    try {
      const { data, error } = await dbClient
        .from("user_feedback")
        .select(`
          *,
          user_subscriptions(full_name, email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFeedbacks(data || []);
    } catch (err: any) {
      toast.error("Failed to load feedback");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await dbClient
        .from("user_feedback")
        .update({ status: newStatus })
        .eq("id", id);

      if (error) throw error;
      toast.success("Feedback status updated");
      fetchFeedbacks();
    } catch (err: any) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const filteredFeedbacks = feedbacks.filter(f => 
    (f.message?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (f.user_subscriptions?.full_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (f.user_subscriptions?.email?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bug': return <AlertCircle className="w-4 h-4 text-destructive" />;
      case 'contact': return <HelpCircle className="w-4 h-4 text-blue-500" />;
      default: return <MessageSquare className="w-4 h-4 text-primary" />;
    }
  };

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Feedback</h2>
          <p className="text-muted-foreground mt-1">Review and manage user reports and inquiries.</p>
        </div>
      </div>

      <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-primary" />
              Inbox
            </CardTitle>
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search messages or users..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-background/50"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/50 rounded-lg">
                <tr>
                  <th className="px-4 py-3 font-medium rounded-tl-lg w-10">Type</th>
                  <th className="px-4 py-3 font-medium">Message</th>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium text-right rounded-tr-lg">Action / Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Loading inbox...</td></tr>
                ) : filteredFeedbacks.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground">Inbox is empty.</td></tr>
                ) : (
                  filteredFeedbacks.map((item) => (
                    <tr key={item.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div title={item.type} className="flex justify-center">
                          {getTypeIcon(item.type)}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-md">
                        <p className="line-clamp-2 text-foreground/90 leading-relaxed font-medium">
                          {item.message}
                        </p>
                      </td>
                      <td className="px-4 py-3 font-medium">
                        <div className="flex flex-col">
                          <span>{item.user_subscriptions?.full_name || "Anonymous"}</span>
                          {item.user_subscriptions?.email && (
                            <span className="text-xs text-muted-foreground">{item.user_subscriptions.email}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 text-xs font-semibold gap-2 border border-border/50">
                                {item.status === 'resolved' ? (
                                  <><CheckCircle2 className="w-3 h-3 text-green-500" /> Resolved</>
                                ) : item.status === 'in_progress' ? (
                                  <><Circle className="w-3 h-3 fill-yellow-500 text-yellow-500" /> In Progress</>
                                ) : (
                                  <><Circle className="w-3 h-3 text-muted-foreground" /> Open</>
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleUpdateStatus(item.id, "open")}>Open</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateStatus(item.id, "in_progress")}>In Progress</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleUpdateStatus(item.id, "resolved")}>Resolved</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          <span className="text-xs text-muted-foreground">
                            {new Date(item.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
