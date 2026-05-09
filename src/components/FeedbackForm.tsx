import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, Mail, MessageCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { dbClient } from "@/integrations/firebase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { feedbackSchema, type FeedbackInput, sanitizeInput } from "@/lib/validation";
import { toast } from "sonner";

type FeedbackType = "general" | "bug" | "feature";

interface FeedbackFormProps {
  type?: FeedbackType;
  onSuccess?: () => void;
}

export function FeedbackForm({ type = "general", onSuccess }: FeedbackFormProps) {
  const navigate = useNavigate();
  const { session } = useAuthSession();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const getMetadataString = (value: unknown): string =>
    typeof value === "string" ? value : "";

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    reset
  } = useForm<FeedbackInput>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      name: "",
      email: "",
      subject: "",
      message: "",
      type: type === "bug" ? "bug" : type === "feature" ? "contact" : "feedback"
    }
  });

  const typeTitles = {
    general: "Send Us Feedback",
    bug: "Report a Bug",
    feature: "Request a Feature",
  };

  const typeDescriptions = {
    general: "We'd love to hear your thoughts and suggestions",
    bug: "Help us identify and fix technical issues",
    feature: "Suggest new features or improvements",
  };

  const typeIcons = {
    general: MessageCircle,
    bug: AlertCircle,
    feature: Mail,
  };

  const IconComponent = typeIcons[type];

  useEffect(() => {
    const user = session?.user;
    if (user?.email) {
      setValue("email", user.email);
    }
    const profileName = getMetadataString(user?.user_metadata?.full_name) ||
      getMetadataString(user?.user_metadata?.name) ||
      "";
    if (profileName) {
      setValue("name", profileName);
    }
  }, [session, setValue]);

  const onFormSubmit = async (formData: FeedbackInput) => {
    setLoading(true);
    try {
      const sessionUserId = session?.user?.id;
      if (!sessionUserId) {
        toast.error("Please login to submit feedback or report issues");
        navigate("/auth");
        return;
      }

      const { error } = await dbClient.from("user_feedback").insert({
        user_id: sessionUserId,
        email: formData.email,
        subject: sanitizeInput(formData.subject),
        message: sanitizeInput(formData.message),
        type: formData.type,
        status: "new",
        priority: type === "bug" ? "high" : "normal",
      });

      if (error) throw error;

      setSubmitted(true);
      toast.success("Thank you! Your feedback has been received");

      // Reset form
      setTimeout(() => {
        reset();
        setSubmitted(false);
        onSuccess?.();
      }, 2000);
    } catch (err) {
      console.error("Failed to submit feedback:", err);
      toast.error("Failed to submit feedback. Please try again");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-2xl mx-auto"
    >
      <div className="bg-card border border-border rounded-xl p-6 sm:p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", damping: 15 }}
            className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 mb-4"
          >
            <IconComponent className="w-6 h-6 text-primary" />
          </motion.div>

          <h2 className="text-2xl sm:text-3xl font-bold mb-2">{typeTitles[type]}</h2>
          <p className="text-muted-foreground">{typeDescriptions[type]}</p>
        </div>

        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4"
            >
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </motion.div>
            <h3 className="text-xl font-semibold mb-2">Thank you!</h3>
            <p className="text-muted-foreground">Your feedback has been received. We'll review it shortly.</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm font-medium mb-1 block">Name *</label>
              <Input
                type="text"
                placeholder="Your name"
                {...register("name")}
                disabled={loading}
                className={errors.name ? "border-destructive" : ""}
              />
              {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
            </div>

            {/* Email */}
            <div>
              <label className="text-sm font-medium mb-1 block">Email *</label>
              <Input
                type="email"
                placeholder="your@email.com"
                {...register("email")}
                disabled={loading}
                className={errors.email ? "border-destructive" : ""}
              />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
            </div>

            {/* Subject */}
            <div>
              <label className="text-sm font-medium mb-1 block">Subject *</label>
              <Input
                type="text"
                placeholder="Brief summary of your feedback"
                {...register("subject")}
                disabled={loading}
                className={errors.subject ? "border-destructive" : ""}
              />
              {errors.subject && <p className="text-xs text-destructive mt-1">{errors.subject.message}</p>}
            </div>

            {/* Message */}
            <div>
              <label className="text-sm font-medium mb-1 block">Message *</label>
              <Textarea
                placeholder={
                  type === "bug"
                    ? "Describe the issue and steps to reproduce..."
                    : type === "feature"
                      ? "Describe the feature or improvement..."
                      : "Tell us your thoughts..."
                }
                {...register("message")}
                rows={5}
                disabled={loading}
                className={`resize-none ${errors.message ? "border-destructive" : ""}`}
              />
              {errors.message && <p className="text-xs text-destructive mt-1">{errors.message.message}</p>}
            </div>

            {/* Submit Button */}
            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={loading || !session?.user?.id}
                className="w-full"
                size="lg"
              >
                {loading ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="inline-block mr-2"
                    >
                      <Send className="w-4 h-4" />
                    </motion.div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    {session?.user?.id ? "Send Feedback" : "Login Required"}
                  </>
                )}
              </Button>
            </div>

            {/* Info */}
            <p className="text-xs text-muted-foreground text-center">
              We read and value all feedback. You'll hear back from us soon.
            </p>
          </form>
        )}
      </div>
    </motion.div>
  );
}
