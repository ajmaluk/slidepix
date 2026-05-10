"use client";

import { Suspense } from "react";
import Auth from "@/pages-legacy/Auth";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Auth />
    </Suspense>
  );
}
