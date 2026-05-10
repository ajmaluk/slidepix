"use client";

import { Suspense } from "react";
import NotFound from "@/pages-legacy/NotFound";

export default function NotFoundPage() {
  return (
    <Suspense fallback={null}>
      <NotFound />
    </Suspense>
  );
}
