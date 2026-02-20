import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { PRODUCTS, MATERIALS, type ProductType, type Material } from "../constants.js";

const router = Router();

type MaterialPool = Record<Material, number>;
type ScheduleStatus = "on_track" | "delay_expected" | "unable_to_fulfill";

interface ScheduledOrder {
  id: number;
  product_type: ProductType;
  customer_name: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  expectedStart: string | null;
  expectedCompletion: string | null;
  scheduleStatus: ScheduleStatus;
}

interface CurrentOrder {
  id: number;
  product_type: ProductType;
  customer_name: string;
  quantity: number;
  notes: string | null;
  created_at: string;
  started_at: string;
  expectedCompletion: string;
}

interface IncomingSupply {
  id: number;
  material: Material;
  quantity: number;
  eta: string;
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

function noShortage(shortage: MaterialPool): boolean {
  return shortage.pet <= 0 && shortage.pta <= 0 && shortage.eg <= 0;
}

router.get("/", async (_req, res) => {
  const now = new Date();

  // ── Fetch all data in parallel ────────────────────────────

  const [inventoryRes, inProductionRes, pendingRes, incomingRes] = await Promise.all([
    supabase.from("inventory").select("*"),
    supabase.from("purchase_orders").select("*").eq("production_status", "in_production"),
    supabase.from("purchase_orders").select("*").eq("production_status", "pending").order("created_at", { ascending: true }),
    supabase.from("supplies").select("*").eq("order_status", "ordered").order("eta", { ascending: true }),
  ]);

  for (const r of [inventoryRes, inProductionRes, pendingRes, incomingRes]) {
    if (r.error) {
      res.status(500).json({ error: r.error.message });
      return;
    }
  }

  // ── Step 1: Build simulated inventory ─────────────────────

  const inventory: MaterialPool = { pet: 0, pta: 0, eg: 0 };
  for (const row of inventoryRes.data!) {
    const mat = row.material as Material;
    if (MATERIALS.includes(mat)) {
      inventory[mat] = row.quantity;
    }
  }

  // ── Step 2: Initialize line clocks from in_production ─────

  const lineAvailableAt: Record<ProductType, Date> = {
    liter: new Date(now),
    gallon: new Date(now),
  };

  const currentOrders: Record<ProductType, CurrentOrder | null> = {
    liter: null,
    gallon: null,
  };

  for (const order of inProductionRes.data!) {
    const pt = order.product_type as ProductType;
    const hours = order.quantity / PRODUCTS[pt].ratePerHour;
    const completion = addHours(new Date(order.started_at), hours);

    // If this order finishes later than the current clock, adopt it.
    // Clamp to now so pending-order start times are never in the past.
    const available = new Date(Math.max(completion.getTime(), now.getTime()));
    if (available > lineAvailableAt[pt]) {
      lineAvailableAt[pt] = available;
    }

    currentOrders[pt] = {
      id: order.id,
      product_type: pt,
      customer_name: order.customer_name,
      quantity: order.quantity,
      notes: order.notes,
      created_at: order.created_at,
      started_at: order.started_at,
      expectedCompletion: completion.toISOString(),
    };
  }

  // ── Mutable pool of incoming (ordered, not-yet-received) supplies ──

  const incomingSupplies: IncomingSupply[] = incomingRes.data!.map((s) => ({
    id: s.id,
    material: s.material as Material,
    quantity: s.quantity,
    eta: s.eta,
  }));

  // ── Step 3 & 4: Walk global FIFO queue ────────────────────

  const lineBlocked: Record<ProductType, boolean> = {
    liter: false,
    gallon: false,
  };

  const scheduledOrders: ScheduledOrder[] = [];

  for (const order of pendingRes.data!) {
    const pt = order.product_type as ProductType;
    const config = PRODUCTS[pt];
    const productionHours = order.quantity / config.ratePerHour;

    // Step 4: blocked line → automatically unable to fulfill
    if (lineBlocked[pt]) {
      scheduledOrders.push({
        id: order.id,
        product_type: pt,
        customer_name: order.customer_name,
        quantity: order.quantity,
        notes: order.notes,
        created_at: order.created_at,
        expectedStart: null,
        expectedCompletion: null,
        scheduleStatus: "unable_to_fulfill",
      });
      continue;
    }

    // 1. Material requirements
    const needed: MaterialPool = {
      pet: order.quantity * config.materialsPerUnit.pet,
      pta: order.quantity * config.materialsPerUnit.pta,
      eg: order.quantity * config.materialsPerUnit.eg,
    };

    // 2. Shortage
    const shortage: MaterialPool = {
      pet: Math.max(0, needed.pet - inventory.pet),
      pta: Math.max(0, needed.pta - inventory.pta),
      eg: Math.max(0, needed.eg - inventory.eg),
    };

    // 3a. No shortage — deduct, schedule, advance clock
    if (noShortage(shortage)) {
      for (const m of MATERIALS) inventory[m] -= needed[m];

      const start = lineAvailableAt[pt];
      const end = addHours(start, productionHours);
      lineAvailableAt[pt] = end;

      scheduledOrders.push({
        id: order.id,
        product_type: pt,
        customer_name: order.customer_name,
        quantity: order.quantity,
        notes: order.notes,
        created_at: order.created_at,
        expectedStart: start.toISOString(),
        expectedCompletion: end.toISOString(),
        scheduleStatus: "on_track",
      });
      continue;
    }

    // 3b. Shortage exists — try to resolve with incoming supplies
    const remaining: MaterialPool = { ...shortage };
    let materialsReadyAt = new Date(0);
    const claimedIndices: number[] = [];

    for (let i = 0; i < incomingSupplies.length; i++) {
      const supply = incomingSupplies[i]!;
      if (remaining[supply.material] <= 0) continue;

      remaining[supply.material] = Math.max(0, remaining[supply.material] - supply.quantity);
      claimedIndices.push(i);

      const eta = new Date(supply.eta);
      if (eta > materialsReadyAt) materialsReadyAt = eta;

      if (noShortage(remaining)) break;
    }

    if (noShortage(remaining)) {
      // Resolved — add claimed supply quantities to simulated inventory,
      // then deduct what the order needs. Excess stays for later orders.
      for (const idx of claimedIndices) {
        const s = incomingSupplies[idx]!;
        inventory[s.material] += s.quantity;
      }
      for (const m of MATERIALS) inventory[m] -= needed[m];

      // Remove claimed supplies from pool (reverse to keep indices stable)
      for (let i = claimedIndices.length - 1; i >= 0; i--) {
        incomingSupplies.splice(claimedIndices[i]!, 1);
      }

      const start = new Date(Math.max(lineAvailableAt[pt].getTime(), materialsReadyAt.getTime()));
      const end = addHours(start, productionHours);
      lineAvailableAt[pt] = end;

      scheduledOrders.push({
        id: order.id,
        product_type: pt,
        customer_name: order.customer_name,
        quantity: order.quantity,
        notes: order.notes,
        created_at: order.created_at,
        expectedStart: start.toISOString(),
        expectedCompletion: end.toISOString(),
        scheduleStatus: "delay_expected",
      });
    } else {
      // Unresolvable — block the line
      lineBlocked[pt] = true;
      scheduledOrders.push({
        id: order.id,
        product_type: pt,
        customer_name: order.customer_name,
        quantity: order.quantity,
        notes: order.notes,
        created_at: order.created_at,
        expectedStart: null,
        expectedCompletion: null,
        scheduleStatus: "unable_to_fulfill",
      });
    }
  }

  // ── Build response grouped by line ────────────────────────

  res.json({
    lines: {
      liter: {
        currentOrder: currentOrders.liter,
        upcomingOrders: scheduledOrders.filter((o) => o.product_type === "liter"),
      },
      gallon: {
        currentOrder: currentOrders.gallon,
        upcomingOrders: scheduledOrders.filter((o) => o.product_type === "gallon"),
      },
    },
  });
});

export default router;
