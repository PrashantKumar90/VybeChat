# Group-Based Real-Time Chat Web Application (V1)

A controlled, role-based group communication platform. **Group chat only** —
no private 1:1 messaging in V1.

## Status: Phase 1 (Foundation) → Phase 10 (Testing & Deployment) — all 10 phases scaffolded ✅

Phase 1 — Foundation:

- React + Vite + Tailwind frontend skeleton (`/frontend`)
- Express + Socket.IO backend skeleton (`/backend`)
- MongoDB/Mongoose connection layer
- Core models: `User`, `Group`, `GroupMember`, `Message`
- Idempotent Super Admin seed script (reads credentials from env vars only)
- `/health` endpoint
- `.env.example` for both frontend and backend

Phase 2 — Authentication:

- `POST /api/auth/register` — creates a `PENDING` account, sends "registration received" email
- `POST /api/admin/registrations/:userId/approve` / `/reject` — Super Admin only; approve generates a unique username + one-time account-setup link (hashed token, 24h expiry)
- `GET`/`POST /api/auth/account-setup/:token` — user sets password + display name, account becomes `ACTIVE`
- `POST /api/auth/login` — email or username + password, returns JWT
- `POST /api/auth/forgot-password` / `POST /api/auth/reset-password/:token` — hashed, single-use, 1h-expiry reset tokens; always returns a generic response so account existence isn't leaked
- Rate limiting on register/login/forgot-password
- `requireAuth` + `requireRole` middleware — JWT verified, account must be `ACTIVE`, role never trusted from the frontend
- Frontend pages: Register, Login, Forgot/Reset Password, Account Setup, protected Dashboard placeholder, `AuthContext` for session state

Phase 3 — RBAC:

- `loadGroupContext` — resolves `req.group` + `req.groupMembership` from `:groupId`, 404s if the group doesn't exist/is archived; never trusts a frontend-supplied groupId
- `requireGroupMembership` — allows Super Admin or any ACTIVE member; rejects everyone else
- `requireGroupAdmin` — allows Super Admin or that specific group's `GROUP_ADMIN`; a Group Admin in Group A has zero special rights in Group B
- `canJoinGroupRoom(user, groupId)` — same rule as a plain function, ready for Socket.IO room-join checks in Phase 5
- `groupAuthz.service.js` — shared membership/admin-count lookups (also used later to enforce "can't leave if you're the only Group Admin", spec §15)
- `constants/permissions.js` — single documented source of truth for the SUPER_ADMIN / GROUP_ADMIN / USER permission matrix
- Demo routes: `GET /api/groups/:groupId/access-check` and `/admin-only-ping` — prove the middleware chain end-to-end; full Group CRUD/membership endpoints come in Phase 4

Phase 4 — Groups:

