# ACME Bottles

Supply chain management and production scheduling system for a plastic bottle manufacturer.

## Setup

### Prerequisites

- Node.js 20+
- Supabase project with tables: `purchase_orders`, `supplies`, `inventory`

### Database

Run the schema in Supabase SQL editor, then seed inventory:

```sql
INSERT INTO inventory (material, quantity, updated_at)
VALUES ('pet', 0, now()), ('pta', 0, now()), ('eg', 0, now());
```

The `increment_inventory` RPC function is also required (see `PLAN.md` for details).

### Server

```
cd server
cp .env.example .env   # fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev             # runs on :3001
```

### Client

```
cd client
cp .env.example .env   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev             # runs on :5173, proxies /api to :3001
```

## Architecture

```
React (Vite) → Express API → Supabase (Postgres)
```

- **Database**: stores orders, supplies, running inventory balance
- **Server**: CRUD endpoints + scheduling engine (computed per-request, not stored)
- **Client**: displays data, forms for creating orders/supplies

## Key Design Decisions

- **All-upfront material consumption**: orders wait for full materials before starting (no mid-production stalling)
- **Scheduling is computed, not stored**: recalculated on every request since it changes with any order/supply update
- **Running inventory balance**: `inventory` table updated transactionally on supply receipt, avoiding expensive aggregation queries
- **Global FIFO with shared materials**: both lines compete for the same material pool, earlier orders get priority
