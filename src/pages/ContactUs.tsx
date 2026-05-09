import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Send, MessageSquare, AlertCircle, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { dbClient } from "@/integrations/firebase/client";
import { feedbackSchema, type FeedbackInput, sanitizeInput } from "@/lib/validation";
import { toast } from "sonner";
import { SEOHead } from "@/components/SEOHead";
import PageLayout from "@/components/shared/PageLayout";

export default function ContactUs() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getMetadataString = (value: unknown): string =>
    typeof value === "string" ? value : "";

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset
  } = useForm<FeedbackInput>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      type: "contact",
      subject: "",
      message: "",
      name: "User", // Fallback, will be updated from session
      email: ""
    }
  });

  const selectedType = watch("type");

  useEffect(() => {
    dbClient.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user;
      if (user) {
        if (user.email) setValue("email", user.email);
        const profileName = getMetadataString(user.user_metadata?.full_name) ||
          getMetadataString(user.user_metadata?.name) ||
          "";
        if (profileName) setValue("name", profileName);
      }
    });
  }, [setValue]);

  const onFormSubmit = async (formData: FeedbackInput) => {
    setIsSubmitting(true);
    try {
      const { data: { session } } = await dbClient.auth.getSession();
      if (!session?.user) {
        toast.error("Please login to submit feedback or report issues");
        navigate("/auth");
        return;
      }
      
      const { error } = await dbClient
        .from("user_feedback")
        .insert({
          user_id: session.user.id,
          type: formData.type as any,
          subject: sanitizeInput(formData.subject),
          message: sanitizeInput(formData.message),
          email: formData.email,
          status: "new"
        });

      if (error) throw error;
      
      toast.success("Thank you! Your message has been received.");
      reset();
    } catch (err: unknown) {
      const error = err as Error;
      toast.error(error.message || "Failed to submit form");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageLayout>
      <SEOHead 
        title="Contact Us & Feedback — Connect with SlidePix" 
        description="Have a question, feedback, or need support? Our team is here to help you get the most out of SlidePix. Reach out to us today." 
        path="/contact"
        keywords="contact SlidePix, presentation support, feedback, customer service"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Contact Us", url: "/contact" }
        ]}
        jsonLd={{
          "@type": "ContactPage",
          "name": "SlidePix Contact Us",
          "description": "The official contact page for SlidePix support and feedback.",
          "mainEntity": {
            "@type": "Organization",
            "name": "SlidePix",
            "email": "contact.uthakkan@gmail.com",
            "url": "https://dalam.pixtool.in"
          }
        }}
      />
      
      <main className="container max-w-2xl pt-24 pb-20 px-4">
        <div className="space-y-2 mb-8 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Contact Us</h1>
      <p className="text-muted-foreground">We'd love to hear from you. Select a category below.</p>
        </div>

        <Card className="bg-card/40 border-border/50 backdrop-blur-sm">
          <form onSubmit={handleSubmit(onFormSubmit)}>
            <CardHeader>
              <CardTitle>Send a Message</CardTitle>
              <CardDescription>
                Your feedback helps us improve. Submissions are reviewed by our team.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>What is this regarding?</Label>
                <RadioGroup 
                  value={selectedType} 
                  onValueChange={(val: any) => setValue("type", val)}
                  className="grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                  <div>
                    <RadioGroupItem value="contact" id="contact" className="peer sr-only" />
                    <Label
                      htmlFor="contact"
                      className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                    >
                      <HelpCircle className="mb-3 h-6 w-6" />
                      General
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="feedback" id="feedback" className="peer sr-only" />
                    <Label
                      htmlFor="feedback"
                      className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                    >
                      <MessageSquare className="mb-3 h-6 w-6" />
                      Feedback
                    </Label>
                  </div>
                  <div>
                    <RadioGroupItem value="bug" id="bug" className="peer sr-only" />
                    <Label
                      htmlFor="bug"
                      className="flex flex-col items-center justify-between rounded-xl border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-all"
                    >
                      <AlertCircle className="mb-3 h-6 w-6" />
                      Bug Report
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input 
                  id="subject"
                  placeholder="What's this about?" 
                  {...register("subject")}
                  className={errors.subject ? "border-destructive" : ""}
                />
                {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message</Label>
                <Textarea 
                  id="message"
                  placeholder="Tell us more..." 
                  className={`min-h-[150px] ${errors.message ? "border-destructive" : ""}`}
                  {...register("message")}
                />
                {errors.message && <p className="text-xs text-destructive">{errors.message.message}</p>}
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? "Sending..." : "Send Message"}
                <Send className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </form>
        </Card>
      </main>
    </PageLayout>
  );
}
