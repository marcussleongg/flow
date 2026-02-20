# PDF file review for building process
_Exported on 2/20/2026 at 16:54:55 EST from Cursor (2.5.20)_

---

**User**

read and understand this file to make sure i don't miss anything while building it out@/Users/marcusleong/Library/Application Support/Cursor/User/workspaceStorage/8007504d8978186658e2925ba05b0d45/pdfs/2e7edc06-73ff-42b4-9725-35a4c4c04dfa/fde.pdf 

---

**Cursor**

Now let me also look at the current state of the project to understand what's already been built.

Here's a complete breakdown of what the PDF requires, so nothing gets missed:

---

## ACME Bottles — Supply Chain & Production Processing System

### Business Domain

**Products** (only two):
- **1-Liter Bottle** — produced on a dedicated line at **2,000 bottles/hour**
- **1-Gallon Bottle** — produced on a dedicated line at **1,500 bottles/hour**

Both lines run **24/7, no downtime, full capacity, no delays**.

**Raw Materials** (three ingredients, all free):
| Material | 1-Liter Bottle | 1-Gallon Bottle |
|---|---|---|
| PET Resin | 20g | 65g |
| PTA | 15g | 45g |
| Ethylene Glycol (EG) | 10g | 20g |

No caps, labels, packaging, or shipping to worry about. All prices are free (supplies and orders). Products are fulfilled as soon as produced.

---

### Three Pages Required

**1. Purchase Orders Page**
- Create a new purchase order (persisted to DB)
- List purchase orders in **reverse chronological order** (newest first)

**2. Supplies Page**
- Create a new supply order (select PET Resin, PTA, or EG) and persist it
- List supply orders in **reverse chronological order**

**3. Production Status Page** (the complex one)
- Show what is **currently in production** on both lines
- List **upcoming purchase orders in FIFO order**
- Display each order's **expected start date** (calculated from prior queued orders + production rate)
- **If materials are insufficient:**
  - Show **"Delay expected"** with updated completion date based on incoming supply ETAs
  - Show **"Unable to fulfill"** if no existing or incoming supplies can cover it

---

### Key Scheduling Logic

- Orders processed **FIFO** per production line
- Orders are assigned to the correct line based on product type (1L vs 1G)
- Two independent queues (one per line)
- Must calculate: fulfillment status + expected completion date/time
- Material availability affects scheduling — if ingredients are short, check incoming supply ETAs to determine if delay or unable to fulfill

---

### Deliverables Checklist

| Requirement | Status |
|---|---|
| Compilable and runnable code | Not started |
| Working database connection (Supabase configured) | Env vars set, no schema |
| README with design decisions, tools, how to run | Not started |
| Create Purchase Order + persist | Not started |
| List Purchase Orders (newest first) | Not started |
| Create Supply Order + persist | Not started |
| List Supply Orders (newest first) | Not started |
| Production Status: currently in production | Not started |
| Production Status: upcoming orders (FIFO) | Not started |
| Production Status: expected start/completion dates | Not started |
| Production Status: "Delay expected" with updated date | Not started |
| Production Status: "Unable to fulfill" | Not started |
| Correct scheduling logic | Not started |
| End-to-end functional workflow | Not started |

---

### Current Project State

The project is **scaffolded but empty**:
- **Client**: React 19 + Vite + TypeScript + React Router + TanStack Query/Table + Supabase JS — all installed, but only the default Vite template exists
- **Server**: Express 5 + Supabase JS + TypeScript — installed, but no `src/` directory or any source code
- **Database**: Supabase URL and keys configured in `.env`, but no tables or schema created yet

The biggest implementation challenges will be:
1. **Database schema design** — tables for purchase orders, supply orders, and tracking material inventory
2. **Production scheduling engine** — FIFO queue logic that calculates expected dates based on production rates and material availability
3. **Material sufficiency checks** — cross-referencing current inventory + incoming supply ETAs against order requirements to determine delay/unable-to-fulfill states

