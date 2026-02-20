import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Supply } from "../types";

const MATERIAL_LABELS: Record<string, string> = {
  pet: "PET Resin",
  pta: "PTA",
  eg: "Ethylene Glycol",
};

const STATUS_BADGE: Record<string, string> = {
  ordered: "badge badge-warning",
  received: "badge badge-success",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function formatWeight(grams: number) {
  if (grams >= 1_000_000) return `${(grams / 1_000_000).toFixed(1)} t`;
  if (grams >= 1_000) return `${(grams / 1_000).toFixed(1)} kg`;
  return `${grams} g`;
}

export default function Supplies() {
  const queryClient = useQueryClient();

  const { data: supplies, isLoading, error: queryError } = useQuery({
    queryKey: ["supplies"],
    queryFn: () => api.get<Supply[]>("/supplies"),
  });

  const [material, setMaterial] = useState<"pet" | "pta" | "eg">("pet");
  const [quantity, setQuantity] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [eta, setEta] = useState("");

  const create = useMutation({
    mutationFn: (data: { material: string; quantity: number; supplier_name: string | null; tracking_number: string | null; eta: string }) =>
      api.post<Supply>("/supplies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
      setQuantity("");
      setSupplierName("");
      setTrackingNumber("");
      setEta("");
    },
  });

  const [receiveError, setReceiveError] = useState<string | null>(null);

  const receive = useMutation({
    mutationFn: (id: number) => api.patch<Supply>(`/supplies/${id}`, { order_status: "received" }),
    onSuccess: () => {
      setReceiveError(null);
      queryClient.invalidateQueries({ queryKey: ["supplies"] });
    },
    onError: (err: Error) => {
      setReceiveError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(quantity);
    if (!supplierName.trim() || isNaN(qty) || qty <= 0 || !eta) return;
    create.mutate({
      material,
      quantity: qty,
      supplier_name: supplierName.trim(),
      tracking_number: trackingNumber.trim() || null,
      eta: new Date(eta).toISOString(),
    });
  }

  return (
    <div>
      <h1>Supplies</h1>

      <div className="card">
        <h2>New Supply Order</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-field">
              <label>Material *</label>
              <select value={material} onChange={(e) => setMaterial(e.target.value as "pet" | "pta" | "eg")}>
                <option value="pet">PET Resin</option>
                <option value="pta">PTA</option>
                <option value="eg">Ethylene Glycol</option>
              </select>
            </div>
            <div className="form-field">
              <label>Quantity (grams) *</label>
              <input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="Grams" min={1} required />
            </div>
            <div className="form-field">
              <label>Supplier *</label>
              <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder="Supplier name" required />
            </div>
            <div className="form-field">
              <label>Tracking #</label>
              <input type="text" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="Optional" />
            </div>
            <div className="form-field">
              <label>ETA *</label>
              <input type="datetime-local" value={eta} onChange={(e) => setEta(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={create.isPending}>
              {create.isPending ? "Creating..." : "Create Supply"}
            </button>
          </div>
          {create.isError && <p className="text-sm" style={{ color: "var(--color-danger)" }}>{create.error.message}</p>}
        </form>
      </div>

      {receiveError && (
        <div className="card" style={{ borderColor: "var(--color-danger)" }}>
          <p className="text-sm" style={{ color: "var(--color-danger)" }}>Failed to mark received: {receiveError}</p>
        </div>
      )}

      <div className="card">
        <h2>All Supplies</h2>
        {isLoading ? (
          <p className="text-secondary text-sm">Loading...</p>
        ) : queryError ? (
          <p className="text-sm" style={{ color: "var(--color-danger)" }}>Failed to load supplies: {queryError.message}</p>
        ) : !supplies || supplies.length === 0 ? (
          <p className="empty-state">No supply orders yet.</p>
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Material</th>
                  <th>Quantity</th>
                  <th>Supplier</th>
                  <th>Tracking #</th>
                  <th>ETA</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {supplies.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{MATERIAL_LABELS[s.material] ?? s.material}</td>
                    <td>{formatWeight(s.quantity)}</td>
                    <td>{s.supplier_name}</td>
                    <td className="text-secondary">{s.tracking_number ?? "—"}</td>
                    <td className="text-sm">{formatDate(s.eta)}</td>
                    <td><span className={STATUS_BADGE[s.order_status] ?? "badge"}>{s.order_status}</span></td>
                    <td>
                      {s.order_status === "ordered" && (
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => receive.mutate(s.id)}
                          disabled={receive.isPending}
                        >
                          Mark Received
                        </button>
                      )}
                    </td>
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
