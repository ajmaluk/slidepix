import { useState, useEffect } from "react";
import { Users, ShieldAlert, ShieldCheck, UserPlus, MoreVertical, Ban, CheckCircle2, CreditCard, CalendarDays, RefreshCw, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { dbClient } from "@/integrations/firebase/client";
import { authClient } from "@/lib/authClient";
import { EdgeFunctionError, invokeEdgeFunction } from "@/lib/edgeFunctions";
import { toast } from "sonner";

type UserRole = "admin" | "user";
type SubscriptionTier = "free" | "basic" | "pro" | "enterprise";

type UserSub = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  tier: SubscriptionTier;
  is_banned: boolean;
  auto_renew: boolean;
  plan_duration_days: number;
  last_login: string | null;
  created_at: string;
  subscription_expires_at: string | null;
};

interface PlanFormData {
  tier: SubscriptionTier;
  durationDays: number;
  autoRenew: boolean;
  reason: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserSub[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Plan Assignment State
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planTarget, setPlanTarget] = useState<UserSub | null>(null);
  const [isAssigningPlan, setIsAssigningPlan] = useState(false);
  const [planForm, setPlanForm] = useState<PlanFormData>({
    tier: "free",
    durationDays: 30,
    autoRenew: false,
    reason: "",
  });

