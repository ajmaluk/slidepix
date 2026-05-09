import { motion } from "framer-motion";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";

export default function TermsPage() {
  const sections = [
    { title: "Acceptance of Terms", content: "By accessing or using SlidePix services, you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use our services." },
    { title: "Use of Services", content: "You may use SlidePix for lawful purposes only. You agree not to use our services to generate harmful, misleading, or illegal content. We reserve the right to suspend or terminate accounts that violate these terms." },
    { title: "Account Responsibilities", content: "You are responsible for maintaining the security of your account credentials. You agree to notify us immediately of any unauthorized access to your account." },
    { title: "Intellectual Property", content: "Content you create using SlidePix belongs to you. However, you grant us a license to use anonymized interaction data to improve our services." },
    { title: "Usage Limits", content: "Feature access is subject to plan limits and usage quotas based on your subscription. Excessive or abusive usage may result in throttling or suspension of access." },
    { title: "Limitation of Liability", content: "SlidePix is provided 'as is' without warranties of any kind. We are not liable for any damages arising from your use of our services, including but not limited to inaccurate outputs." },
    { title: "Modifications", content: "We reserve the right to modify these terms at any time. Continued use of our services after modifications constitutes acceptance of the updated terms." },
  ];

  return (
    <PageLayout>
      <SEOHead 
        title="Terms of Service — SlidePix" 
        description="Review the terms and conditions for using SlidePix services. Understand your rights and responsibilities when interacting with our platform." 
        path="/terms"
        keywords="terms of service, SlidePix terms, presentation usage policy"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Terms of Service", url: "/terms" }
        ]}
        jsonLd={{
          "@type": "WebPage",
          "name": "SlidePix Terms of Service",
          "datePublished": "2025-01-01",
          "dateModified": "2026-03-17"
        }}
      />
      <section className="py-20 md:py-28 px-4 text-center">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Terms of Service</motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="text-sm text-muted-foreground">Last updated: March 2026</motion.p>
      </section>
      <section className="max-w-3xl mx-auto px-4 pb-20 space-y-8">
        {sections.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.05 }}>
            <h2 className="text-lg font-semibold mb-2">{s.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{s.content}</p>
          </motion.div>
        ))}
      </section>
    </PageLayout>
  );
}
