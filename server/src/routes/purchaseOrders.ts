import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import type { ProductType } from "../constants.js";
import { PRODUCTS } from "../constants.js";

const router = Router();

const VALID_PRODUCT_TYPES = Object.keys(PRODUCTS) as ProductType[];

router.get("/", async (_req, res) => {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(data);
});

router.post("/", async (req, res) => {
  const { product_type, customer_name, quantity, notes } = req.body;

  if (!product_type || !customer_name || !quantity) {
    res.status(400).json({ error: "product_type, customer_name, and quantity are required" });
    return;
  }

  if (!VALID_PRODUCT_TYPES.includes(product_type)) {
    res.status(400).json({ error: `product_type must be one of: ${VALID_PRODUCT_TYPES.join(", ")}` });
    return;
  }

  if (typeof quantity !== "number" || quantity <= 0 || !Number.isInteger(quantity)) {
    res.status(400).json({ error: "quantity must be a positive integer" });
    return;
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      product_type,
      customer_name,
      quantity,
      notes: notes ?? null,
      production_status: "pending",
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

export default router;
