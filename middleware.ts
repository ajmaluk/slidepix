import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

const handleClerkMiddleware = clerkMiddleware(() => NextResponse.next());

export default function middleware(req: NextRequest, event: any) {
  if (req.nextUrl.pathname === "/") {
    return NextResponse.redirect(new URL("/slides", req.url));
  }

  return handleClerkMiddleware(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