Want me to start building this out?

---

**User**

let's write a plan to implement some thigns first.

i have a database already created in my supabase database. supplies table with columns: id(int8), material(text), quantity(float8), supplier_name(text), tracking_number(text), eta(date), order_status(enum type of ordered/received)
and purchase_orders table with columns: id(int8), customer_name(text), quanitty(int8), notes(text), production_status(enum type of pending/in_production/completed), created_at(timestampz)

any feedback on the tables created? anything that should be added or removed? think hard

---

**Cursor**

No problem, let me give you the schema feedback directly.

---

## Schema Review

### CRITICAL — Missing Column

**`purchase_orders` is missing `product_type`**. This is the single biggest gap. ACME makes two products (1-Liter and 1-Gallon), and the entire scheduling engine depends on knowing which product an order is for:
- It determines which production line the order goes to
- It determines the material requirements (20g/15g/10g vs 65g/45g/20g per unit)
- It determines the production rate (2,000/hr vs 1,500/hr)

Without this column, nothing else can work. I'd recommend an enum type: `product_type (enum: '1l_bottle' / '1g_bottle')`.

---

### IMPORTANT — Missing Columns

1. **`supplies` is missing `created_at` (timestamptz)**. The spec requires "List supply orders in reverse chronological order." Without a timestamp, you'd be relying on id ordering, which is fragile and not semantically correct.

2. **`supplies.eta` should be `timestamptz` instead of `date`**. Production lines run 24/7, so scheduling calculations are time-sensitive. A supply arriving at 2am vs 11pm on the same day could shift an order's expected completion by ~21 hours. Using `timestamptz` lets you calculate precise completion dates.

---

### RECOMMENDED — Additions

3. **Add `completed_at` (timestamptz) to `purchase_orders`**. When an order finishes production, you stamp it. This gives you a clean historical record and makes it easier to determine "what's currently in production" vs recalculating everything from scratch each time.

4. **Add `received_at` (timestamptz) to `supplies`**. When a supply's status flips to `received`, this records *when* the materials actually became available. This is useful for calculating current inventory (sum quantities where `received_at IS NOT NULL`).

---

### MINOR — Opinions

5. **`supplies.material` is `text` but only 3 values are valid**. You already used enums for `order_status` and `production_status` — making `material` an enum too (`pet_resin` / `pta` / `eg`) would be consistent and prevent bad data at the DB level.

6. **`purchase_orders.quantity` typo in your message** — you wrote "quanitty" — just double-check the actual column name in Supabase is spelled correctly.

---

### What You DON'T Need

- No separate inventory table — current stock can be derived from `SUM(quantity) WHERE order_status = 'received'` minus what's been consumed by completed/in-production orders
- No production_lines table — only two fixed lines with constant properties, best defined as constants in code
- No pricing/shipping tables — spec says everything is free and fulfilled immediately upon production

---

### Revised Schema Summary

**`purchase_orders`**
| Column | Type | Notes |
|---|---|---|
| id | int8 | PK |
| product_type | enum (`1l_bottle`, `1g_bottle`) | **NEW — critical** |
| customer_name | text | |
| quantity | int8 | number of bottles |
| notes | text | |
| production_status | enum (`pending`, `in_production`, `completed`) | |
| created_at | timestamptz | |
| completed_at | timestamptz | **NEW — recommended** |

**`supplies`**
| Column | Type | Notes |
|---|---|---|
| id | int8 | PK |
| material | enum (`pet_resin`, `pta`, `eg`) | **changed from text** |
| quantity | float8 | in grams |
| supplier_name | text | |
| tracking_number | text | |
| eta | timestamptz | **changed from date** |
| order_status | enum (`ordered`, `received`) | |
| created_at | timestamptz | **NEW — important** |
| received_at | timestamptz | **NEW — recommended** |

Make the `product_type` addition first — that's the one that blocks everything else. Want to update the tables in Supabase and then move on to implementation planning?

