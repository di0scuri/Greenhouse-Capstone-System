## Purpose

This file guides AI coding agents (Copilot-style) to be productive in this repository. It focuses on the actual architecture, workflows, conventions, and concrete file locations that matter for changes.

**Big Picture**
- **Frontend**: React app built with Vite. Source is under `src/` (entry `main.jsx`, components in `src/` and pages under `src/admin`, `src/farmer`, `src/finance`). Use `npm run dev` for local frontend HMR.
- **Backend**: Express server at `src/server/server.js`. The server uses the Firebase Admin SDK (`src/server/config/firebase.js`) to read/write Firestore and Realtime Database, and exposes REST endpoints under `/api/*`.
- **Integration**: Frontend uses client Firebase SDK in `src/firebase.jsx` (Firestore, Realtime DB, Auth). The server uses Admin SDK and environment variables for credentials. Server also serves the built frontend `dist` in production.

**Key Commands**
- **Dev frontend**: `npm run dev` (Vite dev server)
- **Dev server (backend)**: `npm run server` (nodemon -> `src/server/server.js`)
- **Full local dev**: `npm run dev:all` (runs server + Vite concurrently)
- **Build (prod)**: `npm run build` (creates `dist` at project root)
- **Start prod server**: `npm start` (runs `node src/server/server.js` which serves `dist`)

**Environment & Secrets**
- Server expects Firebase service-account values in environment variables (see `src/server/config/firebase.js`). Important vars include: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY` (store as a single-line env with `\n` replaced; code already calls `.replace(/\\n/g,'\n')`), `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_DATABASE_URL`.
- Do NOT commit private keys or service-account JSON to the repo. Use environment variables provided by your deployment platform (Railway, Heroku, etc.). `package.json` includes a `railway:build` script.

**Server patterns & conventions**
- All server endpoints start with `/api` (see `src/server/server.js`). When adding routes, keep them under `/api/*` to avoid colliding with frontend routes.
- Real-time listeners and background jobs live in `src/server/services/` (examples: `smsAlertService.js`, `plantAgeScheduler.js`). These services export setup functions like `setupRealtimeAlertListener(realtimeDb, db)` and `setupRoutes(app, db)` — modify both the service and `server.js` when changing lifecycle behavior.
- The server serves `dist` (Vite build output) from a hard-coded `dist` path: `path.join(__dirname, '..', '..', 'dist')`. Ensure builds produce that folder before starting the production server.

**Frontend patterns & conventions**
- Firebase client configuration is in `src/firebase.jsx`. It intentionally contains client keys (safe to be public) but backend must use Admin SDK for privileged operations.
- UI pages are grouped by role under `src/admin`, `src/farmer`, `src/finance`. Reusable UI is in `src/components` and `src/modals`.
- Modal components follow the naming `AddItemModal.jsx` / `EditItemModal.jsx` in `src/modals`.

**Debugging & useful endpoints**
- Health check: `GET /api/health` — verifies the server and services are active.
- Test endpoints: `GET /api/test/latest-reading` and `GET /api/test/recipients` — helpful when verifying DB permissions and realtime data.

**What to change where (examples)**
- Add a new server API: create a route in `src/server/services/*` (or directly in `src/server/server.js`) and expose it under `/api/*`.
- Add a new realtime listener: implement `setupRealtime...` in `src/server/services/<service>.js` and call it from `src/server/server.js` (follow `smsAlertService` pattern).
- Update Firebase env usage: edit `src/server/config/firebase.js` — avoid hardcoding secrets; the file already reads from `process.env`.

**Repository touchpoints**
- `package.json` — scripts and dependencies (Vite, Express, Firebase, nodemon, concurrently)
- `src/server/server.js` — server lifecycle, static serving, registered services
- `src/server/config/firebase.js` & `src/firebase.jsx` — server vs client Firebase configuration
- `src/server/services/` — background jobs and alert/scheduler logic

If anything here is unclear or you'd like more detail for a specific workflow (CI/deploy, a particular service, or adding tests), tell me which area and I'll expand the instructions.
