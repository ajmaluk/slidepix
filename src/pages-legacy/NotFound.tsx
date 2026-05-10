import { Link, useLocation } from "@/lib/navigation";
import { useEffect } from "react";
import { motion } from "framer-motion";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <PageLayout>
      <SEOHead 
        title="404 — Not Found" 
        description="The page you're looking for doesn't exist."
        noIndex
        path="/404" 
      />
      <div className="flex min-h-[70vh] items-center justify-center">
        <div className="text-center max-w-md px-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-6 inline-flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 text-primary"
          >
            <span className="text-4xl font-bold">404</span>
          </motion.div>
          <h1 className="mb-4 text-3xl font-bold tracking-tight">Oops! Page not found</h1>
          <p className="mb-8 text-muted-foreground">
            The page you're looking for doesn't exist or has been moved. 
            Let's get you back on track.
          </p>
          <Button asChild className="gap-2 rounded-2xl h-12 px-8">
            <Link to="/">
              <Home className="w-4 h-4" />
              Return to Home
            </Link>
          </Button>
        </div>
      </div>
    </PageLayout>
  );
};

export default NotFound;
