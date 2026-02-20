import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { PurchaseOrder } from "../types";

const STATUS_BADGE: Record<string, string> = {
  pending: "badge badge-neutral",
  in_production: "badge badge-warning",
  completed: "badge badge-success",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

export default function PurchaseOrders() {
  const queryClient = useQueryClient();

  const { data: orders, isLoading, error: queryError } = useQuery({
    queryKey: ["purchase-orders"],
    queryFn: () => api.get<PurchaseOrder[]>("/purchase-orders"),
  });

  const [productType, setProductType] = useState<"liter" | "gallon">("liter");
  const [customerName, setCustomerName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: (data: { product_type: string; customer_name: string; quantity: number; notes: string | null }) =>
      api.post<PurchaseOrder>("/purchase-orders", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["purchase-orders"] });
      setCustomerName("");
      setQuantity("");
      setNotes("");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity, 10);
    if (!customerName.trim() || isNaN(qty) || qty <= 0) return;
    create.mutate({
      product_type: productType,
      customer_name: customerName.trim(),
      quantity: qty,
      notes: notes.trim() || null,
    });
  }

  return (
    <div>
      <h1>Purchase Orders</h1>

      <div className="card">
        <h2>New Order</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label>Product Type *</label>
              <select value={productType} onChange={(e) => setProductType(e.target.value as "liter" | "gallon")}>
                <option value="liter">1-Liter Bottle</option>
                <option value="gallon">1-Gallon Bottle</option>
              </select>
            </div>
            <div className="form-field">
              <label>Customer Name *</label>
              <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" required />
            </div>
            <div className="form-field">
              <label>Quantity *</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="# bottles" min={1} step={1} required />
            </div>
            <div className="form-field">
              <label>Notes</label>
              <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? "Creating..." : "Create Order"}
            </button>
          </div>
          {create.isError && <p className="text-sm" style={{ color: "var(--color-danger)" }}>{create.error.message}</p>}
        </form>
      </div>

      <div className="card">
        <h2>All Orders</h2>
        {isLoading ? (
          <p className="text-secondary text-sm">Loading...</p>
        ) : queryError ? (
          <p className="text-sm" style={{ color: "var(--color-danger)" }}>Failed to load orders: {queryError.message}</p>
        ) : !orders || orders.length === 0 ? (
          <p className="empty-state">No purchase orders yet.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Product</th>
                  <th>Customer</th>
                  <th>Quantity</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.id}</td>
                    <td>{o.product_type === "liter" ? "1-Liter" : "1-Gallon"}</td>
                    <td>{o.customer_name}</td>
                    <td>{o.quantity.toLocaleString()}</td>
                    <td><span className={STATUS_BADGE[o.production_status] ?? "badge"}>{o.production_status.replace("_", " ")}</span></td>
                    <td className="text-secondary text-sm">{formatDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
