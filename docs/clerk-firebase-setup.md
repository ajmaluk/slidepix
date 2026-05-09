# SlidePix Auth, Pricing, and Storage Setup

This document describes the intended production split for SlidePix:

- Clerk handles authentication, sessions, and user identity.
- Firebase handles application data storage for profiles, presentations, projects, and usage records.
- The billing catalog defines product tiers and feature entitlements used by the pricing page.

## Current Direction

The app is slides-first. The product surface should stay focused on:

- creating slide decks
- saving user and workspace metadata
- storing presentation history
- managing plan entitlements

Avoid reintroducing legacy multi-tool language in the user-facing product.

## Auth Layer

Use Clerk for:

- sign in
- sign up
- session management
- organization membership
- role claims for staff or enterprise workspaces

Recommended Clerk objects:

- `userId`
- `emailAddress`
- `fullName`
- `primaryOrganizationId`
- `publicMetadata.role`
- `privateMetadata.planKey`

If a user signs in with Clerk, sync the minimum profile data to Firebase so the app can render and query without depending on Clerk everywhere.

## Firebase Storage Layer

Use Firebase Firestore for durable app data.

Suggested collections:

- `users`
- `user_profiles`
- `presentations`
- `presentation_versions`
- `projects`
- `project_members`
- `billing_subscriptions`
- `billing_events`

Suggested document ownership:

- `users/{userId}`: public-safe user mirror
- `user_profiles/{userId}`: display name, country, timezone, preferences
- `presentations/{presentationId}`: deck metadata, style, title, status, timestamps
- `presentation_versions/{presentationId_versionId}`: snapshot history
- `projects/{projectId}`: workspace grouping for decks
- `project_members/{projectId_userId}`: membership and role
- `billing_subscriptions/{userId}`: current plan, renewal, entitlements
- `billing_events/{eventId}`: immutable billing audit trail

## Core Types

Keep the core data contracts small and explicit.

```ts
export type BillingPlanKey = "free" | "basic" | "pro" | "enterprise";

export type BillingFeatureKey =
  | "deck_generation"
  | "style_library"
  | "history"
  | "export_pdf"
  | "export_pptx"
  | "brand_kit"
  | "collaboration"
  | "sso"
  | "workspace_admin";

export interface AppUserProfile {
  userId: string;
  email: string | null;
  fullName: string;
  country?: string | null;
  timezone?: string | null;
  role?: "user" | "admin";
  planKey: BillingPlanKey;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationProject {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  presentationIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PresentationRecord {
  id: string;
  ownerId: string;
  projectId?: string | null;
  title: string;
  prompt: string;
  style: string;
  status: "draft" | "generating" | "ready" | "archived";
  slideCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface BillingEntitlements {
  planKey: BillingPlanKey;
  features: BillingFeatureKey[];
  deckGenerationsPerDay: number;
  maxProjects: number | null;
  maxSavedPresentations: number | null;
  ssoEnabled: boolean;
}
```

## Pricing Setup

The pricing page should derive from one catalog source of truth.

Each plan should define:

- plan key
- display name
- pricing amounts
- trial days
- whether the plan is public
- the feature list shown in the UI
- the entitlement object used by guards

Keep the pricing copy aligned with SlidePix:

- slide generation
- visual styles
- outline editing
- history
- exports
- team collaboration
- SSO for enterprise

## Suggested Sync Flow

1. User authenticates with Clerk.
2. App receives a Clerk session.
3. A sync routine writes or updates the Firebase user/profile record.
4. Billing webhook updates the Firebase subscription record.
5. Presentation and project data are stored in Firestore.
6. The UI reads entitlements from the subscription record or a cached local store.

## Optimization Notes

- Cache reads for profile and subscription records.
- Keep presentation snapshots append-only where possible.
- Store only the minimum profile fields needed for rendering.
- Use stable document IDs derived from the user or project when it reduces lookup cost.
- Avoid duplicating large slide payloads unless versioning requires it.

## Migration Notes

If the app moves from the current auth stack to Clerk:

- keep Firebase as the persistence layer
- add a thin auth adapter so the UI does not depend directly on the provider
- migrate session reads to a shared hook or context
- keep billing and entitlement checks provider-agnostic
