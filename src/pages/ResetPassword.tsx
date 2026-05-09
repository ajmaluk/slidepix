import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock, Mail, ArrowLeft, RotateCcw } from "lucide-react";
import { fetchSignInMethodsForEmail } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebaseClient";
import { passwordResetSchema, resetPasswordRequestSchema, type PasswordResetInput, type ResetPasswordRequestInput } from "@/lib/validation";
import {
  clearPendingForgotPassword,
  completeFirebaseForgotPasswordWithOtp,
  resendFirebaseForgotPasswordOtp,
  startFirebaseForgotPasswordOtp,
  verifyFirebaseForgotPasswordOtp,
} from "@/lib/firebaseOtp";
import { SEOHead } from "@/components/SEOHead";
import { AgentOrb } from "@/components/AgentOrb";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import { motion } from "framer-motion";

type ResetStep = "email" | "otp" | "password";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<ResetStep>("email");
  const [loading, setLoading] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpSentToEmail, setOtpSentToEmail] = useState("");
  const [verificationCode, setVerificationCode] = useState("");

  const requestForm = useForm<ResetPasswordRequestInput>({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: {
      email: "",
    },
  });

  const passwordForm = useForm<PasswordResetInput>({
    resolver: zodResolver(passwordResetSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const pageTitle = useMemo(() => {
    if (step === "email") return "Forgot password";
    if (step === "otp") return "Verify reset code";
    return "Set a new password";
  }, [step]);

  const pageDescription = useMemo(
    () => {
      if (step === "email") return "Enter your account email to continue";
      if (step === "otp") return `Enter the 6-digit code sent to ${otpSentToEmail || pendingEmail}`;
      return "Choose your new password and confirm";
    },
    [otpSentToEmail, pendingEmail, step],
  );

  const handleRequestReset = async (values: ResetPasswordRequestInput) => {
    const normalizedEmail = values.email.trim().toLowerCase();
    setLoading(true);

    try {
      const signInMethods = await fetchSignInMethodsForEmail(firebaseAuth, normalizedEmail);
      if (signInMethods.length === 0) {
        toast.error("User does not exist with this email");
        return;
      }

      const deliveredTo = await startFirebaseForgotPasswordOtp(normalizedEmail);
      setPendingEmail(normalizedEmail);
      setOtpSentToEmail(deliveredTo || normalizedEmail);
      setVerificationCode("");
      setStep("otp");
      toast.success(`OTP code sent to ${deliveredTo || normalizedEmail}`);
    } catch (error: any) {
      toast.error(error?.message || "Unable to continue password reset");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = verificationCode.trim();
    if (code.length < 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }

    setLoading(true);
    try {
      await verifyFirebaseForgotPasswordOtp(pendingEmail, code);
      setStep("password");
      toast.success("OTP verified. Set your new password.");
    } catch (error: any) {
      toast.error(error?.message || "Invalid verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setLoading(true);
    try {
      const deliveredTo = await resendFirebaseForgotPasswordOtp(pendingEmail);
      setOtpSentToEmail(deliveredTo || pendingEmail);
      toast.success(`A new OTP code was sent to ${deliveredTo || pendingEmail}`);
    } catch (error: any) {
      toast.error(error?.message || "Unable to resend OTP code");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (values: PasswordResetInput) => {
    setLoading(true);
    try {
      await completeFirebaseForgotPasswordWithOtp(pendingEmail, values.password);

      passwordForm.reset();
      clearPendingForgotPassword();
      toast.success("Password updated successfully");
      navigate("/auth");
    } catch (error: any) {
      toast.error(error?.message || "Unable to update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEOHead
        title="Reset Password"
        description="Reset or change your SlidePix password securely."
        path="/reset-password"
        noIndex
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        <Card className="border-border/40 bg-card/50 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-4">
              <AgentOrb agentId="kiran" size="xl" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {pageTitle}
            </CardTitle>
            <CardDescription>{pageDescription}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-5">
            {step === "email" && (
              <form onSubmit={requestForm.handleSubmit(handleRequestReset)} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      {...requestForm.register("email")}
                      className={requestForm.formState.errors.email ? "border-destructive pr-10" : "pr-10"}
                    />
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                  {requestForm.formState.errors.email && (
                    <p className="text-xs text-destructive">{requestForm.formState.errors.email.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={requestForm.formState.isSubmitting || loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Checking...
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </form>
            )}

            {step === "otp" && (
              <div className="space-y-5">
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setPendingEmail("");
                    setOtpSentToEmail("");
                    setVerificationCode("");
                    clearPendingForgotPassword();
                  }}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Edit email
                </button>

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

                <Button type="button" className="w-full" disabled={loading} onClick={handleVerifyOtp}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Verify"
                  )}
                </Button>

                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={handleResendCode}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Resend code
                  </button>
                </div>
              </div>
            )}

            {step === "password" && (
              <form onSubmit={passwordForm.handleSubmit(handleUpdatePassword)} className="space-y-5">
                <button
                  type="button"
                  onClick={() => setStep("otp")}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to OTP
                </button>

                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter a new password"
                      {...passwordForm.register("password")}
                      className={passwordForm.formState.errors.password ? "border-destructive pr-10" : "pr-10"}
                    />
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                  {passwordForm.formState.errors.password && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.password.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Re-enter your new password"
                    {...passwordForm.register("confirmPassword")}
                    className={passwordForm.formState.errors.confirmPassword ? "border-destructive" : ""}
                  />
                  {passwordForm.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{passwordForm.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={passwordForm.formState.isSubmitting || loading}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit"
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                clearPendingForgotPassword();
                navigate("/auth");
              }}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                clearPendingForgotPassword();
                navigate("/");
              }}
            >
              Back to home
            </Button>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}
