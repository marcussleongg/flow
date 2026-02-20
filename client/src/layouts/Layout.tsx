import { NavLink, Outlet } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Production Status" },
  { to: "/purchase-orders", label: "Purchase Orders" },
  { to: "/supplies", label: "Supplies" },
];

export default function Layout() {
  return (
    <div className="app-layout">
      <nav className="app-nav">
        <span className="app-nav-brand">ACME Bottles</span>
        <div className="app-nav-links">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
