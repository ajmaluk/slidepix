import { motion } from "framer-motion";
import PageLayout from "@/components/shared/PageLayout";
import { SEOHead } from "@/components/SEOHead";

export default function PrivacyPage() {
  const sections = [
    { title: "Information We Collect", content: "We collect information you provide directly, such as when you create an account, generate presentations, or contact us. This includes your name, email address, deck prompts, and usage data such as interaction patterns and device information." },
    { title: "How We Use Information", content: "We use your information to provide and improve SlidePix services, respond to your requests, send updates about our services, and ensure security. We do not sell your personal data to third parties." },
    { title: "Data Storage & Security", content: "Your data is stored securely using industry-standard encryption. We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, or destruction." },
    { title: "Presentation Data", content: "Presentation prompts and generated deck history are processed to create and improve your slides. You can delete your presentation history at any time. We do not share individual deck content with third parties." },
    { title: "Cookies", content: "We use essential cookies for authentication and preferences. We do not use tracking cookies for advertising purposes." },
    { title: "Your Rights", content: "You have the right to access, correct, or delete your personal data. You can also request a copy of your data or opt out of certain processing activities. Contact us at contact.uthakkan@gmail.com for any privacy-related requests." },
    { title: "Changes to This Policy", content: "We may update this privacy policy from time to time. We will notify you of any material changes by posting the new policy on this page." },
  ];

  return (
    <PageLayout>
      <SEOHead 
        title="Privacy Policy — Data Protection at SlidePix" 
        description="Learn how SlidePix collects, uses, and protects your data while helping you create presentations." 
        path="/privacy"
        keywords="privacy policy, data protection, SlidePix privacy, presentation data security"
        breadcrumbs={[
          { name: "Home", url: "/" },
          { name: "Privacy Policy", url: "/privacy" }
        ]}
        jsonLd={{
          "@type": "WebPage",
          "name": "SlidePix Privacy Policy",
          "datePublished": "2025-01-01",
          "dateModified": "2026-03-17"
        }}
      />
      <section className="py-20 md:py-28 px-4 text-center">
        <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-4xl md:text-5xl font-bold tracking-tight mb-4">Privacy Policy</motion.h1>
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