---

**User**

should i be calculating the logic of whether there is enough materials for production and etc in the backend or should that be stored in the database?

---

**Cursor**

**Calculate in the backend.** Here's why:

### The scheduling logic is inherently iterative

To determine each order's status, you need to walk through the FIFO queue in sequence:

1. Start with current material inventory
2. For order #1: do we have enough materials? If yes, deduct them, calculate production time, move to order #2
3. For order #2: with the *remaining* materials (after order #1 consumed its share), do we have enough? If not, check incoming supply ETAs — will materials arrive before this order's expected start time? If yes, "Delay expected." If no supplies exist at all, "Unable to fulfill."
4. Repeat for order #3, #4, etc.

This is a **sequential accumulation with branching logic** — natural in TypeScript, painful in SQL. A stored procedure could do it, but it would be harder to read, test, and debug, and a reviewer evaluating your take-home will have an easier time following a clean function than a 100-line SQL procedure.

### What the database should do

Store facts. That's it.

- "Order #5 is for 10,000 1-liter bottles, created at 2pm" — **fact, store it**
- "Supply order #3 is 50kg PET Resin, ETA March 5th, status: ordered" — **fact, store it**
- "Order #5's expected completion is March 7th at 6am" — **derived, calculate it**

### What the backend should do

A single endpoint (something like `GET /api/production-status`) that:

1. **Queries** all pending/in-production purchase orders (FIFO order)
2. **Queries** all supply data (received quantities + incoming ETAs)
3. **Runs the scheduling algorithm** in TypeScript — walks the queue, tracks material consumption, calculates dates, determines status for each order
4. **Returns** the fully computed result to the frontend

### Why NOT store calculated fields

You might be tempted to store `expected_completion_date` or `fulfillment_status` in the database. Don't — because these values are **volatile**. Every time any of these events happens, every pending order's expected date could shift:

- A new order is placed (pushes everything behind it back)
- An order completes (pulls everything forward)
- A new supply order is created (a previously "unable to fulfill" order might become "delay expected")
- A supply is received (a "delay expected" order might become fulfillable on time)

You'd have to recalculate and update every affected row on every mutation. It's simpler and less error-prone to just compute everything fresh when the production status page is loaded.

### The one exception

Simple aggregations are fine as database queries within your backend logic:

```typescript
// This is fine — it's a simple fact query your backend uses as input
const inventory = await supabase
  .from('supplies')
  .select('material, quantity')
  .eq('order_status', 'received');
```

But the *orchestration* — the loop that walks the queue, checks materials, determines statuses — that lives in a TypeScript function.

**TL;DR**: Database = dumb store of facts. Backend = smart scheduling engine that reads those facts and computes everything on each request. Frontend = displays what the backend returns.

Want to move on to planning the implementation?

---

**User**

what's the production rate based on the document? is this something i set myself? do i assume it to be zero? should i allow for it to be a variable that can be adjusted?

---

**Cursor**

The production rates are **explicitly defined in the PDF** as fixed constants:

- **1-Liter Production Line**: 2,000 bottles per hour
- **1-Gallon Production Line**: 1,500 bottles per hour

The document also states:

> Each production line runs 24 hours per day, has no downtime, operates continuously at full capacity, experiences no production or quality delays.

So these are **not zero, not variable, and not adjustable**. They're fixed business constraints that you should define as constants in your backend code. Something like:

```typescript
const PRODUCTION_LINES = {
  '1l_bottle': {
    name: '1-Liter Production Line',
    ratePerHour: 2000,
  },
  '1g_bottle': {
    name: '1-Gallon Production Line',
    ratePerHour: 1500,
  },
} as const;
```

To calculate how long an order takes:

```typescript
// Example: 10,000 1-liter bottles
// 10,000 / 2,000 = 5 hours

const productionHours = order.quantity / PRODUCTION_LINES[order.product_type].ratePerHour;
```

