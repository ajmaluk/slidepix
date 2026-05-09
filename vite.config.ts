import { defineConfig, loadEnv, type TerserOptions } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const freepikApiKey = env.VITE_FREEPIK_API_KEY?.trim();
  const edgeFunctionsBaseUrl = env.VITE_EDGE_FUNCTIONS_BASE_URL?.trim();
  const proxy: Record<string, any> = {};

  if (mode === "development") {
    proxy["/v1/api"] = {
      target: edgeFunctionsBaseUrl?.startsWith("http") ? edgeFunctionsBaseUrl : "http://127.0.0.1:5001",
      changeOrigin: true,
      secure: false,
      rewrite: (requestPath: string) =>
        edgeFunctionsBaseUrl?.startsWith("http")
          ? requestPath
          : requestPath.replace(/^\/v1\/api/, "/dalamai/us-central1/api"),
    };
    
    proxy["/api/nvidia"] = {
      target: "https://integrate.api.nvidia.com",
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(/^\/api\/nvidia/, ""),
    };

    proxy["/api/web-search"] = {
      target: "http://127.0.0.1:8788", // Point to wrangler pages dev if running, or a fallback
      changeOrigin: true,
      secure: false,
      bypass: (_req: any, _res: any, _options: any) => {
        // Fallback to local search logic if backend is not available
        if (mode === "development" && !env.ENABLE_LOCAL_FUNCTIONS) {
          return null; 
        }
      }
    };
  }

  if (freepikApiKey) {
    proxy["/api/freepik-mystic"] = {
      target: "https://api.freepik.com",
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(/^\/api\/freepik-mystic/, "/v1/ai/mystic"),
      headers: {
        "x-freepik-api-key": freepikApiKey,
      },
    };

    proxy["/api/freepik-remove-bg"] = {
      target: "https://api.freepik.com",
      changeOrigin: true,
      secure: true,
      rewrite: (path: string) => path.replace(/^\/api\/freepik-remove-bg/, "/v1/ai/remove-background"),
      headers: {
        "x-freepik-api-key": freepikApiKey,
      },
    };
  }


  return {
  server: {
    host: "::",
    port: 8080,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
    },
    hmr: {
      overlay: false,
    },
    proxy: Object.keys(proxy).length > 0 ? proxy : undefined,
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode),
    __DEV__: mode === "development",
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query", "framer-motion"],
  },
  build: {
    minify: "terser",
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ["console.log", "console.debug"],
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    } as TerserOptions,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          // React core — load first, cache forever
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return "react-vendor";
          }

          // AI SDKs — heavy, only needed in chat
          if (
            id.includes("/node_modules/@google/genai/") ||
            id.includes("/node_modules/groq-sdk/")
          ) {
            return "ai-sdk-core";
          }
          if (
            id.includes("/node_modules/@openrouter/") ||
            id.includes("/node_modules/openai/") ||
            id.includes("/node_modules/@azure/")
          ) {
            return "ai-sdk-extra";
          }

          // Syntax highlighting — only chat/code blocks
          if (id.includes("react-syntax-highlighter") || id.includes("refractor") || id.includes("prism")) {
            return "syntax-highlighter";
          }

          // Router
          if (id.includes("react-router") || id.includes("@remix-run")) {
            return "router";
          }

          // Query
          if (id.includes("@tanstack/react-query")) {
            return "query";
          }

          // Markdown — only chat
          if (id.includes("react-markdown") || id.includes("remark") || id.includes("rehype")) {
            return "markdown";
          }

          // OCR engine
          if (id.includes("tesseract.js") || id.includes("wasm") || id.includes("worker")) {
            return "ocr-engine";
          }

          // Motion
          if (id.includes("framer-motion")) {
            return "motion";
          }

          // UI kit — dialogs, popovers, menus
          if (
            id.includes("@radix-ui") ||
            id.includes("@floating-ui") ||
            id.includes("vaul") ||
            id.includes("sonner") ||
            id.includes("cmdk") ||
            id.includes("embla-carousel-react") ||
            id.includes("react-day-picker") ||
            id.includes("react-resizable-panels")
          ) {
            return "ui-kit";
          }

          // Icons
          if (id.includes("lucide-react")) {
            return "icons";
          }

          // Forms
          if (id.includes("react-hook-form") || id.includes("@hookform/resolvers") || id.includes("zod")) {
            return "forms";
          }

          // Charts — only admin/debug panels
          if (id.includes("recharts") || id.includes("d3-")) {
            return "charts";
          }

          // Utils
          if (id.includes("date-fns") || id.includes("axios")) {
            return "utils";
          }

          // Payments
          if (id.includes("@paypal/paypal-js")) {
            return "payments";
          }

          // PDF
          if (id.includes("pdfjs-dist")) {
            return "pdf-engine";
          }

          return undefined;
        },
      },
    },
  },
};
});