  // Create User Form State
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "user" as UserRole
  });

  const fetchUsers = async (silent = false) => {
    if (silent) setIsRefreshing(true);
    try {
      const { data, error } = await dbClient
        .from("user_subscriptions")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load users");
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleToggleBan = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await dbClient
        .from("user_subscriptions")
        .update({ is_banned: !currentStatus })
        .eq("user_id", userId);

      if (error) throw error;
      toast.success(`User ${currentStatus ? "unbanned" : "banned"} successfully`);
      fetchUsers(true);
    } catch (err) {
      toast.error(err.message || "Failed to update ban status");
    }
  };

  const openPlanModal = (user: UserSub) => {
    setPlanTarget(user);
    setPlanForm({
      tier: (user.tier as SubscriptionTier) || "free",
      durationDays: user.plan_duration_days ?? 30,
      autoRenew: user.auto_renew ?? false,
      reason: "",
    });
    setIsPlanModalOpen(true);
  };

  const handleAssignPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTarget) return;

    const duration = Math.max(1, Math.round(planForm.durationDays));
    if (!Number.isFinite(duration)) {
      toast.error("Duration must be a positive number");
      return;
    }

    setIsAssigningPlan(true);
    try {
      const { error } = await dbClient.rpc("set_user_subscription_plan", {
        target_user_id: planTarget.user_id,
        new_tier: planForm.tier,
        duration_days: duration,
        enable_auto_renew: planForm.autoRenew,
        reason: planForm.reason.trim() || null,
      });
      if (error) throw error;
      toast.success(`Plan updated to ${planForm.tier} for ${planTarget.full_name || planTarget.user_id}`);
      setIsPlanModalOpen(false);
      fetchUsers(true);
    } catch (err) {
      toast.error(err.message || "Failed to assign plan");
    } finally {
      setIsAssigningPlan(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: UserRole) => {
    try {
      const { error } = await dbClient
        .from("user_subscriptions")
        .update({ role: newRole })
        .eq("user_id", userId);

      if (error) throw error;
      toast.success(`User role updated to ${newRole}`);
      fetchUsers(true);
    } catch (err) {
      toast.error(err.message || "Failed to change role");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedFullName = formData.fullName.trim();
    const normalizedEmail = formData.email.trim().toLowerCase();

    if (!normalizedFullName || !normalizedEmail || !formData.password || !formData.role) {
      toast.error("All fields are required");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      toast.error("Enter a valid email address");
      return;
    }

    if (formData.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsCreating(true);
    try {
      const { data: { session } } = await authClient.auth.getSession();
      if (!session?.access_token) throw new Error("No active admin session");

      await invokeEdgeFunction<{ success: boolean }>(
        "admin-create-user",
        {
          fullName: normalizedFullName,
          email: normalizedEmail,
          password: formData.password,
          role: formData.role,
        }
      );

      toast.success(`${formData.role} created successfully!`);
      setIsCreateModalOpen(false);
      setFormData({ fullName: "", email: "", password: "", role: "user" });
      fetchUsers(true);
    } catch (err) {
      if (err instanceof EdgeFunctionError && err.status === 404) {
        toast.error("User provisioning service is not deployed yet. Deploy function: admin-create-user.");
        return;
      }
      toast.error(err.message || "An error occurred during user creation");
    } finally {
      setIsCreating(false);
    }
  };

  const filteredUsers = users.filter(u =>
    (u.full_name?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (u.email?.toLowerCase() || "").includes(search.toLowerCase()) ||
    (u.user_id?.toLowerCase() || "").includes(search.toLowerCase())
  );

  const bannedCount = users.filter(u => u.is_banned).length;
  const paidCount = users.filter(u => u.tier !== "free").length;

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-muted-foreground mt-1">Manage accounts and access controls.</p>
          {!loading && (
            <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{users.length} total</span>
              {paidCount > 0 && <span className="text-primary">{paidCount} paid</span>}
              {bannedCount > 0 && <span className="text-destructive">{bannedCount} banned</span>}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fetchUsers(true)}
            disabled={isRefreshing}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-all disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
          <Button onClick={() => setIsCreateModalOpen(true)} className="gap-2">
            <UserPlus className="w-4 h-4" />
            Provision User
          </Button>
        </div>
      </div>

      <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle>System Directory</CardTitle>
            <div className="relative w-full sm:w-72">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, email or ID..."
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
                  <th className="px-4 py-3 font-medium rounded-tl-lg">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Plan</th>
                  <th className="px-4 py-3 font-medium hidden lg:table-cell">Last Login</th>
                  <th className="px-4 py-3 font-medium">Joined</th>
                  <th className="px-4 py-3 font-medium text-right rounded-tr-lg">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading directory...</td></tr>
                ) : filteredUsers.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">{search ? "No users match your search." : "No users found."}</td></tr>
                ) : (
                  filteredUsers.map((user) => (
                    <tr key={user.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <div className="flex flex-col gap-0.5">
                          <span>{user.full_name || "Unknown"}</span>
                          {user.email && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="w-3 h-3" />{user.email}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground/60 font-mono" title={user.user_id}>{user.user_id.slice(0, 8)}…</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={user.role === "admin" ? "default" : "outline"}
                          className="capitalize"
                        >
                          {user.role}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {user.is_banned ? (
                          <Badge variant="destructive" className="gap-1.5"><Ban className="w-3 h-3"/> Banned</Badge>
                        ) : (
                          <Badge variant="outline" className="border-green-500/30 text-green-500 gap-1.5"><CheckCircle2 className="w-3 h-3"/> Active</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <Badge variant={user.tier === 'free' ? 'outline' : 'default'} className="capitalize bg-primary/10 text-primary border-primary/20 w-fit">
                            {user.tier}
                          </Badge>
                          {user.subscription_expires_at && user.tier !== 'free' && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CalendarDays className="w-3 h-3" />
                              {new Date(user.subscription_expires_at) < new Date()
                                ? <span className="text-destructive font-medium">Expired</span>
                                : new Date(user.subscription_expires_at).toLocaleDateString()
                              }
                            </span>
                          )}
                          {user.auto_renew && user.tier !== 'free' && (
                            <span className="text-xs text-emerald-500">Auto-renew on</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                        {user.last_login
                          ? new Date(user.last_login).toLocaleDateString()
                          : <span className="text-muted-foreground/40">Never</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Change Access</div>
                            <DropdownMenuItem onClick={() => handleChangeRole(user.user_id, "admin")} disabled={user.role === "admin"}>Make Admin</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangeRole(user.user_id, "user")} disabled={user.role === "user"}>Make User</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openPlanModal(user)}>
                              <CreditCard className="w-4 h-4 mr-2" /> Assign Plan
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {user.is_banned ? (
                              <DropdownMenuItem onClick={() => handleToggleBan(user.user_id, true)} className="text-green-500">
                                <ShieldCheck className="w-4 h-4 mr-2" /> Unban User
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem onClick={() => handleToggleBan(user.user_id, false)} className="text-destructive">
                                <ShieldAlert className="w-4 h-4 mr-2" /> Ban User
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Plan Assignment Dialog */}
      <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
        <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle>Assign Subscription Plan</DialogTitle>
            <DialogDescription>
              Set the plan tier, duration, and auto-renew for{" "}
              <span className="font-medium text-foreground">
                {planTarget?.full_name || planTarget?.user_id}
              </span>.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAssignPlan} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="planTier">Tier</Label>
              <Select
                value={planForm.tier}
                onValueChange={(v) => setPlanForm({ ...planForm, tier: v as SubscriptionTier })}
                disabled={isAssigningPlan}
              >
                <SelectTrigger id="planTier">
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="free">Free</SelectItem>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {planForm.tier !== "free" && (
              <div className="space-y-2">
                <Label htmlFor="planDuration">Duration (days)</Label>
                <Input
                  id="planDuration"
                  type="number"
                  min={1}
                  max={3650}
                  value={planForm.durationDays}
                  onChange={(e) =>
                    setPlanForm({ ...planForm, durationDays: parseInt(e.target.value, 10) || 30 })
                  }
                  disabled={isAssigningPlan}
                  className="bg-background/50"
                />
                <p className="text-xs text-muted-foreground">
                  Expires:{" "}
                  {new Date(
                    Date.now() + planForm.durationDays * 86_400_000
                  ).toLocaleDateString(undefined, { dateStyle: "medium" })}
                </p>
              </div>
            )}
            {planForm.tier !== "free" && (
              <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2">
                <div className="space-y-0.5">
                  <Label htmlFor="autoRenew" className="text-sm cursor-pointer">
                    Auto-renew
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically renew at the same duration when plan expires
                  </p>
                </div>
                <Switch
                  id="autoRenew"
                  checked={planForm.autoRenew}
                  onCheckedChange={(v) => setPlanForm({ ...planForm, autoRenew: v })}
                  disabled={isAssigningPlan}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="planReason">Reason (optional)</Label>
              <Input
                id="planReason"
                placeholder="e.g. Trial extension, partner deal..."
                value={planForm.reason}
                onChange={(e) => setPlanForm({ ...planForm, reason: e.target.value })}
                disabled={isAssigningPlan}
                className="bg-background/50"
              />
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsPlanModalOpen(false)}
                disabled={isAssigningPlan}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isAssigningPlan}>
                {isAssigningPlan ? "Assigning..." : "Assign Plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
        <DialogContent className="sm:max-w-md bg-background/95 backdrop-blur-xl border-border/50">
          <DialogHeader>
            <DialogTitle>Provision Account</DialogTitle>
            <DialogDescription>
              Create a new user or admin directly in the system.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input id="fullName" placeholder="Jane Doe" value={formData.fullName} onChange={(e) => setFormData({...formData, fullName: e.target.value})} disabled={isCreating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input id="email" type="email" placeholder="jane@example.com" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} disabled={isCreating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Temporary Password</Label>
              <Input id="password" type="password" placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} disabled={isCreating} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Account Role</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({...formData, role: v as UserRole})} disabled={isCreating}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="pt-4">
              <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)} disabled={isCreating}>Cancel</Button>
              <Button type="submit" disabled={isCreating}>{isCreating ? "Provisioning..." : "Create Account"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
