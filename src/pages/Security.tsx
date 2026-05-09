import { motion } from "framer-motion";
import { Shield, Lock, Eye, Server } from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";

const practices = [
  { icon: Lock, title: "Encryption", desc: "All data is encrypted in transit (TLS 1.3) and at rest (AES-256). API keys are hashed and never stored in plaintext." },
  { icon: Shield, title: "Access Control", desc: "Role-based access control with principle of least privilege. Multi-factor authentication available for all accounts." },
  { icon: Eye, title: "Privacy by Design", desc: "We minimize data collection and retention. Presentation data can be deleted at any time. No data is sold to third parties." },
  { icon: Server, title: "Infrastructure", desc: "Hosted on SOC 2 compliant infrastructure with 99.9% uptime SLA. Regular security audits and penetration testing." },
];

export default function SecurityPage() {
  return (
    <PageLayout>
      <SEOHead 
        title="Security — Trust & Reliability at SlidePix" 
        description="Learn about our commitment to security. From SOC 2 compliance to end-to-end encryption, SlidePix is built to protect your data." 
        path="/security"
        keywords="AI security, data encryption, SOC 2, SlidePix security practices"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Security", url: "/security" }
        ]}
        jsonLd={[{
          "@type": "WebPage",
          "name": "SlidePix Security Overview",
          "description": "Information about security practices and infrastructure at SlidePix."
        }, {
          "@type": "FAQPage",
          "mainEntity": [
            { "@type": "Question", "name": "Is my data encrypted?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. All data is encrypted in transit using TLS 1.3 and at rest using AES-256. API keys are hashed and never stored in plaintext." }},
            { "@type": "Question", "name": "Is SlidePix SOC 2 compliant?", "acceptedAnswer": { "@type": "Answer", "text": "SlidePix is hosted on SOC 2 compliant infrastructure with a 99.9% uptime SLA, regular security audits, and penetration testing." }},
            { "@type": "Question", "name": "Can I delete my presentation data?", "acceptedAnswer": { "@type": "Answer", "text": "Yes. We follow privacy-by-design principles. You can delete your presentation data at any time and we never sell data to third parties." }},
            { "@type": "Question", "name": "How do I report a security vulnerability?", "acceptedAnswer": { "@type": "Answer", "text": "Please report any security vulnerabilities to contact.uthakkan@gmail.com. We take all reports seriously and respond promptly." }}
          ]
        }]}
      />
      <section className="py-20 md:py-28 px-4 text-center">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Security</motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-muted-foreground max-w-xl mx-auto">
          Security is foundational to everything we build at SlidePix.
        </motion.p>
      </section>
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {practices.map((p, i) => (
            <motion.div key={p.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="p-6 rounded-2xl border border-border/30 bg-card/20">
              <p.icon className="w-5 h-5 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
      <section className="text-center py-16 px-4 border-t border-border/20">
        <p className="text-sm text-muted-foreground">Found a vulnerability? Report it to <a href="mailto:contact.uthakkan@gmail.com" className="text-foreground hover:underline">contact.uthakkan@gmail.com</a></p>
      </section>
    </PageLayout>
  );
}