There's no reason to make these adjustable for this exercise — the spec treats them as immutable facts about the factory. Making them configurable would be over-engineering for a take-home where the spec explicitly says these values are fixed.

---

**User**

okay sorry i missed that. since i know that, how should i manage the logic to keep track of the time at which the production will be completed? i know that i need to keep track of the materials currently present, the rate of production, if lacking materials when the remaining materials will arrive and from there update the time at which production will be completed again

---

**Cursor**

Good question — the logic has a few moving parts that interlock. Here's the mental model and the algorithm.

## The Mental Model

Think of it as two things to figure out for each pending order:

1. **When can the production line start?** (depends on when the line finishes the order ahead of it)
2. **When are materials available?** (depends on inventory and incoming supply ETAs)

The order can't start until **both** are true. The later of the two determines the actual start time.

## The Algorithm

### Inputs you query from the DB

- All **completed** orders (to calculate how much material has been consumed)
- All **pending/in-production** orders, sorted by `created_at` ASC (the FIFO queue)
- All **received** supplies (current material stock)
- All **ordered** supplies, sorted by `eta` ASC (incoming materials)

### Step 1: Calculate available inventory

```typescript
// Start with total received materials
inventory = sum of all supplies WHERE order_status = 'received', grouped by material

// Subtract what completed orders already consumed
for each completed order:
  inventory.pet_resin -= order.quantity × grams_per_unit.pet_resin
  inventory.pta      -= order.quantity × grams_per_unit.pta
  inventory.eg       -= order.quantity × grams_per_unit.eg
```

Now `inventory` reflects what's actually available for pending orders.

### Step 2: Walk the FIFO queue (global, both lines)

You process all pending orders in `created_at` order — regardless of which line they belong to — because **both lines draw from the same material pool**. An order created earlier gets first dibs on materials.

Track two separate clocks:

```typescript
lineAvailableAt = {
  '1l_bottle': now,   // when the 1L line becomes free
  '1g_bottle': now,   // when the 1G line becomes free
}
```

