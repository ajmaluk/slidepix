// Dalam — AI That Unfolds Like a Petal
import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import ThemeSync from "@/components/ThemeSync";
import CursorGlow from "@/components/shared/CursorGlow";
import FirestoreInit from "./components/FirestoreInit";
import RouteErrorBoundary from "./components/shared/RouteErrorBoundary";

const Home = lazy(() => import("./pages/Home"));
const Auth = lazy(() => import("./pages/Auth"));
const About = lazy(() => import("./pages/About"));
const Pricing = lazy(() => import("./pages/Pricing"));
const ContactUs = lazy(() => import("./pages/ContactUs"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const Slides = lazy(() => import("./pages/Slides"));

const RedirectToSlides = () => <Navigate to="/slides" replace />;

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <ThemeSync />
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CursorGlow />
        <FirestoreInit />
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
          <RouteErrorBoundary routeName="app-routes">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/slides" element={<Slides />} />
            <Route path="/about" element={<About />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/contact" element={<ContactUs />} />
            <Route path="/contact-us" element={<ContactUs />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="*" element={<RedirectToSlides />} />
          </Routes>
          </RouteErrorBoundary>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
