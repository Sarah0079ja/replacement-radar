# HVAC Replacement Radar

Dallas-first sales intelligence for residential HVAC replacement prospecting.

## Current status

Milestone 0 coverage alignment passed. The founder-testable app shell now reads the real aligned Dallas spike output, ranks properties with visible evidence, supports filtering, property detail inspection, and CSV export, and includes an explicit local demo login path. It does not yet connect to a production database or map provider.

## Run locally

```bash
cd app
npm install
npm run dev
```

Open `http://localhost:3000`. `/login` uses the founder demo when Supabase variables are not configured. Copy `.env.example` to `.env.local` and provide Supabase public credentials to enable password sign-in. Full setup, migration, seeding, and RLS notes are in [`docs/HVAC_SUPABASE_SETUP.md`](docs/HVAC_SUPABASE_SETUP.md).

## Source of truth

- `docs/HVAC_DATA_SPIKE_RESULTS.md` — aligned real-data spike and decision
- `docs/HVAC_IMPLEMENTATION_MILESTONES.md` — build sequence and acceptance criteria
- `data-spike/` — reproducible Dallas parcel/permit acquisition, normalization, classification, and scoring artifacts
