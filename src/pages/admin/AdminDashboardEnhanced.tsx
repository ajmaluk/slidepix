import { useState, useEffect } from "react";
import { Users, CreditCard, Activity, TrendingUp, Flag, MessageSquare, Zap, BarChart3, Settings } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { dbClient } from "@/integrations/firebase/client";
import { toast } from "sonner";
import { UserCircle } from "lucide-react";

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    bannedUsers: 0,
    activeSubscriptions: 0,
    totalRevenue: "$0.00",
    newRevenueToday: "$0.00",
    newFeedback: 0,
    openIssues: 0,
    avgRating: 0,
    tasksCompleted: 0,
    serverStatus: "online",
    uptime: "99.9%"
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        // Fetch total users
        const { count: usersCount } = await dbClient
          .from("user_subscriptions")
          .select("*", { count: "exact", head: true });

        // Fetch active users
        const { count: activeCount } = await dbClient
          .from("user_subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("is_active", true);

        // Fetch banned users
        const { count: bannedCount } = await dbClient
          .from("user_subscriptions")
          .select("*", { count: "exact", head: true })
          .eq("is_banned", true);

        // Fetch active subscriptions
        const { count: activeSubs } = await dbClient
          .from("user_subscriptions")
          .select("*", { count: "exact", head: true })
          .neq("tier", "free")
          .eq("subscription_active", true);

        // Fetch total revenue
        const { data: txs } = await dbClient
          .from("transactions")
          .select("amount")
          .eq("status", "completed");

        const revenue = txs?.reduce((acc, tx) => acc + Number(tx.amount), 0) || 0;

        // Fetch today's revenue
        const todayStart = new Date().toISOString().split('T')[0];
        const { data: todayTxs } = await dbClient
          .from("transactions")
          .select("amount")
          .eq("status", "completed")
          .gte("created_at", todayStart);

        const todayRevenue = todayTxs?.reduce((acc, tx) => acc + Number(tx.amount), 0) || 0;

        // Fetch new feedback
        const { count: feedbackCount } = await dbClient
          .from("user_feedback")
          .select("*", { count: "exact", head: true })
          .eq("status", "new");

        // Fetch open issue reports
        const { count: issuesCount } = await dbClient
          .from("issue_reports")
          .select("*", { count: "exact", head: true })
          .eq("status", "open");

        // Fetch average rating
        const { data: ratingData } = await dbClient
          .from("user_ratings")
          .select("rating")
          .limit(100);

        const avgRating = ratingData && ratingData.length > 0
          ? ratingData.reduce((a, b) => a + b.rating, 0) / ratingData.length
          : 0;

        // Fetch completed tasks
        const { count: tasksCount } = await dbClient
          .from("tasks")
          .select("*", { count: "exact", head: true })
          .eq("status", "done");

        // Fetch server status (latest heartbeat)
        const { data: serverData } = await dbClient
          .from("server_status_logs")
          .select("status, uptime_percentage")
          .order("created_at", { ascending: false })
          .limit(1);

        const serverStatus = serverData?.[0]?.status || "online";
        const uptime = `${Number(serverData?.[0]?.uptime_percentage ?? 99.9).toFixed(1)}%`;

        setStats({
          totalUsers: usersCount || 0,
          activeUsers: activeCount || 0,
          bannedUsers: bannedCount || 0,
          activeSubscriptions: activeSubs || 0,
          totalRevenue: `$${revenue.toFixed(2)}`,
          newRevenueToday: `$${todayRevenue.toFixed(2)}`,
          newFeedback: feedbackCount || 0,
          openIssues: issuesCount || 0,
          avgRating,
          tasksCompleted: tasksCount || 0,
          serverStatus,
          uptime,
        });
      } catch (err: unknown) {
        const error = err as Error;
        console.error("Failed to fetch dashboard:", error);
        toast.error("Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
    const interval = setInterval(fetchDashboard, 60000);
    return () => clearInterval(interval);
  }, []);

  interface StatCardProps {
    icon: any; // Lucide icon type
    label: string;
    value: string | number;
    subtext?: string;
    trend?: string;
    color: string;
  }

  const StatCard = ({ icon: Icon, label, value, subtext, trend, color }: StatCardProps) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-2">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
          </div>
          <div className={`p-3 rounded-lg ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
        </div>
        {trend && (
          <div className="flex items-center mt-4 text-green-600 text-sm">
            <TrendingUp className="w-4 h-4 mr-1" />
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Admin Dashboard</h2>
        <p className="text-muted-foreground">System Overview & Management</p>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={stats.totalUsers}
          subtext={`${stats.activeUsers} active`}
          color="bg-blue-500"
        />
        <StatCard
          icon={UserCircle}
          label="Banned Users"
          value={stats.bannedUsers}
          color="bg-red-500"
        />
        <StatCard
          icon={CreditCard}
          label="Total Revenue"
          value={stats.totalRevenue}
          subtext={`Today: ${stats.newRevenueToday}`}
          color="bg-green-500"
        />
        <StatCard
          icon={Activity}
          label="Active Subscriptions"
          value={stats.activeSubscriptions}
          color="bg-purple-500"
        />
      </div>

      {/* System Health & Feedback */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={Zap}
          label="Server Status"
          value={stats.serverStatus.toUpperCase()}
          subtext={`Uptime: ${stats.uptime}`}
          color="bg-emerald-500"
        />
        <StatCard
          icon={MessageSquare}
          label="New Feedback"
          value={stats.newFeedback}
          subtext="Pending responses"
          color="bg-amber-500"
        />
        <StatCard
          icon={Flag}
          label="Open Issues"
          value={stats.openIssues}
          subtext="Need resolution"
          color="bg-orange-500"
        />
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Performance Metrics
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span>Tasks Completed</span>
              <span className="font-bold text-green-600">{stats.tasksCompleted}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Average Rating</span>
              <span className="font-bold text-yellow-600">⭐ {stats.avgRating}/5.0</span>
            </div>
            <div className="flex justify-between items-center">
              <span>System Uptime</span>
              <span className="font-bold text-emerald-600">{stats.uptime}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start">
              View All Users
            </Button>
            <Button variant="outline" className="w-full justify-start">
              Recent Transactions
            </Button>
            <Button variant="outline" className="w-full justify-start">
              System Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
