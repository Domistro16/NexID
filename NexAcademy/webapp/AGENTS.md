# Repository Guidelines

## Project Structure & Module Organization
This app is a Next.js App Router project. UI routes, layouts, and API handlers live in `app/`; use `app/api/**/route.ts` for server endpoints and keep route-specific client components close to their page when practical. Shared UI lives in `components/` and `components/ui/`, reusable hooks in `hooks/`, and domain logic in `lib/` (`lib/services/*.service.ts`, `lib/contracts/`, `lib/scorm/`, `lib/merkle/`). Database schema and migrations live in `prisma/`. Operational scripts such as seeders and point fixes live in `scripts/`. Static assets belong in `public/`.

## Build, Test, and Development Commands
- `npm install`: install dependencies and trigger `prisma generate`.
- `npm run dev`: start the local app on `http://localhost:3000`.
- `npm run build`: generate Prisma client and build production assets.
- `npm run start`: run the production server through `server.js`.
- `npm run lint`: run Next.js ESLint checks.
- `npx prisma migrate dev --name <change>`: create and apply a local schema migration.
- `npx prisma studio`: inspect local data during development.

## Coding Style & Naming Conventions
Use TypeScript throughout. Prefer functional React components, colocate route-only code under its route folder, and import shared modules via `@/`. Follow the surrounding file's formatting instead of restyling unrelated code; most app code uses concise components, PascalCase component names, camelCase functions, `useX` hook names, and descriptive service filenames such as `points-sync.service.ts`. Run `npm run lint` before opening a PR.

## Testing Guidelines
There is no dedicated automated test suite configured yet. Treat `npm run lint` as the minimum check, then manually verify the affected route, API handler, or admin flow. For Prisma changes, run the relevant migration locally and confirm the affected queries still work. If you add testable logic in `lib/`, prefer small, isolated modules that can be covered easily when a test runner is introduced.

## Commit & Pull Request Guidelines
Recent history uses conventional-style prefixes such as `fix:`. Keep commits focused and write imperative summaries, for example `feat: add partner campaign leaderboard route`. PRs should include a short description, linked issue or task, screenshots for UI changes, notes about new environment variables, and any required Prisma migration or seed steps.

## Security & Configuration Tips
Never commit `.env`; use `.env.example` as the reference template. Review config-sensitive changes carefully in `lib/config`, auth flows, cron routes, and reward/verification services. Ship schema changes together with their migration files.