Also keep a **mutable copy** of incoming supplies (so when one order claims an incoming shipment, later orders can't double-count it).

### Step 3: For each order, determine status

```
For each pending order (FIFO):

  1. Calculate material requirements
     needed = { pet: qty × 20g, pta: qty × 15g, eg: qty × 10g }  // or 65/45/20 for gallon

  2. Calculate shortage
     shortage = {
       pet: max(0, needed.pet - inventory.pet),
       pta: max(0, needed.pta - inventory.pta),
       eg:  max(0, needed.eg  - inventory.eg),
     }

  3. Branch on shortage:

     ── NO SHORTAGE ──
        Deduct from inventory
        startTime = lineAvailableAt[product_type]
        endTime = startTime + (quantity / ratePerHour) hours
        lineAvailableAt[product_type] = endTime
        → status: "on track"

     ── SHORTAGE EXISTS ──
        Walk through incoming supplies (earliest ETA first)
        For each incoming supply that matches a short material:
          Reduce the shortage by that supply's quantity
          Track the latest ETA among supplies we needed
          Remove/reduce that supply from the incoming pool

        If all shortages resolved:
          Deduct from inventory (including the incoming we claimed)
          materialsReadyAt = latest ETA of the supplies we needed
          startTime = max(lineAvailableAt[product_type], materialsReadyAt)
          endTime = startTime + (quantity / ratePerHour) hours
          lineAvailableAt[product_type] = endTime
          → status: "delay expected", show updated completion date

        If shortages remain after all incoming supplies:
          → status: "unable to fulfill"
          DO NOT advance lineAvailableAt (this order blocks the line)
```

### Step 4: Orders behind an "unable to fulfill" are also blocked

If order #3 on the 1G line is "unable to fulfill," then orders #5 and #7 (also on the 1G line) are blocked too — the line can't skip ahead per FIFO. They'd also show "unable to fulfill." Meanwhile the 1L line continues independently.

## A concrete example

```
Inventory: 100kg PET, 80kg PTA, 50kg EG
Incoming: 200kg PET arriving March 5

Orders (FIFO):
  #1  1L  ×  2,000 bottles  (needs: 40kg PET, 30kg PTA, 20kg EG)
  #2  1G  ×  1,500 bottles  (needs: 97.5kg PET, 67.5kg PTA, 30kg EG)
  #3  1L  ×  4,000 bottles  (needs: 80kg PET, 60kg PTA, 40kg EG)
```

**Order #1** (1L):
- Needs 40/30/20 — inventory has 100/80/50 — sufficient
- Deduct → inventory becomes 60/50/30
- Start: now, duration: 2000/2000 = 1hr, end: now+1hr
- 1L line free at: now+1hr
- Status: **on track**

**Order #2** (1G):
- Needs 97.5/67.5/30 — inventory has 60/50/30 — short on PET (need 97.5, have 60) and PTA (need 67.5, have 50)
- Check incoming: 200kg PET arriving March 5 → covers PET shortage
- But PTA shortage has no incoming supply → **unable to fulfill**
- 1G line stays stuck

**Order #3** (1L):
- Needs 80/60/40 — inventory has 60/50/30 (already reduced by order #1)
- Short on everything — check incoming supplies
- 200kg PET arriving March 5 (still available, order #2 didn't consume it since it was unable to fulfill)
- PET covered, but PTA and EG short with no incoming → **unable to fulfill**

This is the core scheduling engine. It lives as a single function in your backend, runs fresh on every `GET /api/production-status` request, and returns the computed schedule to the frontend for display.

---

**User**

write this plan down into a .md file

---

**Cursor**

Written to `PLAN.md` at the project root. It covers the full scope — schema, API design, the scheduling algorithm, and a phased implementation order. You can refer back to it as we build things out.

---

**User**

a few things i want to change:
instead of calculating the currently available materials by summing up all the materials ever received, can we store the currently available materials in the database where we subtract from it each time it is used up and each time a new order comes in? this way there is no need for constant re-calculations of all received materials which would be unncessary work especially if the number of received orders gets very large. let me know if this is an incorrect approach

---

**Cursor**

Your approach is **not incorrect** — it's actually a well-established pattern called a "materialized balance." Banks use it for account balances, warehouses use it for stock levels. It's valid and more performant at scale.

Here's how it would work and the one nuance to be aware of:

### What changes

Add an `inventory` table:

| Column | Type |
|---|---|
| material | enum (`pet_resin`, `pta`, `eg`) — PK |
| quantity_grams | float8 |

Three rows, one per material. Updated transactionally:

- **Supply received** → `quantity_grams += supply.quantity`
- **Order starts production** → `quantity_grams -= order.quantity × grams_per_unit`

### The nuance: inventory reflects physical stock, not reservations

The `inventory` table tracks what's **physically available right now** — materials that have been received minus materials that have been consumed by orders that are in production or completed.

Pending orders haven't consumed anything yet. So the scheduling engine still needs to **simulate** deductions when walking the FIFO queue to determine if there's enough for each upcoming order. The difference is just where it gets its starting number:

| | Before (your original plan) | After (your proposed change) |
|---|---|---|
| **Get current stock** | `SUM(received supplies) - SUM(completed order consumption)` — aggregation over entire history | `SELECT * FROM inventory` — single read of 3 rows |
| **Walk FIFO queue** | Same in-memory simulation | Same in-memory simulation |

So the scheduling algorithm doesn't fundamentally change — you're just replacing an expensive Step 1 (aggregate the full history) with a cheap Step 1 (read 3 rows). Steps 2-4 of the algorithm stay identical.

### The thing to be careful about

The inventory update **must be atomic** with the status change. If you mark a supply as "received" but crash before incrementing inventory, your numbers are wrong. In Supabase you can handle this with an RPC (database function):

```sql
-- Example: receive a supply atomically
CREATE FUNCTION receive_supply(supply_id bigint)
RETURNS void AS $$
  UPDATE supplies SET order_status = 'received', received_at = now() WHERE id = supply_id;
  UPDATE inventory SET quantity_grams = quantity_grams + (
    SELECT quantity FROM supplies WHERE id = supply_id
  ) WHERE material = (SELECT material FROM supplies WHERE id = supply_id);
$$ LANGUAGE sql;
```

This guarantees both updates happen together or neither does.

### Verdict

Good change. I'd go with it. Want me to update the plan?

---

**User**

also would it make sense to simply set the remaining of the orders as pending as long as there is something currently in production? what about the same for unable to fulfill, just setting all orders to unable to fulfill as well if that is the case for a current order. find any fallacies in this thinking and let me know

---

**Cursor**

There are fallacies in both. Let me break them down.

### "Mark remaining orders as pending while something is in production"

The spec explicitly requires:

> *Display each order's expected start date (calculated based on prior queued orders and production rate)*

So you can't just label them "pending" and stop. The whole point of the production status page is to show **when** each pending order will start and finish. An order's `production_status` in the database is indeed `pending`, but the API response must include computed scheduling info (expected start, expected completion, material status). That's the core deliverable.

### "Cascade 'unable to fulfill' to all subsequent orders on that line"

This feels intuitive but is **not always accurate**. Counterexample:

```
Inventory: 500g PET, 500g PTA, 500g EG
No incoming supplies

Order #1 (1L): 50,000 bottles → needs 1,000kg PET, 750kg PTA, 500kg EG → UNABLE TO FULFILL
Order #2 (1L): 10 bottles     → needs 200g PET, 150g PTA, 100g EG     → has plenty of materials
```

Order #2 has enough materials — it's not "unable to fulfill." It's **blocked** because FIFO won't let it skip ahead. These are different things, and conflating them gives misleading information. A user looking at this would think "we need to order more materials for Order #2" when actually the materials are there — it's Order #1 that's the problem.

There's also a **material accounting problem**. Both lines share the same material pool, and you process material allocation in global FIFO order. If you short-circuit one line and stop tracking material consumption, you might incorrectly allocate those materials to the other line. Example:

```
Inventory: 100g PET
Order #1 (1G): 5,000 gallons  → needs 325kg PET → unable to fulfill
Order #2 (1L): 5 bottles      → needs 100g PET  → blocked behind #1, but materials exist
Order #3 (1G): 2 gallons       → needs 130g PET  → ???
```

If you mark Order #2 as "unable to fulfill" and skip it, you'd think the 100g PET is still free and might show Order #3 as having materials. But Order #2 legitimately has a claim on that PET — it would use it if #1 weren't blocking.

### What you CAN do

Once a line hits "unable to fulfill," you can **stop computing expected dates for that line** and mark subsequent orders as something like "blocked" or "pending — waiting on prior order." That's a valid optimization — there's no point calculating start/end times for orders that can't proceed.

But:
1. Don't call them "unable to fulfill" — that's inaccurate
2. Don't skip their material allocation in the global FIFO walk — the other line's calculations depend on correct accounting

The simplest correct approach: the scheduling engine walks ALL orders in global FIFO. When it hits "unable to fulfill" on a line, it records that the line is stuck. Subsequent orders on that line get labeled "blocked" with no dates. But the engine continues processing orders for the *other* line normally.

---

**User**

that's fair. can we update the plan first for the previous suggestion i made regarding having a new table for inventory to avoid costly summing 

---

**Cursor**

Plan updated. The changes:

1. **Added `inventory` table** to the schema section — 3 rows, one per material, with `quantity_grams` as a running balance
2. **Documented the atomic update rules** — supply received adds, order starts production deducts, both via Supabase RPC
3. **Simplified Step 1 of the algorithm** — from an aggregation query to a single 3-row read
4. **Updated the architecture description** to reflect that the DB now maintains a running inventory balance
5. **Updated implementation tasks** to note the RPC requirement on supply status updates

---

**User**

i also added a "updated_at" column@PLAN.md:59-73 

---

**Cursor**

Updated. Good addition — it gives you a quick way to see when inventory last changed, which is useful for debugging and for displaying "last updated" on the UI if you want.

---

**User**

can we also remove the rpc, let's just do a regular update to keep things simple

---

**Cursor**

Done. Removed all RPC references — just sequential updates to keep it straightforward.

---

**User**

so is our logic in the plan capturing the fact that per hour, we require all the necessary materials for production in that hour based on the production rate? or is there a different and better way being planned to be implemented?

---

**Cursor**

Good question. The current plan uses an **all-upfront** model — it checks if the total materials for the entire order are available before production starts, and deducts everything at once. It does NOT model per-hour consumption.

Here's the difference:

### Current plan: All-upfront

```
Order: 10,000 1L bottles
Total need: 200kg PET, 150kg PTA, 100kg EG
Have it all? → start, deduct everything, done in 5 hours
Don't have it? → wait until ALL materials are available, then start
```

### Alternative: Per-hour consumption

```
Order: 10,000 1L bottles
Per-hour need: 40kg PET, 30kg PTA, 20kg EG (2,000 bottles/hr × grams/unit)
Have 200kg PET on hand, 300kg PET arriving in 3 hours?
→ Start NOW — you have enough PET for 5 hours, and 300kg arrives at hour 3
→ Line never runs dry, no downtime
```

The per-hour model lets you **start earlier** because you don't need all materials upfront — you just need enough to keep the line running until the next supply arrives.

### Which is better?

The per-hour model is more realistic, but it's **significantly more complex**:

- You'd need to simulate production hour-by-hour (or find the optimal start time mathematically)
- You'd need to check that at every point during production, cumulative consumption never exceeds cumulative supply
- You'd need to find the earliest possible start time where the line never runs dry — this becomes an optimization problem

The all-upfront model is simpler, and still correct — it's just conservative. It might show "delay expected" in cases where production could technically start earlier. But the spec says lines have "no downtime," which supports the idea that you shouldn't start unless you're confident you can finish without interruption.

### My recommendation

Stick with the **all-upfront** model. For a take-home, it's the cleaner design, easier to implement correctly, and easier for a reviewer to verify. The per-hour optimization is a nice-to-have you could mention in your README as a tradeoff/future improvement, which actually shows you thought about it.

Want to keep it as-is, or switch to per-hour?

---

**User**

okay let's stick to the all-upfront model. make sure this is clear in @PLAN.md 

---

**Cursor**

Added a clear section right at the top of the Scheduling Algorithm explaining the all-upfront model — what it means, why we're using it, and the tradeoff to mention in the README.

---

**User**

should i be storing the startTime and endTime times in the database so that recalculations need not be made each time? and extending that, also add to the endTime if there is a lack of materials and we know when the new materials will arrive?

---

**Cursor**

It depends on **which** orders you're talking about.

### For `in_production` orders: YES, store them

When an order transitions to `in_production`, its start time and end time are **locked in** — the line runs 24/7 with no downtime, so nothing will change them. These become facts:

- `started_at` = now
- `expected_completion_at` = now + (quantity / ratePerHour)

Storing these is good because the scheduling engine can just read them to know when the line becomes free, instead of recalculating from scratch.

### For `pending` orders: NO, keep computing on-the-fly

Pending order times are volatile. Any of these events shifts them:

| Event | Effect |
|---|---|
| New order created | Pushes all later orders back |
| New supply order created | "Unable to fulfill" might become "delay expected" |
| Supply received | "Delay expected" might become "on track" |
| Order completes production | Everything shifts forward |

If you stored them, you'd need to **recalculate and update every affected pending order on every mutation**. That's the same amount of computation as calculating on-read, except now it's scattered across multiple writes with multiple rows to update. It's more error-prone and not actually less work.

### The hybrid approach

Add `started_at` and `expected_completion_at` to `purchase_orders`, but only populate them when the order moves to `in_production`:

```
pending       → started_at: NULL, expected_completion_at: NULL (computed on-the-fly)
in_production → started_at: timestamp, expected_completion_at: timestamp (stored, fixed)
completed     → started_at: timestamp, completed_at: timestamp (historical record)
```

The scheduling engine then does:

1. Read the `in_production` order's stored `expected_completion_at` → that's when the line is free
2. Compute everything for pending orders on-the-fly from that point forward

This gives you the best of both worlds — no redundant calculation for active orders, no stale data for pending ones.

Want me to update the plan with this?

---

**User**

so i should be creating new columns in my pruchase_orders table right, namely started_at and expected_completion_at

---

**Cursor**

Yes. Your `purchase_orders` table would have these columns:

| Column | Type | When populated |
|---|---|---|
| `started_at` | timestamptz | Set when status changes to `in_production` |
| `expected_completion_at` | timestamptz | Set when status changes to `in_production` (= `started_at` + quantity/rate) |
| `completed_at` | timestamptz | Set when status changes to `completed` (already in the plan) |

All three are `NULL` when the order is `pending`. Want me to update the plan?

---

**User**

well since the production lines never go down, wouldnt expected completion at and completion at be the same?

---

**Cursor**

You're right — with 24/7 production and no delays, the expected completion time and the actual completion time are always identical. No need for both columns.

Just keep `started_at` and `completed_at`:

- **`started_at`** — set when order moves to `in_production`
- **`completed_at`** — set when order moves to `completed` (= `started_at` + quantity/rate)

The scheduling engine can derive when the line becomes free from `started_at + (quantity / ratePerHour)` — no need for a separate `expected_completion_at` column.

Want me to update the plan to reflect just these two columns (dropping `expected_completion_at`)?

---

**User**

okay update my plan. i already added the started_at column

---

**Cursor**

Now let me update the scheduling algorithm to reference `started_at` for determining when the line is free.

Updated both spots — the schema now shows `started_at` and `completed_at` with clear notes on when each is set, and the scheduling algorithm initializes the line clocks from the stored `started_at` of any in-production order.

---

**User**

for @PLAN.md:225-229 phase 1, are you able to read my supabase tables to know what i've exactly already created?

---

**Cursor**

I can try. Let me grab the credentials and query the Supabase REST API to inspect your tables.

Yes, I can read them. Here's what's actually in your Supabase database vs what the plan says:

### `purchase_orders`

| Column | Plan says | Actual DB |
|---|---|---|
| product_type enum | `1l_bottle`, `1g_bottle` | `liter`, `gallon` |
| Everything else | Matches | Matches |

### `supplies`

| Column | Plan says | Actual DB |
|---|---|---|
| material enum | `pet_resin`, `pta`, `eg` | `pet`, `pta`, `eg` |
| Everything else | Matches | Matches |

### `inventory`

| Column | Plan says | Actual DB |
|---|---|---|
| material enum | `pet_resin`, `pta`, `eg` | `pet`, `pta`, `eg` |
| quantity column name | `quantity_grams` | `quantity` |
| Everything else | Matches | Matches |

Let me update the plan to match your actual DB.

Looks like you already updated the material enums to `pet`/`pta`/`eg`. Just need to fix the inventory column name and the references to it.

Now let me update the product_type references in the algorithm section.

Now update the constants references to match actual enum values.

The business constants table is fine — those are human-readable descriptions, not DB values. Plan is now synced with the actual database. Here's a summary of what matched and what I fixed:

- **`purchase_orders`**: product_type enum updated to `liter`/`gallon` (was `1l_bottle`/`1g_bottle`)
- **`supplies`**: material enum was already `pet`/`pta`/`eg` in your plan -- matched
- **`inventory`**: column name updated to `quantity` (was `quantity_grams`), material enum already matched
- **Algorithm references**: updated `pet_resin` to `pet`

