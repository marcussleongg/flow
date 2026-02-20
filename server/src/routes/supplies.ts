import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import { MATERIALS, type Material } from "../constants.js";
import { advanceProduction } from "../lib/advanceProduction.js";

const router = Router();

router.get("/", async (_req, res) => {
  await advanceProduction();

  const { data, error } = await supabase
    .from("supplies")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

router.post("/", async (req, res) => {
  const { material, quantity, supplier_name, tracking_number, eta } = req.body;

  if (!material || !quantity) {
    res.status(400).json({ error: "material and quantity are required" });
    return;
  }

  if (!MATERIALS.includes(material as Material)) {
    res.status(400).json({ error: `material must be one of: ${MATERIALS.join(", ")}` });
    return;
  }

  if (typeof quantity !== "number" || quantity <= 0) {
    res.status(400).json({ error: "quantity must be a positive number" });
    return;
  }

  const { data, error } = await supabase
    .from("supplies")
    .insert({
      material,
      quantity,
      supplier_name: supplier_name || null,
      tracking_number: tracking_number || null,
      eta: eta || null,
      order_status: "ordered",
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const { order_status } = req.body;

  if (order_status !== "received") {
    res.status(400).json({ error: "Can only update order_status to 'received'" });
    return;
  }

  const { data: supply, error: fetchError } = await supabase
    .from("supplies")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchError || !supply) {
    res.status(404).json({ error: "Supply not found" });
    return;
  }

  if (supply.order_status === "received") {
    res.status(400).json({ error: "Supply already received" });
    return;
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("supplies")
    .update({ order_status: "received", received_at: now })
    .eq("id", id);

  if (updateError) {
    res.status(500).json({ error: updateError.message });
    return;
  }

  const { error: inventoryError } = await supabase.rpc("increment_inventory", {
    p_material: supply.material,
    p_quantity: supply.quantity,
  });

  if (inventoryError) {
    res.status(500).json({ error: inventoryError.message });
    return;
  }

  const { data: updated, error: refetchError } = await supabase
    .from("supplies")
    .select("*")
    .eq("id", id)
    .single();

  if (refetchError) {
    res.status(500).json({ error: refetchError.message });
    return;
  }

  res.json(updated);
});

export default router;
