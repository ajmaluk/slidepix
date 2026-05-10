# SlidePix

Next.js App Router application for generating and managing presentation workflows.

## Setup

Install dependencies:

```bash
npm install
```

Create `.env.local` with the required Clerk and Firebase keys:

```bash
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
CLERK_SECRET_KEY=sk_test_your_key_here

NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abc123def456

NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_UNSPLASH_ACCESS_KEY=your_unsplash_access_key
```

Optional server-side AI provider keys:

```bash
GEMINI_API_KEYS=your_gemini_api_key_1,your_gemini_api_key_2
GITHUB_TOKEN=your_github_token
GROQ_API_KEYS=your_groq_api_key
NVIDIA_API_KEYS=your_nvidia_api_key
OPENROUTER_API_KEYS=your_openrouter_api_key
```

## Run

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

## Clerk

The app uses Clerk in the App Router shell and legacy screen bridge. After adding your keys:

1. Start the dev server.
2. Sign up as the first test user through the app nav.
3. Verify the `<UserButton>` appears after sign-in.

If you want the Clerk-specific Codex skills for future work:

```bash
npx skills add clerk/skills
```

Restart your agent after installing the skills so they load.

## References

- Organizations: https://clerk.com/docs/guides/organizations/overview
- Components: https://clerk.com/docs/reference/components/overview
- Dashboard: https://dashboard.clerk.com/

## Notes

- This repository is now centered on Next.js App Router, not the Vite SPA flow.
- Generated artifacts such as `.next/`, `dist/`, logs, and smoke-test reports are ignored.
