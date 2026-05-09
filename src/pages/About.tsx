import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Target, Rocket, Globe, ExternalLink, Mail, MapPin, Code } from "lucide-react";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";

const values = [
  { icon: Target, title: "Mission-Driven", desc: "To merge creativity with technology — delivering clean, efficient, and impactful digital products that simplify work, enhance productivity, and inspire innovation." },
  { icon: Rocket, title: "Ambitious", desc: "To innovate across AI, development, and design — shaping technology that inspires creativity and drives meaningful digital growth." },
  { icon: Globe, title: "Global Impact", desc: "Our models serve millions of users in 40+ languages. We're committed to accessible AI for everyone, everywhere." },
  { icon: Code, title: "Elegant Architecture", desc: "We build fast, uncompromising software focused on solving complex problems with clean, efficient code." },
];

const timeline = [
  { year: "2025", event: "Uthakkan founded by Ajmal U K in Kannur, Kerala" },
  { year: "2025", event: "ToolPix launched — powerful AI-powered creative tools" },
  { year: "2025", event: "Byte AI development begins — next-gen AI assistant" },
  { year: "2026", event: "SlidePix launched — focused presentation generation workflow" },
  { year: "2026", event: "SlidePix Pro released with enhanced style and export capabilities" },
];

export default function AboutPage() {
  return (
    <PageLayout>
      <SEOHead 
        title="About SlidePix" 
        description="Learn about SlidePix's mission to turn briefs into polished presentations with a clean, focused workflow." 
        path="/about"
        keywords="about SlidePix, presentation software, Uthakkan, Kerala software company, Ajmal UK"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "About", url: "/about" }
        ]}
        jsonLd={{
          "@type": "AboutPage",
          "mainEntity": {
            "@type": "Organization",
            "name": "SlidePix",
            "alternateName": "SlidePix",
            "url": "https://dalam.pixtool.in",
            "logo": "https://dalam.pixtool.in/favicon.ico",
            "founder": {
              "@type": "Person",
              "name": "Ajmal U K"
            },
            "foundingDate": "2025",
            "location": {
              "@type": "Place",
              "address": {
                "@type": "PostalAddress",
                "addressLocality": "Kannur",
                "addressRegion": "Kerala",
                "addressCountry": "IN"
              }
            },
            "description": "A software company focused on creating digital products that solve complex problems with elegant architecture."
          }
        }}
      />
      {/* Hero */}
      <section className="py-20 md:py-32 px-4 text-center">
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs tracking-widest uppercase text-muted-foreground/60">About Us</motion.span>
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-4xl md:text-6xl font-bold tracking-tight mt-4 mb-6">AI for all humanity</motion.h1>
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          SlidePix is built by <a href="https://www.uthakkan.in" target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">Uthakkan</a> — a software company focused on creating presentation tools that solve complex problems with elegant architecture.
        </motion.p>
      </section>

      {/* Company Info */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="p-8 rounded-2xl border border-border/30 bg-card/20">
          <div className="flex flex-col md:flex-row md:items-center gap-6 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-foreground to-foreground/60 flex items-center justify-center shrink-0">
              <span className="text-background text-2xl font-bold">U</span>
            </div>
            <div>
              <h2 className="text-2xl font-bold">Uthakkan</h2>
              <p className="text-sm text-muted-foreground mt-1">We build fast, uncompromising software.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Globe className="w-4 h-4 shrink-0" />
              <a href="https://www.uthakkan.in" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors flex items-center gap-1">
                uthakkan.in <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-4 h-4 shrink-0" />
              <a href="mailto:contact.uthakkan@gmail.com" className="hover:text-foreground transition-colors">contact.uthakkan@gmail.com</a>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="w-4 h-4 shrink-0" />
              <span>Kannur, Kerala</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {["Software Development", "Founded 2025", "AI & Design"].map(tag => (
              <span key={tag} className="px-3 py-1 rounded-full border border-border/40 text-xs text-muted-foreground">{tag}</span>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Values */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-2xl font-bold tracking-tight mb-8">Our Values</motion.h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {values.map((v, i) => (
            <motion.div key={v.title} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
              className="p-6 rounded-2xl border border-border/30 bg-card/20">
              <v.icon className="w-5 h-5 text-muted-foreground mb-3" />
              <h3 className="text-lg font-semibold mb-2">{v.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{v.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Timeline */}
      <section className="max-w-3xl mx-auto px-4 pb-20">
        <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-2xl font-bold tracking-tight mb-12">Our Journey</motion.h2>
        <div className="space-y-6 relative">
          <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-border/30" />
          {timeline.map((t, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -15 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
              className="flex items-start gap-4 pl-6 relative">
              <div className="absolute left-0 top-1.5 w-[14px] h-[14px] rounded-full border-2 border-foreground/30 bg-background" />
              <div>
                <span className="text-xs text-muted-foreground/60">{t.year}</span>
                <p className="text-sm font-medium">{t.event}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Founder */}
      <section className="max-w-4xl mx-auto px-4 pb-20">
        <motion.h2 initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-2xl font-bold tracking-tight mb-8">Founder</motion.h2>
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="p-6 rounded-2xl border border-border/30 bg-card/20 flex flex-col md:flex-row gap-6">
          <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center shrink-0">
            <span className="text-3xl font-bold text-muted-foreground">A</span>
          </div>
          <div>
            <h3 className="text-lg font-semibold">Ajmal U K</h3>
            <p className="text-sm text-muted-foreground mb-3">Founder & Lead Engineer</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Ajmal is a full-stack developer and product builder who creates tools at the intersection of complex engineering and clean design. Frustrated by bloated software, he founded Uthakkan to architect products — like ToolPix and SlidePix — that are as powerful under the hood as they are elegant on the surface.
            </p>
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="text-center py-20 px-4 border-t border-border/20">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">Join our journey</h2>
        <p className="text-sm text-muted-foreground mb-8">We're building the future of AI — one product at a time.</p>
        <div className="flex items-center justify-center gap-4">
          <Link to="/contact" className="px-6 py-3 rounded-full bg-foreground text-background text-sm font-medium hover:opacity-90 transition-all inline-block">Contact Us</Link>
          <Link to="/contact" className="px-6 py-3 rounded-full border border-border text-sm font-medium hover:bg-card transition-all inline-block">Contact Us</Link>
        </div>
      </section>
    </PageLayout>
  );
}
