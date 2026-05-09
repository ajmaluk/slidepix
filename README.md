# Welcome to SlidePix

## Project info







**URL**: https://slidepix.example
**Project Name**: SlidePix

## Developer documentation

- Developer onboarding and architecture guide: `docs/DEVELOPER_GUIDE.md`
- Clerk + Firebase setup guide: [`docs/clerk-firebase-setup.md`](./docs/clerk-firebase-setup.md)

## Clerk setup

If you are enabling Clerk auth or billing, add your publishable key to `.env.local`:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
```

For the current React quickstart, see [Clerk React Quickstart](https://clerk.com/docs/react/getting-started/quickstart).

## How can I edit this code?

There are several ways of editing your application.

**Use SlidePix Studio**




Simply open your SlidePix workspace and start creating presentations.

Changes made in SlidePix Studio can be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in SlidePix Studio.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Open your deployment dashboard and publish the project.

### Cloudflare Pages (recommended for this repo)

This app is a Vite single-page application (SPA), and is ready for Cloudflare Pages.

Use these settings when creating the project:

- Framework preset: `Vite`
- Production branch: `main`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave empty (repository root)

Cloudflare environment variables to configure (Production and Preview as needed):

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`
- `VITE_EDGE_FUNCTIONS_BASE_URL`
- `VITE_OTP_EMAIL_ENDPOINT` or (`VITE_RESEND_API_URL` + `VITE_RESEND_API_KEY`)
- `VITE_RESEND_FROM_EMAIL`
- `VITE_OTP_PASSWORD_RESET_ENDPOINT`
- Provider keys used by `src/lib/dalamRouter.ts` (optional, depending on features)

Firebase API routing:

- The public API route is now configured as `/v1/api/**` in `firebase.json`.
- Legacy API docs and function examples have been retired from the public product surface.
- Use the app's slides workflow and Firebase-backed presentation storage as the source of truth for current development.

Notes:

- SPA route refreshes are handled by Firebase Hosting rewrites in `firebase.json`.
- If build image Node version ever causes issues, set `NODE_VERSION=20` in Cloudflare Pages environment variables.

## Can I connect a custom domain to my SlidePix project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: custom domain setup documentation for your hosting provider.
# slidepix
