# NTU Room Finder

Describe the room you want in plain English, get an AI-ranked list of rooms near
NTU Singapore with a reason for every match.

Seekers search with a sentence instead of a filter form. Providers post once,
with a fixed tag vocabulary plus a free-text description that the matching model
actually reads. Matched pairs can chat, and the exact address is only revealed
after a conversation starts.

## Quick start

```bash
npm install
cp .env.example .env
# Fill in the required keys below before going further.

# Local Postgres with no Docker and no cloud account:
npx prisma dev --detach --name ntuhall
# Paste the printed postgres:// TCP url into DATABASE_URL in .env

npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

**Three API integrations are required and have no fallback.** Set them in
`.env` before the first run:

| Key | Needed for |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | The only way to sign in |
| `OPENROUTER_API_KEY` | Reading the seeker's sentence and ranking rooms |
| `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Address lookup, the commute to campus, and the maps |

Without them the app does not degrade to keyword search, demo sign-in or
estimated commute times - those paths are gone, and each integration fails
loudly instead. `npm run db:seed` also calls the Distance Matrix API, so the
Maps key must be set before seeding. See `.env.example`.

## How matching works

1. The seeker's sentence goes to an LLM (via OpenRouter) which returns
   structured filters: budget, must-have and nice-to-have tags, room type,
   travel mode, commute limit, and the leftover nuance ("chill landlord").
2. Those become a hard Prisma filter. If nothing matches, constraints are
   relaxed step by step and the user is told what was relaxed.
3. The surviving candidates go back to the model in a single call, which ranks
   them and writes a one-line explanation per listing.

Commute times to campus are computed once with the Distance Matrix API when a
listing is created and cached on the row, so searching never calls a Maps API.

## Stack

Next.js 16 (App Router) - React 19 - TypeScript - Tailwind v4 - Prisma 7 -
Postgres/Supabase - NextAuth v5 - Google Maps - OpenRouter

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `start` | Production build and serve |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | 20 demo listings |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Drop, re-migrate, re-seed |

## Disclaimer

A student project. Listings are user-submitted and unverified. On-campus
entries are informal student sublets and are not affiliated with, endorsed by,
or connected to NTU's official hall allocation.
