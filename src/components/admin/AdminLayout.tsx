import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation, Link } from "react-router-dom";
import { Shield, Users, LayoutDashboard, CreditCard, MessageSquare, ChevronLeft, LogOut, Star } from "lucide-react";
import { authClient } from "@/lib/authClient";
import { dbClient } from "@/integrations/firebase/client";
import { toast } from "sonner";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/admin" },
  { icon: Users, label: "Users", href: "/admin/users" },
  { icon: CreditCard, label: "Transactions", href: "/admin/transactions" },
  { icon: MessageSquare, label: "Feedback", href: "/admin/feedback" },
  { icon: Star, label: "Testimonials", href: "/admin/testimonials" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    let isMounted = true;

    const checkAdmin = async () => {
      try {
        const { data: { session } } = await authClient.auth.getSession();
        if (!session?.user) {
          if (isMounted) setLoading(false);
          navigate("/auth");
          return;
        }

        const { data: sub, error } = await dbClient
          .from("user_subscriptions")
          .select("role, full_name, is_banned")
          .eq("user_id", session.user.id)
          .single();

        if (error) {
          const details = (error as any)?.details || "";
          const raw = `${error.message || ""} ${details}`.toLowerCase();
          const missingRoleColumn = raw.includes("role") && raw.includes("does not exist");
          if (missingRoleColumn) {
            toast.error("Admin schema is outdated. Run latest supa.sql migration first.");
            if (isMounted) setLoading(false);
            navigate("/admin-setup");
            return;
          }
        }

        if (error || !sub || sub.is_banned || sub.role !== "admin") {
          toast.error("Unauthorized. Admin access required.");
          if (isMounted) setLoading(false);
          navigate("/slides");
          return;
        }

        if (isMounted) {
          setAdminName(sub.full_name || session.user.email?.split("@")[0] || "Admin");
          setLoading(false);
        }
      } catch {
        if (isMounted) setLoading(false);
        toast.error("Unable to validate admin session.");
        navigate("/slides");
      }
    };

    checkAdmin();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SEOHead title="Admin Dashboard" description="Master Control Panel" path="/admin" noIndex />
      
      {/* Sidebar */}
      <aside className="w-64 border-r border-border/40 bg-card/30 backdrop-blur-xl hidden md:flex md:flex-col">
        <div className="p-6 border-b border-border/40">
          <div className="flex items-center gap-3 text-primary mb-1">
            <Shield className="w-6 h-6" />
            <h1 className="font-bold text-lg tracking-tight">Admin Portal</h1>
          </div>
          <p className="text-xs text-muted-foreground truncate">Welcome, {adminName}</p>
        </div>

        <nav className="flex-1 overflow-y-auto py-6 px-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.href || (item.href !== "/admin" && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                }`}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/40 mt-auto">
          <Button 
            variant="ghost" 
            className="w-full justify-start text-muted-foreground hover:text-foreground gap-2"
            onClick={() => navigate("/slides")}
          >
            <ChevronLeft className="w-4 h-4" />
            Exit Admin
          </Button>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 mt-2 gap-2"
            onClick={async () => {
              const { error } = await authClient.auth.signOut();
              if (error) {
                toast.error("Sign out failed. Please try again.");
                return;
              }
              navigate("/auth");
            }}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px] pointer-events-none" />
        <div className="flex-1 overflow-y-auto p-6 md:p-10 relative z-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
