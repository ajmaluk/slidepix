"use client";

import { Suspense } from "react";
import Payment from "@/pages-legacy/Payment";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Payment />
    </Suspense>
  );
}
