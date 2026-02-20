import "dotenv/config";
import express from "express";
import cors from "cors";
import purchaseOrderRoutes from "./routes/purchaseOrders.js";
import supplyRoutes from "./routes/supplies.js";
import productionStatusRoutes from "./routes/productionStatus.js";

const app = express();
const PORT = process.env["PORT"] ?? 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/purchase-orders", purchaseOrderRoutes);
app.use("/api/supplies", supplyRoutes);
app.use("/api/production-status", productionStatusRoutes);

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
