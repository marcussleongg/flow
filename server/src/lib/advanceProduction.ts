import { supabase } from "./supabase.js";
import { PRODUCTS, MATERIALS, type ProductType, type Material } from "../constants.js";

type MaterialPool = Record<Material, number>;

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3_600_000);
}

export async function advanceProduction() {
  const now = new Date();

  // ── Step 1: Auto-complete finished orders ────────────────

  const { data: inProduction } = await supabase
    .from("purchase_orders")
    .select("*")
    .eq("production_status", "in_production");

  if (inProduction) {
    for (const order of inProduction) {
      const pt = order.product_type as ProductType;
      const hours = order.quantity / PRODUCTS[pt].ratePerHour;
      const completionTime = addHours(new Date(order.started_at), hours);

      if (completionTime <= now) {
        await supabase
          .from("purchase_orders")
          .update({ production_status: "completed", completed_at: completionTime.toISOString() })
          .eq("id", order.id);
      }
    }
  }

  // ── Step 2: Auto-start next eligible orders ──────────────

  const { data: stillInProduction } = await supabase
    .from("purchase_orders")
    .select("product_type")
    .eq("production_status", "in_production");

  const busyLines = new Set(
    (stillInProduction ?? []).map((o) => o.product_type as ProductType),
  );

  const freeLines = (Object.keys(PRODUCTS) as ProductType[]).filter(
    (pt) => !busyLines.has(pt),
  );

  if (freeLines.length === 0) return;

  const candidates: { order: Record<string, unknown>; line: ProductType }[] = [];
  for (const line of freeLines) {
    const { data } = await supabase
      .from("purchase_orders")
      .select("*")
      .eq("production_status", "pending")
      .eq("product_type", line)
      .order("created_at", { ascending: true })
      .limit(1);

    if (data && data.length > 0) {
      candidates.push({ order: data[0]!, line });
    }
  }

  candidates.sort(
    (a, b) => new Date(a.order.created_at as string).getTime() - new Date(b.order.created_at as string).getTime(),
  );

  const { data: inventoryRows } = await supabase.from("inventory").select("*");
  const inventory: MaterialPool = { pet: 0, pta: 0, eg: 0 };
  if (inventoryRows) {
    for (const row of inventoryRows) {
      const mat = row.material as Material;
      if (MATERIALS.includes(mat)) inventory[mat] = row.quantity;
    }
  }

  for (const { order } of candidates) {
    const pt = order.product_type as ProductType;
    const config = PRODUCTS[pt];
    const qty = order.quantity as number;

    const needed: MaterialPool = {
      pet: qty * config.materialsPerUnit.pet,
      pta: qty * config.materialsPerUnit.pta,
      eg: qty * config.materialsPerUnit.eg,
    };

    if (needed.pet > inventory.pet || needed.pta > inventory.pta || needed.eg > inventory.eg) {
      continue;
    }

    let failed = false;
    for (const mat of MATERIALS) {
      if (needed[mat] <= 0) continue;
      const { error } = await supabase.rpc("increment_inventory", {
        p_material: mat,
        p_quantity: -needed[mat],
      });
      if (error) {
        console.error(`Failed to deduct ${mat} for order ${order.id as number}:`, error.message);
        failed = true;
        break;
      }
    }
    if (failed) continue;

    for (const mat of MATERIALS) inventory[mat] -= needed[mat];

    await supabase
      .from("purchase_orders")
      .update({ production_status: "in_production", started_at: now.toISOString() })
      .eq("id", order.id as number);
  }
}
