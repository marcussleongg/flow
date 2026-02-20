import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ProductionStatusResponse, LineStatus, ScheduleStatus } from "../types";

const SCHEDULE_BADGE: Record<ScheduleStatus, { className: string; label: string }> = {
  on_track: { className: "badge badge-success", label: "On Track" },
  delay_expected: { className: "badge badge-warning", label: "Delay Expected" },
  unable_to_fulfill: { className: "badge badge-danger", label: "Unable to Fulfill" },
};

const LINE_LABELS: Record<string, { name: string; rate: string }> = {
  liter: { name: "1-Liter Line", rate: "2,000 bottles/hr" },
  gallon: { name: "1-Gallon Line", rate: "1,500 bottles/hr" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

function LineSection({ lineKey, line }: { lineKey: string; line: LineStatus }) {
  const info = LINE_LABELS[lineKey] ?? { name: lineKey, rate: "" };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>{info.name}</h2>
        <span className="text-secondary text-sm">{info.rate}</span>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3 className="text-sm text-secondary" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
          Currently in Production
        </h3>
        {line.currentOrder ? (
          <div style={{ padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "var(--radius)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <strong>Order #{line.currentOrder.id} — {line.currentOrder.customer_name}</strong>
              <span className="badge badge-warning">In Production</span>
            </div>
            <div className="text-sm text-secondary">
              {line.currentOrder.quantity.toLocaleString()} bottles
              &nbsp;·&nbsp;Started {formatDate(line.currentOrder.started_at)}
              &nbsp;·&nbsp;Expected completion {formatDate(line.currentOrder.expectedCompletion)}
            </div>
          </div>
        ) : (
          <p className="text-secondary text-sm" style={{ padding: "12px 0" }}>Idle — no active production</p>
        )}
      </div>

      <h3 className="text-sm text-secondary" style={{ marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
        Upcoming Orders
      </h3>
      {line.upcomingOrders.length === 0 ? (
        <p className="text-secondary text-sm" style={{ padding: "12px 0" }}>No pending orders.</p>
      ) : (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Quantity</th>
                <th>Expected Start</th>
                <th>Expected Completion</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {line.upcomingOrders.map((o) => {
                const badge = SCHEDULE_BADGE[o.scheduleStatus];
                return (
                  <tr key={o.id}>
                    <td>#{o.id}</td>
                    <td>{o.customer_name}</td>
                    <td>{o.quantity.toLocaleString()}</td>
                    <td className="text-sm">{o.expectedStart ? formatDate(o.expectedStart) : "—"}</td>
                    <td className="text-sm">{o.expectedCompletion ? formatDate(o.expectedCompletion) : "—"}</td>
                    <td><span className={badge.className}>{badge.label}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function ProductionStatus() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["production-status"],
    queryFn: () => api.get<ProductionStatusResponse>("/production-status"),
    refetchInterval: 30_000,
  });

  return (
    <div>
      <h1>Production Status</h1>
      {isLoading ? (
        <p className="text-secondary text-sm">Loading schedule...</p>
      ) : error ? (
        <p className="text-sm" style={{ color: "var(--color-danger)" }}>Failed to load: {error.message}</p>
      ) : data ? (
        <>
          <LineSection lineKey="liter" line={data.lines.liter} />
          <LineSection lineKey="gallon" line={data.lines.gallon} />
        </>
      ) : null}
    </div>
  );
}
