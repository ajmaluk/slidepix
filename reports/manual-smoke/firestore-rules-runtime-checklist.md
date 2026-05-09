# Firestore Rules Runtime Checklist

Date: 2026-04-09
Scope: Route-by-route QA matrix for current Firestore rules in `firestore.rules`.

## Role Legend
- Guest: not signed in
- User: signed in normal user (`role=user`)
- Staff: signed in `worker|manager|admin`

## Global Preconditions
1. Firestore rules in `firestore.rules` are published in Firebase Console.
2. Test accounts exist for each role (user, worker, manager, admin).
3. Seed data exists for:
- `content_posts` (draft + published)
- `system_services`, `system_incidents`
- `user_ratings` (approved + pending)
- `teams`, `team_members`, `tasks`, `internal_messages`

## Core Auth/Profile Runtime
### /auth
- Expected writes:
- Create/merge `user_subscriptions/{uid}` during role sync
- Expected result:
- User: ALLOW create with safe defaults, ALLOW own update for non-privilege fields
- Guest: N/A
- Fail signal:
- Login success but toast/profile sync warning

### Startup (`StartupRoleSync`, `FirestoreInit`)
- Expected writes:
- Merge write to `user_subscriptions/{uid}`
- Expected result:
- User/Staff: ALLOW
- Guest: no write attempted

## Public Content Routes
### /
- Reads:
- `content_posts` where `status=published`
- `user_ratings` where `approved=true` and `review!=null`
- Expected result:
- Guest/User/Staff: ALLOW

### /blogs, /news, /blogs/:slug, /news/:slug
- Reads:
- `content_posts` published only
- Expected result:
- Guest/User/Staff: ALLOW for published posts
- Negative test:
- Guest/User cannot read draft content

### /status
- Reads:
- `system_services`, `system_incidents` (public)
- Optional role check:
- Own `user_subscriptions` role (if signed in)
- Expected result:
- Guest/User/Staff: ALLOW status collections
- Signed-in owner: ALLOW own role read

### /careers
- Reads:
- `job_positions`
- Writes:
- `job_applications` create
- Expected result:
- Guest/User/Staff: ALLOW read positions, ALLOW create application

### /testimonials
- Reads:
- Public approved testimonials from `user_ratings`
- Own testimonial from `user_ratings` when signed in
- Own profile name from `user_subscriptions`
- Writes:
- Upsert own `user_ratings` with `approved=false`
- Expected result:
- Guest: ALLOW public reads only
- User/Staff: ALLOW own read/write, ALLOW public approved reads
- Negative test:
- User cannot self-approve testimonial

### /contact and /contact-us
- Writes:
- Create own `user_feedback` with `status=new`
- Expected result:
- Guest: DENY (UI should redirect/login)
- User/Staff: ALLOW

## Chat / API Runtime
### /chat, /chat/:chatId, /chat/temp/:tempId
- Reads/Writes (library level):
- `user_subscriptions`, `api_keys`, `api_usage_logs`
- Expected result:
- User/Staff: ALLOW own operations
- Guest: denied for auth-gated writes

### /api
- Reads/Writes:
- `api_keys` create/read/update/delete own keys
- `api_usage_logs` create/read own logs
- `user_subscriptions` usage counters and plan fields
- Expected result:
- User/Staff: ALLOW own scope
- Negative tests:
- User cannot mutate another user's key
- User cannot mutate `api_keys.key` value directly

## Staff-Only Collaboration Routes
### /work/tasks
- Reads:
- `tasks` assigned/owned/staff scope
- Writes:
- `tasks` status update
- Expected result:
- Staff: ALLOW
- User: DENY

### /work/chat and /manage/chat
- Reads:
- `teams`, `internal_messages`, sender info in `user_subscriptions`
- Writes:
- `internal_messages` create
- Expected result:
- Staff: ALLOW
- User: DENY

### /manage/teams
- Reads/Writes:
- `teams`, `team_members`, `user_subscriptions` (staff view)
- Expected result:
- Staff: ALLOW
- User: DENY

### /manage (dashboard)
- Reads:
- `teams`, `tasks`
- Expected result:
- Staff: ALLOW
- User: DENY

## Admin-Only Runtime (via staff gating in rules + app role routing)
### /admin, /admin/dashboard, /admin/users
- Reads/Writes:
- `user_subscriptions`, `tasks`, `transactions`, `server_status_logs`, `issue_reports`, `user_feedback`, `user_ratings`
- Expected result:
- Staff: ALLOW by rules
- User: DENY

### /admin/content
- Reads/Writes:
- `content_posts` (draft and published CRUD)
- Expected result:
- Staff: ALLOW
- User/Guest: only published reads on public pages; no admin CRUD

### /admin/feedback
- Reads/Writes:
- `user_feedback` + related `user_subscriptions`
- Expected result:
- Staff: ALLOW
- User: DENY management operations

### /admin/testimonials
- Reads/Writes:
- `user_ratings` moderation updates/deletes
- Expected result:
- Staff: ALLOW
- User: DENY moderation updates/deletes

### /admin/transactions and /admin/transactions-legacy
- Reads/Writes:
- `transactions` read/update
- Expected result:
- Staff: ALLOW
- User: DENY

## Special Setup Route
### /admin-setup
- Reads:
- own `user_subscriptions` role lookup
- Writes:
- Admin account creation happens via edge function (not direct rules path)
- Expected result:
- Role read follows owner/staff rules

## Negative Security Tests (Must Fail)
1. Signed-in normal user tries to read another user's `user_subscriptions` document.
2. Signed-in normal user tries to read `teams`, `team_members`, `internal_messages`.
3. Signed-in normal user tries to read all `tasks` without assignee/creator relation.
4. Signed-in user tries to set own `user_subscriptions.role='admin'`.
5. Signed-in user tries to set own `user_ratings.approved=true`.
6. Signed-in user tries to change `api_keys.key` or move key to another user.
7. Guest tries to submit `user_feedback`.

## Positive Regression Tests (Must Pass)
1. New signup/login creates `user_subscriptions/{uid}`.
2. Signed-in user can submit contact form (`user_feedback` with status new).
3. Public pages load published blogs/news.
4. Public status page loads services/incidents.
5. Signed-in user can submit testimonial (pending moderation).
6. Staff can use team chat and team management pages.
7. Staff can moderate testimonials and feedback in admin pages.

## Known External Blocker
- CLI publish from current machine still fails with IAM 403 for project `dalamai`.
- If not published in Firebase Console, runtime results may not match this checklist.
