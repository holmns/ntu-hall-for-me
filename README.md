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

**Every external integration is required and has no fallback.** Set them in
`.env` before the first run:

| Key | Needed for |
| --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | The only way to sign in |
| `OPENROUTER_API_KEY` | Reading the seeker's sentence and ranking rooms |
| `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Address lookup, the commute to campus, and the maps |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Listing photos |

Without them the app does not degrade to keyword search, demo sign-in or
estimated commute times - those paths are gone, and each integration fails
loudly instead. `npm run db:seed` also calls the Distance Matrix API, so the
Maps key must be set before seeding. See `.env.example`.

## How matching works

1. The seeker's sentence goes to an LLM (via OpenRouter) which returns
   structured filters: budget, must-have and nice-to-have tags, room type,
   travel mode, commute limit, and the leftover nuance ("chill landlord"). In
   parallel, the same sentence is embedded.
2. Those filters become a hard SQL filter, and the survivors are ordered by
   cosine distance between the query vector and each listing's vector
   (pgvector). If nothing matches, constraints are relaxed step by step and the
   user is told what was relaxed.
3. The top 10 go to the model in a single call that writes a one-line
   explanation each. The page does not wait for it: rooms render in their final
   order and the reasons stream into the cards afterwards.

Listings are embedded when posted or edited, never at search time. Run
`npm run db:embed` after adding the pgvector migration to an existing database.

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
| `npm run db:embed` | Embed listings missing a current vector (`-- --all` to redo) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:reset` | Drop, re-migrate, re-seed |

## Disclaimer

A student project. Listings are user-submitted and unverified. On-campus
entries are informal student sublets and are not affiliated with, endorsed by,
or connected to NTU's official hall allocation.
