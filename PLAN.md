# ACME Bottles — Implementation Plan

## Overview

Supply Chain Management and Production Processing System for a plastic bottle manufacturer. The system tracks incoming supplies, manages purchase orders, and calculates production schedules with material availability checks.

---

## Business Constants

### Products & Production Lines

| Product | Line | Rate | Materials per unit |
|---|---|---|---|
| 1-Liter Bottle | 1L Line | 2,000 bottles/hr | 20g PET, 15g PTA, 10g EG |
| 1-Gallon Bottle | 1G Line | 1,500 bottles/hr | 65g PET, 45g PTA, 20g EG |

- Lines run 24/7, no downtime, full capacity, no delays
- Orders processed FIFO per line
- All prices are free; products fulfilled as soon as produced

### Raw Materials

- PET Resin
- Terephthalic Acid (PTA)
- Ethylene Glycol (EG)

---

## Database Schema (Supabase)

### `purchase_orders`

| Column | Type | Notes |
|---|---|---|
| id | int8 | PK |
| product_type | enum (`liter`, `gallon`) | Which product/line |
| customer_name | text | |
| quantity | int8 | Number of bottles |
| notes | text | |
| production_status | enum (`pending`, `in_production`, `completed`) | |
| created_at | timestamptz | For FIFO ordering |
| started_at | timestamptz | Set when status → `in_production` |
| completed_at | timestamptz | Set when status → `completed` (= started_at + quantity/rate) |

### `supplies`

| Column | Type | Notes |
|---|---|---|
| id | int8 | PK |
| material | enum (`pet`, `pta`, `eg`) | |
| quantity | float8 | In grams |
| supplier_name | text | |
| tracking_number | text | |
| eta | timestamptz | When materials arrive |
| order_status | enum (`ordered`, `received`) | |
| created_at | timestamptz | For chronological listing |
| received_at | timestamptz | When status flipped to received |

### `inventory`

| Column | Type | Notes |
|---|---|---|
| material | enum (`pet`, `pta`, `eg`) | PK |
| quantity | float8 | Current available stock |
| updated_at | timestamptz | Last time this row was modified |

Three rows, one per material. This is a **running balance** — updated transactionally rather than recalculated from history:

- **Supply received** → `quantity += supply.quantity`
- **Order starts production** → `quantity -= order.quantity × grams_per_unit`

This avoids expensive aggregation queries over the full supplies/orders history. Updates are done via regular Supabase queries (update supply status, then update inventory).

---

## Architecture

```
Client (React + Vite)  ──HTTP──>  Server (Express)  ──Supabase SDK──>  Database (Supabase)
```

- **Database**: Stores facts (orders, supplies, statuses) and maintains a running inventory balance
- **Backend**: Reads inventory + pending orders, computes scheduling logic, returns computed results
- **Frontend**: Displays what backend returns

Production scheduling is calculated on every request — NOT stored in the database — because it changes whenever any order or supply is created/updated. The `inventory` table only tracks physical stock; the scheduling engine simulates material allocation across pending orders in-memory.

---

## API Endpoints

### Purchase Orders

| Method | Route | Description |
|---|---|---|
| GET | `/api/purchase-orders` | List all, newest first |
| POST | `/api/purchase-orders` | Create a new purchase order |

### Supplies

| Method | Route | Description |
|---|---|---|
| GET | `/api/supplies` | List all, newest first |
| POST | `/api/supplies` | Create a new supply order |
| PATCH | `/api/supplies/:id` | Update status (ordered → received) |

### Production Status

| Method | Route | Description |
|---|---|---|
| GET | `/api/production-status` | Returns full computed schedule |

---

## Frontend Pages

### 1. Purchase Orders Page

- Form to create a new purchase order (product type, customer name, quantity, notes)
- Table listing all purchase orders in reverse chronological order
- Columns: id, product type, customer, quantity, status, created date

### 2. Supplies Page

- Form to create a new supply order (material, quantity, supplier name, tracking number, ETA)
- Table listing all supply orders in reverse chronological order
- Columns: id, material, quantity, supplier, tracking number, ETA, status

### 3. Production Status Page

- **Currently in production** section: shows the active order on each line (or "Idle")
- **Upcoming orders** section: FIFO queue for each line with computed fields:
  - Expected start date
  - Expected completion date
  - Status: on track / delay expected / unable to fulfill

---

## Scheduling Algorithm

This runs in the backend on every `GET /api/production-status` request.

