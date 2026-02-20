import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./layouts/Layout";
import ProductionStatus from "./pages/ProductionStatus";
import PurchaseOrders from "./pages/PurchaseOrders";
import Supplies from "./pages/Supplies";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<ProductionStatus />} />
          <Route path="purchase-orders" element={<PurchaseOrders />} />
          <Route path="supplies" element={<Supplies />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
