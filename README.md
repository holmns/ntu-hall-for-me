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

# Local Postgres with no Docker and no cloud account:
npx prisma dev --detach --name ntuhall
# Paste the printed postgres:// TCP url into DATABASE_URL in .env

npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

**It runs with no API keys at all.** Google OAuth, OpenRouter and Google Maps
are each optional; without them the app uses demo sign-in, keyword-based
ranking, and a built-in list of NTU-area addresses with estimated commute
times. Add keys to `.env` to switch each one to the real service. See
`.env.example`.

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

See [CLAUDE.md](./CLAUDE.md) for architecture, where each piece of logic lives,
and the known MVP cut corners.

## Disclaimer

A student project. Listings are user-submitted and unverified. On-campus
entries are informal student sublets and are not affiliated with, endorsed by,
or connected to NTU's official hall allocation.
