import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Users, Zap, Shield, ArrowRight, CheckCircle2 } from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";

const benefits = [
  { icon: Zap, title: "Custom Integrations", desc: "Tailored workspace integrations and custom presentation workflows for your team." },
  { icon: Shield, title: "Enterprise Security", desc: "SOC 2 compliance, SSO, role-based access, and data residency options." },
  { icon: Users, title: "Dedicated Support", desc: "Priority support with a dedicated success lead and SLA guarantees." },
  { icon: Building2, title: "Volume Pricing", desc: "Custom pricing based on your usage, team size, and deployment needs." },
];

const teamSizes = ["1–10", "11–50", "51–200", "201–1000", "1000+"];
const interests = ["Slide Generation", "Brand Templates", "Team Collaboration", "SSO & Security", "Other"];

export default function ContactSalesPage() {
  const [sent, setSent] = useState(false);

  return (
    <PageLayout>
      <SEOHead 
        title="Contact Sales — Enterprise Solutions for SlidePix" 
        description="Scale SlidePix across your organization with custom pricing, dedicated support, and enterprise-grade security features. Get in touch with our sales team today." 
        path="/contact-sales"
        keywords="enterprise presentation software, SlidePix sales, custom deployment, presentation workflow"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Contact Sales", url: "/contact-sales" }
        ]}
        jsonLd={{
          "@type": "ContactPage",
          "name": "SlidePix Contact Sales",
          "description": "Enterprise sales contact page for SlidePix.",
          "mainEntity": {
            "@type": "Organization",
          "name": "SlidePix Sales",
            "email": "contact.uthakkan@gmail.com",
            "url": "https://dalam.pixtool.in"
          }
        }}
      />
      {/* Hero */}
      <section className="py-20 md:py-28 px-4 text-center">
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-border/40 bg-secondary/30 text-xs tracking-widest uppercase text-muted-foreground/60 mb-6">
          <Building2 className="w-3.5 h-3.5" /> Enterprise
        </motion.span>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          Contact Sales
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-muted-foreground max-w-xl mx-auto text-base leading-relaxed">
          Scale SlidePix for your organization. Get custom pricing, dedicated support, and enterprise-grade features.
        </motion.p>
      </section>

      {/* Benefits grid */}
      <section className="max-w-5xl mx-auto px-4 pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {benefits.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="p-5 rounded-2xl border border-border/30 bg-card/20 hover:bg-card/40 transition-colors"
            >
              <b.icon className="w-5 h-5 text-muted-foreground mb-3" />
              <h3 className="text-sm font-semibold mb-1">{b.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Form section */}
      <section className="max-w-3xl mx-auto px-4 pb-24">
        {sent ? (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-12 rounded-2xl border border-border/30 bg-card/20 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2">Thank you!</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">Our sales team will reach out within 1 business day. We look forward to helping your team.</p>
          </motion.div>
        ) : (
          <motion.form
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            onSubmit={(e) => { e.preventDefault(); setSent(true); }}
            className="p-8 md:p-10 rounded-2xl border border-border/30 bg-card/20 space-y-6"
          >
            <div>
              <h2 className="text-xl font-semibold mb-1">Tell us about your team</h2>
              <p className="text-sm text-muted-foreground">Fill out the form and our sales team will be in touch shortly.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">First Name *</label>
                <input required className="w-full px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm focus:outline-none focus:border-foreground/30 transition-colors" placeholder="John" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Last Name *</label>
                <input required className="w-full px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm focus:outline-none focus:border-foreground/30 transition-colors" placeholder="Doe" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Work Email *</label>
                <input required type="email" className="w-full px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm focus:outline-none focus:border-foreground/30 transition-colors" placeholder="john@company.com" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Company *</label>
                <input required className="w-full px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm focus:outline-none focus:border-foreground/30 transition-colors" placeholder="Acme Inc." />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Job Title</label>
                <input className="w-full px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm focus:outline-none focus:border-foreground/30 transition-colors" placeholder="CTO" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1.5">Team Size *</label>
                <select required className="w-full px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm focus:outline-none focus:border-foreground/30 transition-colors text-muted-foreground">
                  <option value="">Select team size</option>
                  {teamSizes.map(s => <option key={s} value={s}>{s} people</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">What are you interested in?</label>
              <div className="flex flex-wrap gap-2 mt-1">
                {interests.map(item => (
                  <label key={item} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/40 bg-background text-xs text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors cursor-pointer has-[:checked]:bg-foreground has-[:checked]:text-background has-[:checked]:border-foreground">
                    <input type="checkbox" value={item} className="sr-only" />
                    {item}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1.5">Anything else?</label>
              <textarea rows={3} className="w-full px-4 py-2.5 rounded-xl border border-border/40 bg-background text-sm focus:outline-none focus:border-foreground/30 transition-colors resize-none" placeholder="Tell us about your use case..." />
            </div>

            <button type="submit" className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all">
              Submit
              <ArrowRight className="w-4 h-4" />
            </button>

            <p className="text-[10px] text-muted-foreground/40 text-center">By submitting, you agree to our <a href="/privacy" className="underline hover:text-foreground transition-colors">Privacy Policy</a> and <a href="/terms" className="underline hover:text-foreground transition-colors">Terms of Service</a>.</p>
          </motion.form>
        )}
      </section>
    </PageLayout>
  );
}