- `POST /api/groups` (Super Admin) — create group
- `GET /api/groups` — Super Admin sees all groups; everyone else sees only groups they're an ACTIVE member of
- `GET /api/groups/:groupId` — any member or Super Admin
- `PATCH` / `DELETE /api/groups/:groupId` (Super Admin) — delete cascades to that group's `GroupMember` and `Message` records so nothing is orphaned (external image cleanup wires in during Phase 6/8)
- `GET /api/groups/:groupId/members` — any member or Super Admin
- `POST /api/groups/:groupId/members` `{ userId }` (Super Admin or that group's Group Admin) — adds an already-**ACTIVE** user only; upserts so a previously-removed member can rejoin cleanly
- `DELETE /api/groups/:groupId/members/:userId` (Super Admin or Group Admin) — a Group Admin can never remove another Group Admin, only Super Admin can
- `POST /api/groups/:groupId/members/:userId/promote` / `/demote` (Super Admin only) — assign/revert Group Admin for that specific group; demote is blocked if it would leave the group with zero admins
- `POST /api/groups/:groupId/leave` — self-service leave; blocked for a lone Group Admin until another is assigned first (spec §15)

Phase 5 — Real-time Chat:

- **Socket.IO auth**: every connection must send `{ auth: { token } }` on handshake; rejected outright if missing/invalid/account not `ACTIVE` (`socket/socketAuth.js`)
- **`group:join` / `group:leave`** — re-verifies group membership server-side before joining `group:<groupId>` room; a client-supplied groupId is never trusted alone
- **`message:send`** — validates membership + text length, persists to MongoDB, broadcasts `message:new` to the room with the sender's **Display Name** (never username)
- **`typing:start` / `typing:stop`** — broadcast-only, never written to MongoDB (spec §22); auto-expires after 5s if a client disconnects mid-type
- **History**: `GET /api/groups/:groupId/messages?before=<cursor>` — cursor-based pagination, latest 30 by default, scroll-up loads the previous 30 (spec §20)
- **Read/unread**: `message_reads` collection — one small doc per (user, group) pair storing `lastReadAt`, not one doc per message (spec §21). `POST /api/groups/:groupId/messages/read` marks read; `GET /api/groups/unread-counts` powers the sidebar badges
- **Frontend**: `ChatPage.jsx` — group sidebar with unread badges, message list with own/received styling and scroll-up pagination, composer with debounced typing indicator, singleton authenticated socket client (`socket/socket.js`)

Phase 6 — Images:

- **Magic-byte validation** (`utils/imageValidation.js`, backend) — the actual file bytes are sniffed (JPEG/PNG/WEBP/GIF signatures), never the browser-declared MIME type alone (spec §24, §51)
- **`upload.middleware.js`** — Multer memory storage, 5 MB limit enforced server-side, file never touches disk
- **`imageStorage.service.js`** — pluggable external storage seam (`uploadImage`/`deleteImage`); ships with a Cloudinary implementation, swappable without touching controllers. MongoDB stores metadata only — never the binary (spec §25)
- **`POST /api/groups/:groupId/messages/image`** — validates, uploads externally, persists an `IMAGE` message with `{ url, storageId, width, height, fileSize, mimeType }`, then broadcasts `message:new` over the same Socket.IO room as text messages
- **Frontend preview-confirm flow**: paperclip upload button, clipboard paste (`Ctrl+V`) on the composer, and drag-and-drop onto the chat window all funnel into the same staged preview — nothing uploads until the user hits **Send** (spec §24); Cancel discards it
- Client-side validation mirrors the backend's allowed types/size for instant feedback, but the backend re-validates everything regardless (spec §49)

Phase 7 — Push Notifications:

- **`push_subscriptions`** — one doc per browser/device (spec §28); upserted by `endpoint` so re-subscribing never duplicates
- **`notification_preferences`** — one doc per user: `groupMessageNotifications`, `messagePreview`, `notificationSound` (no private-message settings, since V1 has no DMs — spec §27)
- **`webPush.service.js`** — sends via `web-push`, using the sender's **Display Name** in the title (never the username); a 404/410 response (expired/revoked subscription) auto-deletes that subscription instead of retrying forever
- Wired into both `message:send` (Socket.IO) and the image-upload endpoint — every persisted message also fires a push to other ACTIVE group members, independent of the real-time broadcast
- **`GET /api/notifications/vapid-public-key`**, **`POST`/`DELETE /api/notifications/subscribe`**, **`GET`/`PATCH /api/notifications/preferences`**
- **Frontend**: `public/sw.js` service worker (shows the notification, and on click focuses/opens the app and navigates to the relevant group); `pushNotifications.service.js` handles permission request + subscription; `NotificationSettings.jsx` page with toggles for push, preview, and sound

You'll need to generate your own VAPID keypair once: `npx web-push generate-vapid-keys`, then drop the values into `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY`. Also drop a real `icon-192.png` into `frontend/public/` — `sw.js` references one for the notification icon.

Phase 8 — Storage Management:

- **`GET /api/storage/overview`** (Super Admin) — DB `dataSize`/`indexSize` via `db.stats()`, user/group/message/image counts, and a warning level (`NORMAL` < 80%, `WARNING` 80–90%, `CRITICAL` > 90% of `STORAGE_LIMIT_BYTES`) — crossing a threshold never deletes anything on its own (spec §29)
- **`RetentionSettings`** — a single system-wide doc (`enabled`, `retentionDays`); `PATCH /api/storage/retention` to change it, Super-Admin-only, audit-logged
- **Automatic retention job** (`retentionJob.service.js`) — runs once a day; only acts if explicitly enabled; batch-deletes messages older than the configured window and their external images, logs an `AUTOMATIC_CLEANUP` audit entry
- **Manual flush** — `POST /api/storage/flush/preview` shows exactly what would be deleted (message/image counts, cutoff date) before anything happens; `POST /api/storage/flush` requires an explicit `confirm: true` and is audit-logged; both accept an optional `groupId` to scope to one group
- **`messageCleanup.service.js`** — the shared batch-purge engine (200 at a time) behind manual flush, automatic retention, *and* group deletion (Phase 4's `deleteGroup` now runs through it too, so external images are cleaned up on group delete as well — spec §32)
- **`AuditLog`** model + `recordAuditLog()` helper — used for retention/flush/group-delete actions now; Phase 9 extends it to every admin action listed in spec §33
- **Frontend**: `StorageManagement.jsx` (Super Admin only) — usage bar with color-coded warning level, retention toggle + day-count picker, and a two-step flush (preview → confirm) so nothing is deleted by accident

Phase 9 — Administration:

- **User management** — `GET /api/admin/users` (search + status/role filters, paginated), `PATCH .../suspend` and `.../activate` (Super Admin only; can't suspend yourself or another Super Admin; suspend only from `ACTIVE`, activate only from `SUSPENDED` — a rejected/pending account still goes through the real approval flow, not this shortcut)
- **Audit logging extended everywhere** the spec's §33 list calls for it: registration approved/rejected, user suspended/activated, group created/edited/deleted, user added/removed from group, Group Admin assigned/reverted — on top of the flush/retention entries from Phase 8. `GET /api/admin/audit-logs` supports filtering by action/target type, paginated, newest first
- **Frontend admin section** (`AdminNav.jsx` + three pages, Super Admin only):
  - `AdminUsers.jsx` — pending registrations (approve/reject) and the full user directory (search, filter by status, suspend/activate)
  - `AdminGroups.jsx` — create groups, expand any group to manage its members inline (add by user ID, remove, promote/revert Group Admin), delete a group
  - `AdminAuditLogs.jsx` — filterable, chronological log viewer showing actor, action, target, and metadata

Registration approval/rejection, group CRUD, and Group Admin assignment were already built in Phases 2–4 — this phase is mainly the audit trail plus the missing admin-facing UI to drive all of it.

Phase 10 — Testing & Deployment:

- **Test suite** (`backend/tests/`, Vitest + Supertest + `mongodb-memory-server`) — `npm test` in `backend/` spins up a real, disposable MongoDB instance and runs HTTP requests straight against the Express app (no mocking of the DB layer). Covers the categories spec §54 calls out:
  - `auth.test.js` — registration, login (email or username), rejecting bad passwords and suspended accounts
  - `rbac.test.js` — non-members blocked from a group, Super Admin bypasses everywhere, **a Group Admin in one group has zero rights in another**, a Group Admin can't remove another Group Admin, a suspended user's token is rejected everywhere, the lone-Group-Admin-can't-leave rule
  - `groups.test.js` — group create/delete authorization, cascade delete of memberships, only-ACTIVE-users-can-be-added, clean re-add after removal, demote blocked at zero admins
  - This is a representative starter suite, not exhaustive — the same `helpers.js` (`createUser`, `createGroup`, `addMember`, `authHeader`) makes it straightforward to add the remaining categories (chat pagination, image validation, notification preferences, retention/flush) following the same pattern
  - **Sandbox note**: `mongodb-memory-server` downloads a real `mongod` binary on first run. That download was blocked in the tool sandbox used to build this (no route to `fastdl.mongodb.org`), so the suite is verified for syntax/structure here but hasn't actually been executed end-to-end yet — it will run normally on a machine with normal internet access, and the GitHub Actions workflow below runs it on every push
- **`.github/workflows/ci.yml`** — backend tests, a backend syntax/boot check, and a frontend production build, all on push/PR to `main`
- **`backend/Dockerfile`** — Node 20 Alpine, production deps only, runs `node src/server.js`
- **`frontend/Dockerfile`** — multi-stage: Vite build (with `VITE_API_URL`/`VITE_SOCKET_URL` as **build args**, since Vite bakes env vars in at build time, not runtime) → static files served by nginx, with `nginx.conf` doing SPA fallback (`try_files ... /index.html`) so client-side routes survive a refresh
- **`docker-compose.yml`** (repo root) — local-only full stack (Mongo + backend + frontend) for integration testing before pushing; not used for the actual Northflank deployment
- **`northflank.template.json`** — a best-effort Northflank Infrastructure-as-Code starting point (two `CombinedService` steps built from the Dockerfiles above, backend health check wired to `/health`). Northflank's template schema is actively evolving, so treat this as a first draft to finish in Northflank's template editor rather than something to run unmodified — the more reliable path for a first deploy is manual: create two services in the Northflank UI, point each at this repo with `backend/Dockerfile` / `frontend/Dockerfile` as the Dockerfile path, and set the environment variables listed below
- **`GET /health`** (already existed since Phase 1) — wire this up as the health check path on whichever platform you deploy to

## Tech Stack

**Frontend:** React, Vite, Tailwind CSS, React Router, Axios, Socket.IO Client
**Backend:** Node.js, Express, Socket.IO, MongoDB Atlas, Mongoose, JWT, bcryptjs, Nodemailer
**Deployment:** Northflank

## Roles

- `SUPER_ADMIN` / `USER` — global roles, stored on `User`
- `GROUP_ADMIN` — **per-group** role, stored on `GroupMember.role`, never global

## Local Development

### Backend

```bash
cd backend
cp .env.example .env      # fill in MONGODB_URI, JWT_SECRET, DEFAULT_SUPER_ADMIN_*, etc.
npm install
npm run seed               # idempotent — creates Super Admin only if none exists
npm run dev                 # starts on PORT (default 5000)
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev                 # starts on port 5173
```

Visit `http://localhost:5173` — it pings `/health` on the backend to confirm
connectivity.

## Default Super Admin

The default Super Admin account is **never hard-coded**. Credentials are read
from `DEFAULT_SUPER_ADMIN_EMAIL` and `DEFAULT_SUPER_ADMIN_PASSWORD` in the
backend `.env` file, hashed with bcrypt, and stored once. Running `npm run seed`
again is safe — it checks for an existing `SUPER_ADMIN` first.

## Roadmap

All 10 phases from the master spec have now been scaffolded (see the Status
section at the top for what each one delivered). What's left is what no
scaffold can finish for you: pointing the real MongoDB Atlas cluster,
Cloudinary account, SMTP provider, and VAPID keys at your own `.env`, running
the test suite somewhere with normal internet access, and doing a real
production hardening pass (rate limit tuning, log aggregation, HTTPS/cert
setup, alerting) before this fronts real users.

## Deployment

1. **MongoDB Atlas** — create a free/shared cluster, get the connection
   string into `MONGODB_URI`.
2. **Cloudinary** (or your chosen image provider) — get API key/secret,
   set `IMAGE_STORAGE_*`.
3. **SMTP** — any provider (SendGrid, Mailgun, etc.) for the four email
   templates; set `SMTP_*` and `SUPPORT_EMAIL`.
4. **VAPID keys** — `npx web-push generate-vapid-keys`, set
   `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY`.
5. **Northflank** — create two services from this repo:
   - **backend**: Dockerfile path `backend/Dockerfile`, port `5000`
     (or read from `PORT`), health check path `/health`, all the backend
     `.env.example` variables as environment variables.
   - **frontend**: Dockerfile path `frontend/Dockerfile`, port `80`,
     `VITE_API_URL` / `VITE_SOCKET_URL` set as **build arguments** (not
     runtime env vars — Vite bakes them in at build time) pointing at the
     backend service's public URL.
   - `northflank.template.json` is a starting point if you'd rather script
     this than click through the UI — see the note in Phase 10 above.
6. Once both services are up, run `npm run seed` against production
   `MONGODB_URI` once (e.g. via a Northflank one-off job) to create the
   default Super Admin.

## Security notes (already baked into Phase 1)

- Passwords are always bcrypt-hashed (`select: false` on the schema field)
- `GROUP_ADMIN` is never a global role — prevents privilege leaking across groups
- `.env` is git-ignored; only `.env.example` is committed
- Error handler never leaks stack traces
