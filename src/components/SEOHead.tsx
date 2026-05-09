import { useEffect } from "react";

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface SEOHeadProps {
  title: string;
  description: string;
  path?: string;
  type?: "website" | "article" | "profile";
  image?: string;
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
  noIndex?: boolean;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  breadcrumbs?: BreadcrumbItem[];
  publishedTime?: string;
  modifiedTime?: string;
  author?: string;
  keywords?: string;
  locale?: string;
}

export function SEOHead({ 
  title, 
  description, 
  path = "/", 
  type = "website", 
  image = "/og-image.jpg",
  jsonLd, 
  noIndex = false,
  twitterCard = "summary_large_image",
  breadcrumbs,
  publishedTime,
  modifiedTime,
  author,
  keywords,
  locale = "en_US",
}: SEOHeadProps) {
  const fullTitle = title.includes("SlidePix") ? title : `${title} — SlidePix`;
  const siteName = "SlidePix";
  const siteUrl = typeof import.meta.env.VITE_SITE_URL === "string"
    ? import.meta.env.VITE_SITE_URL.trim()
    : typeof window !== "undefined"
      ? window.location.origin
      : "http://localhost:8080";
  const normalizedSiteUrl = siteUrl.replace(/\/+$/, "");
  const url = `${normalizedSiteUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const imageUrl = image.startsWith("http") ? image : `${normalizedSiteUrl}${image}`;

  useEffect(() => {
    document.title = fullTitle;

    const setMeta = (attr: string, key: string, content?: string | null) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!content) {
        if (el) el.remove();
        return;
      }
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };

    // Primary Meta Tags
    setMeta("name", "description", description);
    setMeta("name", "application-name", siteName);
    setMeta("name", "theme-color", "#0a0a0a");
    setMeta("name", "keywords", keywords);
    setMeta("name", "author", author);

    // Open Graph / Facebook
    setMeta("property", "og:site_name", siteName);
    setMeta("property", "og:title", fullTitle);
    setMeta("property", "og:description", description);
    setMeta("property", "og:type", type);
    setMeta("property", "og:url", url);
    setMeta("property", "og:image", imageUrl);
    setMeta("property", "og:image:width", "1200");
    setMeta("property", "og:image:height", "630");
    setMeta("property", "og:image:alt", fullTitle);
    setMeta("property", "og:locale", locale);

    // Article specific
    if (type === "article") {
      setMeta("property", "article:published_time", publishedTime);
      setMeta("property", "article:modified_time", modifiedTime);
      setMeta("property", "article:author", author);
    } else {
      setMeta("property", "article:published_time", null);
      setMeta("property", "article:modified_time", null);
      setMeta("property", "article:author", null);
    }

    // Twitter
    setMeta("name", "twitter:card", twitterCard);
    setMeta("name", "twitter:title", fullTitle);
    setMeta("name", "twitter:description", description);
    setMeta("name", "twitter:image", imageUrl);
    setMeta("name", "twitter:site", "@slidepix");
    setMeta("name", "twitter:creator", "@slidepix");

    // Robots
    setMeta("name", "robots", noIndex ? "noindex, nofollow" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1");
    setMeta("name", "googlebot", noIndex ? "noindex, nofollow" : "index, follow");

    // GEO tags
    setMeta("name", "geo.region", "IN-KL");
    setMeta("name", "geo.placename", "Kannur, Kerala");
    setMeta("name", "geo.position", "11.8745;75.3704");
    setMeta("name", "ICBM", "11.8745, 75.3704");

    // Canonical
    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", url);

    // Hreflang (self-referencing for en)
    const setLink = (rel: string, hreflang: string, href: string) => {
      const selector = `link[rel="${rel}"][hreflang="${hreflang}"]`;
      let el = document.querySelector(selector) as HTMLLinkElement | null;
      if (!el) {
        el = document.createElement("link");
        el.setAttribute("rel", rel);
        el.setAttribute("hreflang", hreflang);
        document.head.appendChild(el);
      }
      el.setAttribute("href", href);
    };
    setLink("alternate", "en", url);
    setLink("alternate", "x-default", url);

    // JSON-LD
    const existingScript = document.querySelector('script[data-seo-page]');
    if (existingScript) existingScript.remove();

    const ldItems: Record<string, unknown>[] = [];

    // Add breadcrumbs JSON-LD
    if (breadcrumbs && breadcrumbs.length > 0) {
      ldItems.push({
        "@type": "BreadcrumbList",
        "itemListElement": breadcrumbs.map((item, index) => ({
          "@type": "ListItem",
          "position": index + 1,
          "name": item.name,
          "item": item.url.startsWith("http") ? item.url : `${normalizedSiteUrl}${item.url}`
        }))
      });
    }

    // Add page-specific JSON-LD
    if (jsonLd) {
      if (Array.isArray(jsonLd)) {
        ldItems.push(...jsonLd);
      } else {
        ldItems.push(jsonLd);
      }
    }

    if (ldItems.length > 0) {
      const script = document.createElement("script");
      script.type = "application/ld+json";
      script.setAttribute("data-seo-page", "true");
      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@graph": ldItems
      });
      document.head.appendChild(script);
      return () => { script.remove(); };
    }
  }, [fullTitle, description, url, type, imageUrl, jsonLd, noIndex, twitterCard, breadcrumbs, publishedTime, modifiedTime, author, keywords, locale, normalizedSiteUrl]);

  return null;
}
