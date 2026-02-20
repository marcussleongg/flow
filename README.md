# ACME Bottles

Supply chain management and production scheduling system for a plastic bottle manufacturer.

NOTE regarding keys: provided in the notes section of the submission site, can also provide them via email (marcusleongjx@gmail.com) if necessary.

## Setup

### Prerequisites

- Node.js 20+
- Supabase project with tables: `purchase_orders`, `supplies`, `inventory`

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

## Tools Used
- Cursor, specific model is Opus 4.6 for coding

## Key Design Decisions and Tradeoffs

- **All-upfront material consumption**: orders wait for full materials before starting (no mid-production stalling). I think that in realistic situations it should be possible for production to begin without all upfront materials, especially if we are being very precise
- **Scheduling is computed, not stored**: recalculated on every request since it changes with any order/supply update
- **Running inventory balance**: `inventory` table updated transactionally on supply receipt, avoiding expensive aggregation queries of the remaining materials. This allows for database to keep track of all orders and supplies ordered, and also realtime calculations of estimations without expensive queries as a large number of orders are input into the database
- **Global FIFO with shared materials**: both lines compete for the same material pool, earlier orders get priority
- **Consideration of no ETA for supply delivery**: implemented ability to submit a supply order without ETA, which means that production status will show "Unable to estimate" where there is a supply order incoming but no knowledge on when it is arriving. This also means that an order with sufficient materials in queue behind an order with insufficient materials will show status of "on track" but unable to estimate expected start and completion times because of the order before it, since we stick to strict FIFO order
- **Lazy production advancement**: orders auto-start and auto-complete via `advanceProduction()` (`server/src/lib/advanceProduction.ts`), a shared function that runs at the top of every GET handler across all three route files. All three pages poll every 30s (`refetchInterval: 30_000`), so advancement happens automatically while any tab is open. No cron jobs or background processes — a deliberate simplicity tradeoff
- **Atomic inventory updates via RPC**: inventory is updated using a single SQL statement (`quantity = quantity + X`) to safely handle simultaneous supply updates. However, marking a supply as "received" and updating inventory are two separate calls — not wrapped in a single transaction, where a crash between them could leave a supply marked "received" without the inventory being updated