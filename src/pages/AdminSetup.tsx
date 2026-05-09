import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Loader2, KeyRound, Mail, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { authClient } from "@/lib/authClient";
import { dbClient } from "@/integrations/firebase/client";
import { EdgeFunctionError, invokeEdgeFunction } from "@/lib/edgeFunctions";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";

export default function AdminSetup() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: ""
  });
  useEffect(() => {
    // If a privileged identity already exists for this session, go directly
    // to its dashboard instead of re-running setup.
    authClient.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user) return;

      const { data: sub } = await dbClient
        .from("user_subscriptions")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (sub?.role === "admin") {
        toast.success("Admin account detected. Redirecting to dashboard.");
        navigate("/admin");
        return;
      }

      navigate("/slides");
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.fullName || !formData.email || !formData.password) {
      toast.error("All fields are required");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await invokeEdgeFunction<{ success: boolean }>(
        "admin-create-user",
        {
          fullName: formData.fullName.trim(),
          email: formData.email.trim().toLowerCase(),
          password: formData.password,
          role: "admin",
        }
      );

      toast.success("Admin account created successfully!");
      navigate("/auth");
    } catch (err: any) {
      const raw = String(err?.message || "").toLowerCase();
      if (err instanceof EdgeFunctionError && err.status === 404) {
        toast.error("Admin setup service is not deployed yet. Deploy function: admin-create-user.");
      } else if (raw.includes("already") || raw.includes("exists")) {
        toast.error("This account already exists. Sign in normally and follow role redirect.");
      } else {
        toast.error(err?.message || "An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageLayout>
      <SEOHead title="Admin Setup — Master Controller Initialization" description="Secure initialization of the management platform." path="/admin-setup" noIndex />
      <div className="min-h-[80vh] flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:32px_32px]" />
        <Card className="w-full max-w-md relative z-10 border-primary/20 bg-card/50 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-3 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl mx-auto flex items-center justify-center border border-primary/20">
              <Shield className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">Master Admin Setup</CardTitle>
            <CardDescription>
              Initialize the organizational hierarchy.
              Provide your details to securely bootstrap the root account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      placeholder="Director of Operations"
                      className="pl-10 bg-background/50"
                      value={formData.fullName}
                      onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
                      disabled={loading}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="admin@organization.com"
                      className="pl-10 bg-background/50"
                      value={formData.email}
                      onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                      disabled={loading}
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Secure Password</Label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      placeholder="••••••••••••"
                      className="pl-10 bg-background/50"
                      value={formData.password}
                      onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Provisioning Root Access...
                  </>
                ) : (
                  "Create Master Admin"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