### Material Consumption Model: All-Upfront

Materials are checked and deducted **all at once** before production starts — NOT consumed per-hour during production. An order will not start until the **total** materials required for the entire order are available. This is simpler to implement and ensures the production line never stalls mid-order.

> **Tradeoff**: This is conservative. In theory, production could start earlier if incoming supplies arrive before the line runs out mid-production. This per-hour optimization is out of scope but worth noting in the README.

### Step 1: Read Current Inventory

```
inventory = SELECT * FROM inventory
→ { pet: Xg, pta: Yg, eg: Zg }
```

This is a single read of 3 rows — no aggregation needed. The `inventory` table is kept up-to-date whenever supplies are received or orders start production.

### Step 2: Walk the FIFO Queue (Global)

Process ALL pending orders sorted by `created_at` ASC — regardless of production line — because both lines draw from the **same material pool**. Earlier orders get first dibs on materials.

Track two independent clocks — initialized from the `in_production` order on each line (if any):

```
For each line:
    If an order is in_production:
        lineAvailableAt = started_at + (quantity / ratePerHour)
    Else:
        lineAvailableAt = now
```

Also keep a mutable copy of incoming supplies (ordered, not yet received) sorted by ETA.

### Step 3: For Each Order, Determine Status

```
For each pending order (FIFO by created_at):

    1. Calculate material requirements
       needed = quantity × grams_per_unit[product_type]

    2. Calculate shortage
       shortage.pet = max(0, needed.pet - inventory.pet)
       shortage.pta = max(0, needed.pta - inventory.pta)
       shortage.eg  = max(0, needed.eg  - inventory.eg)

    3. Branch:

       ── NO SHORTAGE ──
          Deduct materials from inventory
          startTime    = lineAvailableAt[product_type]
          endTime      = startTime + (quantity / ratePerHour) hours
          lineAvailableAt[product_type] = endTime
          → status: "on track"

       ── SHORTAGE EXISTS ──
          Walk incoming supplies (earliest ETA first):
              For each supply matching a short material:
                  Reduce shortage by supply quantity
                  Track latest ETA among supplies claimed
                  Remove supply from incoming pool (prevent double-counting)

          If all shortages resolved:
              Deduct materials from inventory
              materialsReadyAt = latest ETA of claimed supplies
              startTime    = max(lineAvailableAt[product_type], materialsReadyAt)
              endTime      = startTime + (quantity / ratePerHour) hours
              lineAvailableAt[product_type] = endTime
              → status: "delay expected" (show updated completion date)

          If shortages remain:
              → status: "unable to fulfill"
              DO NOT advance lineAvailableAt (order blocks the line)
```

### Step 4: Blocked Orders

If order N on a line is "unable to fulfill," all subsequent orders on that same line are also blocked (FIFO — can't skip ahead). The other line continues independently.

---

## Implementation Order

### Phase 1: Server Foundation

- [ ] Create `server/src/index.ts` — Express server with CORS, JSON parsing
- [ ] Create Supabase client helper (`server/src/lib/supabase.ts`)
- [ ] Define constants (`server/src/constants.ts`) — production rates, material requirements

### Phase 2: CRUD Endpoints

- [ ] `GET /api/purchase-orders` — list newest first
- [ ] `POST /api/purchase-orders` — create with validation
- [ ] `GET /api/supplies` — list newest first
- [ ] `POST /api/supplies` — create with validation
- [ ] `PATCH /api/supplies/:id` — update status + update inventory

### Phase 3: Scheduling Engine

- [ ] `GET /api/production-status` — implement the full scheduling algorithm
- [ ] Inventory read (single query to `inventory` table)
- [ ] FIFO queue processing with material checks
- [ ] Delay/unable-to-fulfill logic with incoming supply ETAs

### Phase 4: Frontend Foundation

- [ ] Set up React Router with three routes
- [ ] Create Supabase client helper
- [ ] Set up TanStack Query for data fetching
- [ ] Create shared layout/navigation

### Phase 5: Frontend Pages

- [ ] Purchase Orders page (form + table)
- [ ] Supplies page (form + table)
- [ ] Production Status page (current production + upcoming queue)

### Phase 6: Polish

- [ ] Error handling (API + UI)
- [ ] Loading states
- [ ] Implement compulsory fields and add asterix beside compulsory field names
- [ ] Input validation
- [ ] README with setup instructions, design decisions, tradeoffs
