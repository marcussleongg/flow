# Optional ETA and Supplier for Supplies

Make `supplier_name` and `eta` optional on supplies, with the scheduling engine gracefully degrading to null dates when a claimed supply has no ETA.

## Changes

### 1. Server validation — `server/src/routes/supplies.ts`

- Remove `supplier_name` and `eta` from the required-fields check (line 24)
- Pass `supplier_name || null` and `eta || null` to the insert
- No changes needed to PATCH endpoint

### 2. Scheduling engine — `server/src/routes/productionStatus.ts`

**Incoming supply pool (line ~110):**

- Allow `eta: string | null` on the `IncomingSupply` interface
- Sort supplies: non-null ETAs ascending first, null ETAs last

**Shortage resolution loop (line ~150):**

- Track a `hasUnknownEta` boolean alongside `materialsReadyAt`
- When a claimed supply has null ETA, set `hasUnknownEta = true`

**After shortage resolved:**

- If `hasUnknownEta`: set `expectedStart = null`, `expectedCompletion = null`, status = `"delay_expected"`
- Set `lineAvailableAt` to `null` for that line (new: allow null in the type)

**Subsequent orders on the same line:**

- If `lineAvailableAt` is `null`, every subsequent order on that line gets `expectedStart = null`, `expectedCompletion = null`
- Status is still computed normally (on_track/delay_expected based on materials), just dates are unknown
- The other line is unaffected

### 3. Client form — `client/src/pages/Supplies.tsx`

- Remove `*` from Supplier and ETA labels
- Remove `required` attribute from both inputs
- Handle null ETA in the supply table display (show "—" instead of a date)

### 4. Production Status display — `client/src/pages/ProductionStatus.tsx`

- When `expectedStart` or `expectedCompletion` is `null`, show **"Unable to estimate"** instead of "—"

### 5. Client types — `client/src/types.ts`

- Change `eta` from `string` to `string | null` on the `Supply` interface

## Cascade behavior summary

- Supplies with known ETA are preferred (sorted first)
- A null-ETA supply is only claimed when no ETA-bearing supply can cover the shortage
- Once claimed, that order and all later orders on the **same line** lose concrete dates
- The other production line is completely independent and unaffected

---

# Automatic Production Lifecycle

Automatically advance orders through `pending → in_production → completed` without manual intervention.

## Approach: Lazy Advancement

Run an `advanceProduction()` function at the **start** of every `GET /api/production-status` request, before the scheduling simulation. Since the frontend polls every 30 seconds, production advances continuously while the page is open. No cron jobs or background processes needed.

## Logic

### Step 1: Auto-complete finished orders

```
For each order WHERE production_status = 'in_production':
    completionTime = started_at + (quantity / ratePerHour) hours
    If completionTime <= now:
        UPDATE order SET production_status = 'completed', completed_at = completionTime
```

### Step 2: Auto-start next eligible orders

```
1. Find which lines are free (no in_production order after Step 1)
2. For each free line, find its earliest pending order (FIFO by created_at)
3. Collect these candidates (at most one per free line)
4. Sort candidates by created_at ASC (global FIFO for material priority)
5. For each candidate:
    a. Calculate materials needed = quantity × grams_per_unit
    b. Check if inventory has enough of ALL three materials
    c. If yes:
        - Deduct materials from inventory (via RPC or direct update)
        - UPDATE order SET production_status = 'in_production', started_at = now
    d. If no:
        - Skip (order stays pending, scheduling engine will forecast it)
```

Global FIFO ordering in step 4 ensures that if both lines are free but there aren't enough materials for both, the earlier-created order gets priority — matching the scheduling engine's material allocation logic.

## Changes

### Server — `server/src/routes/productionStatus.ts`

- Add `advanceProduction()` function (~50-70 lines):
  - Query in_production orders, complete any that are past their duration
  - Query free lines + earliest pending order per line
  - For each candidate in FIFO order: check inventory, deduct materials, start production
- Call `advanceProduction()` at the top of the `GET /` handler, before the existing scheduling logic
- The existing scheduling simulation runs unchanged after advancement

### Server — new RPC (Supabase)

- `decrement_inventory(p_material, p_quantity)` — atomically subtract from inventory, mirroring the existing `increment_inventory`
- Alternatively, reuse `increment_inventory` with a negative quantity (works since it does `quantity + p_quantity`)

### Client — no changes needed

- The frontend already displays `production_status` from the database (pending/in_production/completed badges on the Purchase Orders page)
- The Production Status page already shows `currentOrder` (in_production) and handles idle lines
- Completed orders naturally disappear from "Currently in Production" and "Upcoming Orders"

## Edge Cases

- **Race conditions**: Two simultaneous requests could both try to start the same order. Low risk at this app's scale. The inventory deduction being atomic (via RPC) prevents double-deducting materials. A duplicate `UPDATE SET production_status = 'in_production'` is idempotent.
- **Nobody viewing the page**: Production doesn't advance. Acceptable tradeoff — in practice the page is always open. The scheduling simulation remains correct regardless since it uses wall-clock time.
- **Order started but materials changed**: Once an order is started (in_production), materials are already deducted. The order runs to completion regardless of subsequent inventory changes.
