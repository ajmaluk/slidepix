 "use client";

import { useSyncExternalStore } from "react";
import {
  getClerkSessionSnapshot,
  subscribeClerkSession,
} from "@/lib/clerkSessionStore";

export function useAuthSession() {
  return useSyncExternalStore(
    subscribeClerkSession,
    getClerkSessionSnapshot,
    getClerkSessionSnapshot
  );
}
