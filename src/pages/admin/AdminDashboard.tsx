import { useState, useCallback, useEffect } from "react";
import { Users, Activity, RefreshCw, Copy, Wrench, ShieldOff, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { dbClient } from "@/integrations/firebase/client";
import { authClient } from "@/lib/authClient";
import { toast } from "sonner";
import { runRoleSyncForCurrentSession, runRoleSyncForUserId } from "@/lib/roleSync";

type RoleDiagnostics = {
  auth_user_id: string;
  row_exists: boolean;
  role: string | null;
  full_name: string | null;
  tier: string | null;
  is_active: boolean | null;
  subscription_active: boolean | null;
  is_banned: boolean | null;
  updated_at: string | null;
};

type RepairResultState = {
  timestamp: string;
  outcome: string;
};

const LAST_REPAIR_STORAGE_KEY = "dalam:last-role-repair-result";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeSubscriptions: 0,
    expiredSubscriptions: 0,
    bannedUsers: 0,
    totalRevenue: 0,
    recentTransactions: [] as any[]
  });
  const [isRefreshingStats, setIsRefreshingStats] = useState(false);
  const [loading, setLoading] = useState(true);
  const [diagLoading, setDiagLoading] = useState(true);
  const [diagError, setDiagError] = useState<string | null>(null);
  const [diag, setDiag] = useState<RoleDiagnostics | null>(null);
  const [repairLoading, setRepairLoading] = useState(false);
  const [specificRepairLoading, setSpecificRepairLoading] = useState(false);
  const [targetUserId, setTargetUserId] = useState("");
  const [lastRepair, setLastRepair] = useState<RepairResultState | null>(null);

  const fetchRoleDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    setDiagError(null);

    try {
      const {
        data: { session },
      } = await authClient.auth.getSession();

      if (!session?.user?.id) {
        setDiagError("No active session");
        setDiag(null);
        return;
      }

      const userId = session.user.id;

      const { data: sub, error } = await dbClient
        .from("user_subscriptions")
        .select("role, full_name, tier, is_active, subscription_active, is_banned, updated_at")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!sub) {
        setDiag({
          auth_user_id: userId,
          row_exists: false,
          role: null,
          full_name: null,
          tier: null,
          is_active: null,
          subscription_active: null,
          is_banned: null,
          updated_at: null,
        });
        return;
      }

      setDiag({
        auth_user_id: userId,
        row_exists: true,
        role: sub.role,
        full_name: sub.full_name,
        tier: sub.tier,
        is_active: sub.is_active,
        subscription_active: sub.subscription_active,
        is_banned: sub.is_banned,
        updated_at: sub.updated_at,
      });
    } catch (err: any) {
      const message = err?.message || "Failed to fetch role diagnostics";
      setDiagError(message);
      setDiag(null);
    } finally {
      setDiagLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async (silent = false) => {
    if (silent) setIsRefreshingStats(true);
    try {
      const [
        { count: usersCount },
        { count: activeSubs },
        { count: expiredSubs },
        { count: bannedCount },
      ] = await Promise.all([
        dbClient.from("user_subscriptions").select("*", { count: "exact", head: true }),
        dbClient.from("user_subscriptions").select("*", { count: "exact", head: true })
          .neq("tier", "free").eq("subscription_active", true),
        dbClient.from("user_subscriptions").select("*", { count: "exact", head: true })
          .neq("tier", "free").eq("subscription_active", false),
        dbClient.from("user_subscriptions").select("*", { count: "exact", head: true })
          .eq("is_banned", true),
      ]);

      setStats({
        totalUsers: usersCount ?? 0,
        activeSubscriptions: activeSubs ?? 0,
        expiredSubscriptions: expiredSubs ?? 0,
        bannedUsers: bannedCount ?? 0,
        totalRevenue: 0,
        recentTransactions: [],
      });
    } catch (err) {
      console.error("Error fetching admin stats:", err);
    } finally {
      setIsRefreshingStats(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadStoredRepair = () => {
      try {
        const stored = localStorage.getItem(LAST_REPAIR_STORAGE_KEY);
        if (stored) {
          setLastRepair(JSON.parse(stored));
        }
      } catch (e) {
        console.warn("Failed to load stored repair result:", e);
      }
    };
    loadStoredRepair();
    fetchStats();
    fetchRoleDiagnostics();
  }, [fetchStats, fetchRoleDiagnostics]);

  const saveLastRepair = (payload: RepairResultState) => {
    setLastRepair(payload);
    localStorage.setItem(LAST_REPAIR_STORAGE_KEY, JSON.stringify(payload));
  };

  const handleCopyDiagnostics = async () => {
    if (!diag) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      toast.success("Diagnostics copied to clipboard");
    } catch {
      toast.error("Unable to copy diagnostics");
    }
  };

  const handleRunAutoRepairNow = async () => {
    setRepairLoading(true);

    try {
      const result = await runRoleSyncForCurrentSession();

      if (!result.ok) {
        const failureMessage = result.schemaMismatch
          ? `failed: schema mismatch (${result.error})`
          : `failed: ${result.error}`;
        saveLastRepair({
          timestamp: new Date().toISOString(),
          outcome: failureMessage,
        });

        if (result.schemaMismatch) {
          toast.error(`Auto-repair failed due to schema mismatch: ${result.error}`);
        } else {
          toast.error(`Auto-repair failed: ${result.error}`);
        }
        return;
      }

      if (result.created) {
        saveLastRepair({
          timestamp: new Date().toISOString(),
          outcome: `success: created missing role row for ${result.userId}`,
        });
        toast.success(`Auto-repair complete: created missing row for ${result.userId}`);
      } else {
        saveLastRepair({
          timestamp: new Date().toISOString(),
          outcome: "success: role row already healthy",
        });
        toast.success("Auto-repair check complete: role row already healthy.");
      }

      await fetchRoleDiagnostics();
    } catch (err: any) {
      toast.error(err?.message || "Auto-repair failed");
    } finally {
      setRepairLoading(false);
    }
  };

  const handleRunSpecificUserRepair = async () => {
    const userId = targetUserId.trim();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!userId) {
      toast.error("Enter a target user_id first");
      return;
    }
    if (!uuidRegex.test(userId)) {
      toast.error("target user_id must be a valid UUID");
      return;
    }

    setSpecificRepairLoading(true);
    try {
      const result = await runRoleSyncForUserId(userId);

      if (!result.ok) {
        const failureMessage = result.schemaMismatch
          ? `failed: schema mismatch (${result.error})`
          : `failed: ${result.error}`;

        saveLastRepair({
          timestamp: new Date().toISOString(),
          outcome: `target ${userId} -> ${failureMessage}`,
        });

        toast.error(`Specific repair failed for ${userId}: ${result.error}`);
        return;
      }

      if (result.created) {
        saveLastRepair({
          timestamp: new Date().toISOString(),
          outcome: `target ${userId} -> success: created missing role row`,
        });
        toast.success(`Specific repair complete: created missing row for ${userId}`);
      } else {
        saveLastRepair({
          timestamp: new Date().toISOString(),
          outcome: `target ${userId} -> success: role row already healthy`,
        });
        toast.success(`Specific repair complete: role row already healthy for ${userId}`);
      }

      await fetchRoleDiagnostics();
    } catch (err: any) {
      toast.error(err?.message || "Specific repair failed");
    } finally {
      setSpecificRepairLoading(false);
    }
  };

  if (loading) {
    return <div className="animate-pulse space-y-8">
      <div className="h-8 w-48 bg-muted rounded"></div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-xl"></div>)}
      </div>
    </div>;
  }

  return (
    <div className="space-y-8 fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Overview Dashboard</h2>
          <p className="text-muted-foreground mt-1">Key metrics and recent activity across the platform.</p>
        </div>
        <button
          type="button"
          onClick={() => fetchStats(true)}
          disabled={isRefreshingStats}
          className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingStats ? "animate-spin" : ""}`} />
          Refresh stats
        </button>
      </div>

      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.totalUsers}</div>
            {stats.bannedUsers > 0 && (
              <p className="text-xs text-destructive mt-1">{stats.bannedUsers} banned</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Subscriptions</CardTitle>
            <Activity className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.activeSubscriptions}</div>
            {stats.expiredSubscriptions > 0 && (
              <p className="text-xs text-amber-500 mt-1">{stats.expiredSubscriptions} expired</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <TrendingUp className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">${stats.totalRevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">All time, completed</p>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Banned Users</CardTitle>
            <ShieldOff className="w-4 h-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.bannedUsers}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.bannedUsers === 0 ? "No bans active" : `${((stats.bannedUsers / Math.max(stats.totalUsers, 1)) * 100).toFixed(1)}% of users`}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
            <CardDescription>Latest successful payments.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              {stats.recentTransactions.length === 0 ? (
                <div className="text-muted-foreground">No recent transactions.</div>
              ) : (
                stats.recentTransactions.map((tx, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-background/50 p-3 rounded-lg border border-border/30">
                    <div className="space-y-1">
                      <div className="font-medium">{tx.user_subscriptions?.full_name || "Unknown User"}</div>
                      <div className="text-xs text-muted-foreground">{new Date(tx.created_at).toLocaleString()}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="font-bold text-green-500">+${Number(tx.amount).toFixed(2)}</div>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        tx.status === "completed" ? "bg-emerald-500/10 text-emerald-500" :
                        tx.status === "pending" ? "bg-amber-500/10 text-amber-500" :
                        tx.status === "failed" ? "bg-destructive/10 text-destructive" :
                        "bg-muted text-muted-foreground"
                      }`}>{tx.status}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Role Diagnostics</CardTitle>
                <CardDescription>Admin-only support snapshot for current authenticated user.</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunAutoRepairNow}
                  disabled={repairLoading}
                  className="px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Run role-row auto-repair now"
                >
                  <Wrench className={`w-3.5 h-3.5 ${repairLoading ? "animate-pulse" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={fetchRoleDiagnostics}
                  className="px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${diagLoading ? "animate-spin" : ""}`} />
                </button>
                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  disabled={!diag}
                  className="px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 text-[11px] text-muted-foreground">
              Last repair result: {lastRepair
                ? `${new Date(lastRepair.timestamp).toLocaleString()} — ${lastRepair.outcome}`
                : "not attempted yet"}
            </div>
            <div className="mb-4 rounded-lg border border-border/40 p-3 bg-background/40">
              <p className="text-[11px] font-medium text-foreground mb-2">Apply role repair to specific user_id</p>
              <div className="flex items-center gap-2">
                <Input
                  value={targetUserId}
                  onChange={(e) => setTargetUserId(e.target.value)}
                  placeholder="auth user_id (uuid)"
                  className="h-8 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleRunSpecificUserRepair}
                  disabled={specificRepairLoading}
                  className="h-8 text-xs"
                >
                  {specificRepairLoading ? "Applying..." : "Apply"}
                </Button>
              </div>
            </div>
            {diagLoading ? (
              <p className="text-sm text-muted-foreground">Loading diagnostics...</p>
            ) : diagError ? (
              <p className="text-sm text-destructive">{diagError}</p>
            ) : diag ? (
              <div className="space-y-2 text-xs">
                <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">auth_user_id</span><span className="font-mono">{diag.auth_user_id}</span></div>
                <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">row_exists</span><span>{String(diag.row_exists)}</span></div>
                <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">role</span><span>{diag.role ?? "null"}</span></div>
                <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">full_name</span><span>{diag.full_name ?? "null"}</span></div>
                <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">tier</span><span>{diag.tier ?? "null"}</span></div>
                <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">is_active</span><span>{String(diag.is_active)}</span></div>
                <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">subscription_active</span><span>{String(diag.subscription_active)}</span></div>
                <div className="flex justify-between border-b border-border/30 pb-1"><span className="text-muted-foreground">is_banned</span><span>{String(diag.is_banned)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">updated_at</span><span className="font-mono">{diag.updated_at ?? "null"}</span></div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No diagnostics available.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
