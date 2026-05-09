import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createUserWithEmailAndPassword, fetchSignInMethodsForEmail, getAdditionalUserInfo, GoogleAuthProvider, signInWithEmailAndPassword, signInWithRedirect, getRedirectResult, onAuthStateChanged, signInWithPopup } from "firebase/auth";
import { registrationSchema, loginSchema, type RegistrationInput, type LoginInput } from "@/lib/validation";
import { firebaseAuth } from "@/lib/firebaseClient";
import { clearPendingSignup, resendFirebaseOtpCode, startFirebaseOtpSignup, verifyFirebaseOtpCode } from "@/lib/firebaseOtp";
import { runRoleSyncForUserId } from "@/lib/roleSync";
import { getUserSubscription } from "@/lib/subscription";
import { AgentOrb } from "@/components/AgentOrb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CountryPicker } from "@/components/CountryPicker";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Calendar, Loader2, ArrowLeft, RotateCcw, Chrome, AlertTriangle } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { SEOHead } from "@/components/SEOHead";
import { SignIn, SignUp } from "@clerk/react";

const DEV_ROLE_SYNC_BANNER_KEY = "dalam-dev-role-sync-banner-shown";
const PROVIDER_EMAIL_PASSWORD = import.meta.env.VITE_PROVIDER_EMAIL_PASSWORD !== "false";
const CLERK_ENABLED = Boolean(import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.trim());

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [isLogin, setIsLogin] = useState(() => new URLSearchParams(window.location.search).get("mode") !== "sign-up");
  const [signupStep, setSignupStep] = useState<"form" | "verify">("form");
  const [pendingSignupEmail, setPendingSignupEmail] = useState("");
  const [otpSentToEmail, setOtpSentToEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [devRoleSyncDebug, setDevRoleSyncDebug] = useState<string | null>(null);
  const [googleProfileDraft, setGoogleProfileDraft] = useState<null | {
    userId: string;
    email: string;
    fullName: string;
    dateOfBirth: string;
    country: string;
  }>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [showPopupFallback, setShowPopupFallback] = useState(false);
  const navigate = useNavigate();
  const redirectTarget = new URLSearchParams(window.location.search).get("redirect") || "/slides";
  const authMode = new URLSearchParams(window.location.search).get("mode");

  const devLog = (...args: unknown[]) => {
    if (import.meta.env.DEV) console.log(...args);
  };

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    formState: { errors },
    reset
  } = useForm<RegistrationInput | LoginInput>({
    resolver: zodResolver(isLogin ? loginSchema : registrationSchema),
    defaultValues: {
      email: "",
      password: "",
      date_of_birth: "",
      country: ""
    }
  });

  const formErrors = errors as any;
  const selectedCountry = watch("country" as any);

  const getDisplayNameFromEmail = (email: string) => {
    const localPart = email.split("@")[0] || "User";
    return localPart.replace(/[._-]+/g, " ").trim() || "User";
  };

  const isValidDob = (value: string) => {
    const birthDate = new Date(value);
    if (Number.isNaN(birthDate.getTime())) return false;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age >= 13;
  };

  const syncRoleProfileBestEffort = async (
    userId: string,
    payload: Parameters<typeof runRoleSyncForUserId>[1]
  ) => {
    try {
      const result = await runRoleSyncForUserId(userId, payload);
      if (!result.ok) {
        const failedCollection = result.failedCollection || "unknown";
        const errorMessage = result.error || "Profile sync failed";

        if (import.meta.env.DEV && sessionStorage.getItem(DEV_ROLE_SYNC_BANNER_KEY) !== "1") {
          sessionStorage.setItem(DEV_ROLE_SYNC_BANNER_KEY, "1");
          setDevRoleSyncDebug(`Role sync write failed at ${failedCollection}: ${errorMessage}`);
        }

        throw new Error(errorMessage);
      }
    } catch (error) {
      // Auth completion should not be blocked by profile sync/rules mismatches.
      console.warn("Role/profile sync failed after auth", error);
      toast.error("Signed in, but profile sync to Firestore failed. Check Firestore rules for users and user_subscriptions write access.");
    }
  };

  const checkProfileCompletion = async (userId: string, email: string, currentDisplayName: string) => {
    try {
      const sub = await getUserSubscription(userId);
      if (!sub || !sub.date_of_birth || !sub.country) {
        devLog("Profile incomplete in Firestore. Triggering completion form.");
        setGoogleProfileDraft({
          userId,
          email,
          fullName: sub.full_name || currentDisplayName,
          dateOfBirth: sub.date_of_birth || "",
          country: sub.country || "",
        });
        setValue("date_of_birth" as any, sub.date_of_birth || "");
        setValue("country" as any, sub.country || "");
        return true; // Profile is incomplete
      }
      return false; // Profile is complete
    } catch (error) {
      console.warn("Shared profile integrity check failed", error);
      return false;
    }
  };

  useEffect(() => {
    if (authMode === "sign-up") {
      setIsLogin(false);
    } else if (authMode === "sign-in") {
      setIsLogin(true);
    }
  }, [authMode]);

  useEffect(() => {
    // 1. Listen for background auth state changes (the ultimate source of truth)
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      if (user) {
        devLog("AuthObserver: User detected:", user.email);
        
        // If we have a user but no draft profile is being filled out,
        // it means we are safe to navigate to the slides workspace.
        if (!googleProfileDraft) {
          devLog("AuthObserver: Checking profile completion...");
          checkProfileCompletion(user.uid, user.email || "", user.displayName || "User").then((isIncomplete) => {
            if (!isIncomplete) {
              devLog("AuthObserver: Profile complete. Auto-navigating to slides.");
              navigate(redirectTarget);
            }
          });
        }
      }
      setIsAuthChecking(false);
    });

    // 2. Handle the redirect result when the component mounts after returning from Google
    const handleRedirectResult = async () => {
      try {
        devLog("Checking for Firebase redirect result...");
        const result = await getRedirectResult(firebaseAuth);
        
        if (result) {
          devLog("Successfully captured redirect result:", result.user.email);
          
          const additional = getAdditionalUserInfo(result);
          const providerProfile = (additional?.profile as Record<string, unknown> | null) || null;
          const email = (result.user.email || "").trim().toLowerCase();

          if (!email) {
            throw new Error("Google sign-in did not return an email address");
          }

          const googleBirthDate = typeof providerProfile?.birthdate === "string" ? providerProfile.birthdate.trim() : "";
          const googleLocale = typeof providerProfile?.locale === "string" ? providerProfile.locale.trim() : "";
          const localeCountry = googleLocale.includes("-") ? googleLocale.split("-").pop() || "" : "";
          const displayName = 
            result.user.displayName || 
            (typeof providerProfile?.name === "string" ? providerProfile.name.trim() : "") ||
            getDisplayNameFromEmail(email);

          // If we are missing DOB or Country from Google, check Firestore first
          const emailForCompletion = email;
          const isIncomplete = await checkProfileCompletion(result.user.uid, emailForCompletion, displayName);
          
          if (isIncomplete) {
            toast.info("Complete your profile to finish Google sign-in.");
            return;
          }

          // If Firestore is also missing them, but Google gave us something, we can use it
          if (!googleBirthDate || !localeCountry) {
            setGoogleProfileDraft({
              userId: result.user.uid,
              email: emailForCompletion,
              fullName: displayName,
              dateOfBirth: googleBirthDate,
              country: localeCountry,
            });
            setValue("date_of_birth" as any, googleBirthDate);
            setValue("country" as any, localeCountry);
            toast.info("Complete your profile to finish Google sign-in.");
            return;
          }

          // Otherwise, sync and navigate
          await syncRoleProfileBestEffort(result.user.uid, {
            fullName: displayName,
            email,
            dateOfBirth: googleBirthDate,
            country: localeCountry,
            authProvider: "google",
          });

          toast.success("Google sign-in successful!");
          navigate(redirectTarget);
        } else {
          // If no result is found, check if we were expecting one
          const currentUrl = new Array(window.location.href);
          if (currentUrl.some(url => url.includes("code=") || url.includes("state="))) {
            console.warn("Possible lost redirect state due to cross-site tracking mitigations.");
            // We give it a few seconds for the observer to catch the user before stopping the loader
            setTimeout(() => setIsAuthChecking(false), 2000);
          } else {
            setIsAuthChecking(false);
          }
        }
      } catch (error: any) {
        console.error("Firebase Redirect Capture Error:", {
          code: error?.code,
          message: error?.message,
          originalError: error
        });
        
        setIsAuthChecking(false);

        // Handle a common issue where the redirect state is lost or blocked
        if (error?.code === "auth/internal-error" || error?.code === "auth/network-request-failed") {
          setShowPopupFallback(true);
          toast.error("Auth state lost during redirect. Try 'Retry with Popup' below.");
        } else if (error?.code !== "auth/popup-closed-by-user" && error?.code !== "auth/cancelled-closure-redirect") {
          toast.error(error.message || "Sign-in failed after redirect");
        }
      }
    };

    handleRedirectResult();
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate, setValue, googleProfileDraft]);

  const handleAuth = async (formData: any) => {
    setLoading(true);
    const normalizedEmail = formData.email.trim().toLowerCase();

    try {
      if (isLogin) {
        const credential = await signInWithEmailAndPassword(firebaseAuth, normalizedEmail, formData.password);
        await syncRoleProfileBestEffort(credential.user.uid, {
          fullName: credential.user.displayName || getDisplayNameFromEmail(normalizedEmail),
          email: normalizedEmail,
          authProvider: "password",
        });

        toast.success("Logged in successfully!");
        navigate(redirectTarget);
      } else {
        const signInMethods = await fetchSignInMethodsForEmail(firebaseAuth, normalizedEmail);
        if (signInMethods.length > 0) {
          throw new Error("An account with this email already exists. Please login instead.");
        }

        const registrationData = formData as RegistrationInput;
        const deliveredTo = await startFirebaseOtpSignup({
          email: normalizedEmail,
          password: registrationData.password,
          date_of_birth: registrationData.date_of_birth,
          country: registrationData.country,
        });

        setPendingSignupEmail(normalizedEmail);
        setOtpSentToEmail(deliveredTo || normalizedEmail);
        setVerificationCode("");
        setSignupStep("verify");
        toast.success(`Verification code sent to ${deliveredTo || normalizedEmail}. Enter it to finish creating your account.`);
      }
    } catch (error: any) {
      if (error?.code === "auth/email-already-in-use") {
        toast.error("An account with this email already exists. Please login instead.");
        setIsLogin(true);
        setSignupStep("form");
      } else {
        toast.error(error.message || "An error occurred");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySignup = async () => {
    const code = verificationCode.trim();
    if (code.length < 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }

    setLoading(true);
    try {
      const pending = await verifyFirebaseOtpCode(pendingSignupEmail, code);
      const credential = await createUserWithEmailAndPassword(firebaseAuth, pending.email, pending.password);
      await syncRoleProfileBestEffort(credential.user.uid, {
        fullName: credential.user.displayName || getDisplayNameFromEmail(pending.email),
        email: pending.email,
        dateOfBirth: pending.date_of_birth,
        country: pending.country,
        authProvider: "password",
      });

      clearPendingSignup();
      toast.success("Email verified and account created!");
      setIsLogin(true);
      setSignupStep("form");
      setPendingSignupEmail("");
      setOtpSentToEmail("");
      setVerificationCode("");
      navigate(redirectTarget);
    } catch (error: any) {
      if (error?.code === "auth/email-already-in-use") {
        clearPendingSignup();
        setSignupStep("form");
        setIsLogin(true);
        setPendingSignupEmail("");
        setOtpSentToEmail("");
        setVerificationCode("");
        toast.error("This email is already registered. Please login instead.");
      } else {
        toast.error(error.message || "Invalid verification code");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignupCode = async () => {
    if (!pendingSignupEmail) {
      toast.error("Enter your email again to resend the code");
      return;
    }

    setLoading(true);
    try {
      const deliveredTo = await resendFirebaseOtpCode(pendingSignupEmail);

      setOtpSentToEmail(deliveredTo || pendingSignupEmail);
      toast.success(`A new verification code was sent to ${deliveredTo || pendingSignupEmail}`);
    } catch (error: any) {
      toast.error(error.message || "Unable to resend verification code");
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setSignupStep("form");
    clearPendingSignup();
    setPendingSignupEmail("");
    setOtpSentToEmail("");
    setVerificationCode("");
    setGoogleProfileDraft(null);
    reset();
  };

  const handleGoogleAuth = async (manualUsePopup?: boolean) => {
    setLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ 
        prompt: "select_account",
        display: "popup" 
      });

      // ADAPTIVE STRATEGY:
      // Use popup on localhost (avoids bounce tracking blocks)
      // Use redirect in production (better mobile support)
      const hostname = window.location.hostname;
      const isLocalhost = hostname === "localhost" || 
                         hostname === "127.0.0.1" || 
                         hostname === "0.0.0.0" || 
                         hostname.startsWith("192.168.") || 
                         hostname.startsWith("10.");
      
      const usePopup = manualUsePopup ?? isLocalhost;
      devLog(`Auth Strategy: ${usePopup ? "POPUP" : "REDIRECT"} (Hostname: ${hostname})`);

      if (usePopup) {
        devLog("Triggering Firebase Google Popup Fallback...");
        const result = await signInWithPopup(firebaseAuth, provider);
        
        const additional = getAdditionalUserInfo(result);
        const providerProfile = (additional?.profile as Record<string, unknown> | null) || null;
        const email = (result.user.email || "").trim().toLowerCase();
        if (!email) {
          throw new Error("Google sign-in did not return an email address");
        }

        const googleBirthDate = typeof providerProfile?.birthdate === "string" ? providerProfile.birthdate.trim() : "";
        const googleLocale = typeof providerProfile?.locale === "string" ? providerProfile.locale.trim() : "";
        const localeCountry = googleLocale.includes("-") ? googleLocale.split("-").pop() || "" : "";
        const displayName = result.user.displayName || getDisplayNameFromEmail(email);

        const isIncomplete = await checkProfileCompletion(result.user.uid, email, displayName);
        if (isIncomplete) {
          toast.info("Complete your profile to finish Google sign-in.");
          return;
        }

        if (!googleBirthDate || !localeCountry) {
          await syncRoleProfileBestEffort(result.user.uid, {
            fullName: displayName,
            email,
            authProvider: "google",
          });
          toast.success("Login successful!");
          navigate(redirectTarget);
          return;
        }

        await syncRoleProfileBestEffort(result.user.uid, {
          fullName: displayName,
          email,
          dateOfBirth: googleBirthDate,
          country: localeCountry,
          authProvider: "google",
        });

        toast.success("Login successful!");
        navigate(redirectTarget);
      } else {
        devLog("Triggering Firebase Google Redirect...");
        await signInWithRedirect(firebaseAuth, provider);
      }
    } catch (error: any) {
      console.error("Firebase Auth Trigger Error:", {
        code: error?.code,
        message: error?.message,
        originalError: error
      });

      if (error?.code === "auth/unauthorized-domain") {
        toast.error("Firebase block: Please add 'localhost' to your Authorized Domains in the Firebase Console (Authentication > Settings).");
      } else if (error?.code === "auth/internal-error" || error?.code === "auth/network-request-failed") {
        setShowPopupFallback(true);
        toast.error("Navigation blocked by browser. Please try 'Retry with Popup' or disable tracking protection.");
      } else if (error?.code === "auth/popup-blocked") {
        toast.error("Popup blocked! Please allow popups for this site and try again.");
      } else {
        toast.error(error.message || "Unable to start Google sign-in");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleProfileComplete = async () => {
    if (!googleProfileDraft) return;

    const dateOfBirth = String(getValues("date_of_birth" as any) || googleProfileDraft.dateOfBirth || "").trim();
    const country = String(getValues("country" as any) || googleProfileDraft.country || "").trim();

    if (!dateOfBirth) {
      toast.error("Date of birth is required once for Google sign-in.");
      return;
    }

    if (!isValidDob(dateOfBirth)) {
      toast.error("You must be at least 13 years old.");
      return;
    }

    if (!country) {
      toast.error("Country is required once for Google sign-in.");
      return;
    }

    setLoading(true);
    try {
      await syncRoleProfileBestEffort(googleProfileDraft.userId, {
        fullName: googleProfileDraft.fullName,
        email: googleProfileDraft.email,
        dateOfBirth,
        country,
        authProvider: "google",
      });

      toast.success("Profile completed successfully!");
      setGoogleProfileDraft(null);
      navigate(redirectTarget);
    } finally {
      setLoading(false);
    }
  };

  if (CLERK_ENABLED) {
    return (
      <div className="min-h-screen bg-background">
        <SEOHead
          title="Login or Register — SlidePix"
          description="Sign in or create an account to access SlidePix's presentation generation workflow."
          path="/auth"
          noIndex
        />

        <div className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col px-4 py-6 lg:px-6">
          <div className="grid flex-1 gap-6 lg:grid-cols-[1.08fr_1fr] lg:gap-8">
            <section className="relative overflow-hidden rounded-[2rem] border border-border/40 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.18),_transparent_35%),linear-gradient(180deg,rgba(15,23,42,0.96),rgba(9,10,14,0.98))] p-8 shadow-[0_30px_120px_-64px_rgba(15,23,42,0.75)] lg:p-10">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] opacity-30" />
              <div className="relative z-10 max-w-2xl">
                <div className="inline-flex items-center gap-2 rounded-full border border-border/40 bg-background/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                  SlidePix Studio
                </div>
                <h1 className="mt-6 text-4xl font-black tracking-tight text-foreground md:text-6xl">
                  Sign in. Register.
                  <span className="block bg-gradient-to-r from-sky-300 via-blue-400 to-violet-500 bg-clip-text text-transparent">
                    Start building decks.
                  </span>
                </h1>
                <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground md:text-base">
                  Use your account to save presentations, manage billing, and keep your slide history synced across sessions.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {[
                    "Clerk auth",
                    "Saved history",
                    "Billing-ready",
                  ].map((item) => (
                    <div key={item} className="rounded-2xl border border-border/40 bg-background/10 px-4 py-3 text-sm text-foreground/90 backdrop-blur">
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="grid gap-6">
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="overflow-hidden rounded-[2rem] border border-border/40 bg-card/70 shadow-[0_24px_100px_-54px_rgba(15,23,42,0.65)] backdrop-blur-xl">
                  <div className="border-b border-border/30 px-6 py-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">Login</p>
                    <h2 className="mt-2 text-xl font-semibold">Welcome back</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Access your existing SlidePix workspace.</p>
                  </div>
                  <div className="p-4">
                    <SignIn
                      routing="virtual"
                      signUpUrl="/auth?mode=sign-up"
                      forceRedirectUrl={redirectTarget}
                      fallbackRedirectUrl={redirectTarget}
                    />
                  </div>
                </div>

                <div className="overflow-hidden rounded-[2rem] border border-border/40 bg-card/70 shadow-[0_24px_100px_-54px_rgba(15,23,42,0.65)] backdrop-blur-xl">
                  <div className="border-b border-border/30 px-6 py-5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-muted-foreground">Register</p>
                    <h2 className="mt-2 text-xl font-semibold">Create an account</h2>
                    <p className="mt-1 text-sm text-muted-foreground">Start fresh and save your first presentation.</p>
                  </div>
                  <div className="p-4">
                    <SignUp
                      routing="virtual"
                      signInUrl="/auth?mode=sign-in"
                      forceRedirectUrl={redirectTarget}
                      fallbackRedirectUrl={redirectTarget}
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEOHead 
        title="Login or Register — SlidePix" 
        description="Sign in or create an account to access SlidePix's presentation generation workflow."
        path="/auth"
        noIndex
      />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative"
      >
        {isAuthChecking && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md rounded-xl">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-sm font-medium animate-pulse">Checking your session...</p>
          </div>
        )}
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <AgentOrb agentId="kiran" size="xl" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {isLogin ? "Welcome back" : signupStep === "verify" ? "Verify your email" : "Create an account"}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? "Sign in with Google to access your account"
                : signupStep === "verify"
                  ? `Enter the 6-digit code we sent to ${otpSentToEmail || pendingSignupEmail}`
                  : "Sign up with Google to get started"}
            </CardDescription>
            {import.meta.env.DEV && devRoleSyncDebug && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-500" />
                  <div>
                    <p className="text-xs font-semibold text-amber-600">Dev Debug: Role Sync Write</p>
                    <p className="text-xs text-amber-700/90 break-words">{devRoleSyncDebug}</p>
                  </div>
                </div>
              </div>
            )}
          </CardHeader>
          <form
            onSubmit={
              googleProfileDraft
                ? (event) => {
                    event.preventDefault();
                    void handleGoogleProfileComplete();
                  }
                : isLogin
                ? handleSubmit(handleAuth)
                : signupStep === "form"
                  ? handleSubmit(handleAuth)
                  : (event) => {
                      event.preventDefault();
                      void handleVerifySignup();
                    }
            }
          >
            <CardContent className="space-y-4">
              {googleProfileDraft ? (
                <div className="space-y-4 rounded-2xl border border-border/50 bg-secondary/20 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Complete your Google profile</p>
                    <p className="text-xs text-muted-foreground">
                      Google shared your sign-in, but we still need your date of birth and country one time to finish setup.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="google_date_of_birth">Date of Birth</Label>
                    <div className="relative">
                      <Input
                        id="google_date_of_birth"
                        type="date"
                        {...register("date_of_birth" as any)}
                        required
                        className="bg-background/50 pl-10"
                      />
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>

                  <CountryPicker
                    id="google_country"
                    value={selectedCountry || ""}
                    onChange={(value) => {
                      setValue("country" as any, value, { shouldValidate: true });
                    }}
                    required
                    inputClassName=""
                  />

                  <Button type="button" className="w-full" onClick={handleGoogleProfileComplete} disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving profile...
                      </>
                    ) : (
                      "Continue to Chat"
                    )}
                  </Button>
                </div>
              ) : signupStep === "verify" && !isLogin ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => {
                        setSignupStep("form");
                        setVerificationCode("");
                      }}
                      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      Edit details
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Label>Verification code</Label>
                    <InputOTP maxLength={6} value={verificationCode} onChange={setVerificationCode} containerClassName="justify-center">
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                    <p className="text-xs text-muted-foreground text-center">
                      Check your inbox and spam folder if the code does not appear.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="text-muted-foreground">Need a new code?</div>
                    <button
                      type="button"
                      onClick={handleResendSignupCode}
                      className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Resend code
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="p-4 rounded-lg bg-card/30 border border-border/20 text-center">
                    <p className="text-sm text-muted-foreground">
                      {PROVIDER_EMAIL_PASSWORD
                        ? "Sign in with email/password or continue with Google."
                        : "Access your multi-agent assistant by signing in with Google."}
                    </p>
                  </div>
                  {PROVIDER_EMAIL_PASSWORD && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          autoComplete="email"
                          placeholder="name@example.com"
                          {...register("email" as any)}
                          className={`bg-background/50 ${formErrors.email ? "border-destructive" : ""}`}
                        />
                        {formErrors.email && (
                          <p className="text-xs text-destructive">{formErrors.email.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          autoComplete={isLogin ? "current-password" : "new-password"}
                          placeholder={isLogin ? "Enter your password" : "Create a password"}
                          {...register("password" as any)}
                          className={`bg-background/50 ${formErrors.password ? "border-destructive" : ""}`}
                        />
                        {formErrors.password && (
                          <p className="text-xs text-destructive">{formErrors.password.message}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {PROVIDER_EMAIL_PASSWORD && isLogin && (
                    <div className="flex justify-end -mt-1">
                      <button
                        type="button"
                        onClick={() => navigate(`/reset-password`)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}

                  {!isLogin && signupStep === "form" && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="date_of_birth">Date of Birth</Label>
                        <div className="relative">
                          <Input
                            id="date_of_birth"
                            type="date"
                            {...register("date_of_birth" as any)}
                            required
                            className={`bg-background/50 pl-10 ${formErrors.date_of_birth ? "border-destructive" : ""}`}
                          />
                          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        </div>
                        {formErrors.date_of_birth && (
                          <p className="text-xs text-destructive">{formErrors.date_of_birth.message}</p>
                        )}
                      </div>

                      <CountryPicker
                        id="country"
                        value={selectedCountry || ""}
                        onChange={(value) => {
                          setValue("country" as any, value, { shouldValidate: true });
                        }}
                        required
                        errorMessage={formErrors.country?.message}
                        inputClassName={formErrors.country ? "border-destructive" : ""}
                      />
                    </motion.div>
                  )}
                </>
              )}
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              {signupStep === "form" && !googleProfileDraft && (
                <div className="space-y-4 w-full">
                  {PROVIDER_EMAIL_PASSWORD && (
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {isLogin ? "Signing in..." : "Sending verification code..."}
                        </>
                      ) : (
                        isLogin ? "Sign in with Email" : "Sign up with Email"
                      )}
                    </Button>
                  )}

                  <Button 
                    type="button" 
                    variant={PROVIDER_EMAIL_PASSWORD ? "outline" : "default"} 
                    className="w-full" 
                    onClick={() => handleGoogleAuth()} 
                    disabled={loading}
                  >
                    <Chrome className="mr-2 h-4 w-4" />
                    {isLogin ? "Continue with Google" : "Sign up with Google"}
                  </Button>

                  {showPopupFallback && (
                    <Button 
                      type="button" 
                      variant="secondary" 
                      className="w-full border-dashed border-primary/40 animate-in fade-in slide-in-from-bottom-2 duration-500" 
                      onClick={() => handleGoogleAuth(true)} 
                      disabled={loading}
                    >
                      <Chrome className="mr-2 h-4 w-4" />
                      Retry with Popup
                    </Button>
                  )}
                </div>
              )}
              {signupStep === "form" && !googleProfileDraft && PROVIDER_EMAIL_PASSWORD && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={toggleMode}
                  disabled={loading}
                >
                  {isLogin ? "Need an account? Switch to Sign up" : "Already have an account? Switch to Login"}
                </button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="w-full text-xs"
                onClick={() => navigate("/")}
              >
                Back to home
              </Button>
            </CardFooter>
          </form>
        </Card>
      </motion.div>
    </div>
  );
}
