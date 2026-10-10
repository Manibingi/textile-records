import { useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { useData } from "./ui";
import Home from "./pages/Home";
import Thread from "./pages/Thread";
import Rods from "./pages/Rods";
import Weavers, { WeaverDetail } from "./pages/Weavers";
import Lots from "./pages/Lots";
import Payments, { PaymentSlip } from "./pages/Payments";
import Cutting from "./pages/Cutting";
import Sales, { Invoice, CustomerDetail } from "./pages/Sales";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const NAV = [
  { to: "/", icon: "🏠", label: "Home", end: true },
  { to: "/thread", icon: "🧵", label: "Thread & suppliers", step: 1 },
  { to: "/rods", icon: "🧶", label: "Rods & thread to weavers", step: 2 },
  { to: "/weavers", icon: "👷", label: "Weavers & machines" },
  { to: "/lots", icon: "📦", label: "Lots received", step: 5 },
  { to: "/payments", icon: "💰", label: "Weaver payments", step: 6 },
  { to: "/cutting", icon: "✂️", label: "Cutting & stock", step: 7 },
  { to: "/sales", icon: "🧾", label: "Sales & customers", step: 8 },
  { to: "/reports", icon: "📊", label: "Reports" },
  { to: "/settings", icon: "⚙️", label: "Settings & backup" },
];

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const loc = useLocation();
  const { data: settings } = useData("/settings");
  useEffect(() => { setMenuOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  const name = settings?.business_name || "Textile Records";

  return (
    <div className="shell">
      <header className="topbar no-print">
        <button className="menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-label="Open menu">☰ Menu</button>
        <div className="topbar-name">{name}</div>
      </header>
      <aside className={`sidebar no-print ${menuOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">🧵</div>
          <div>
            <div className="brand-name">{name}</div>
            <div className="brand-sub">Towels & Lungis · Records</div>
          </div>
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav ${isActive ? "active" : ""}`}>
              <span className="nav-icon">{n.icon}</span>
              <span className="nav-label">{n.label}</span>
              {n.step && <span className="nav-step">{n.step}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>
      {menuOpen && <div className="scrim no-print" onClick={() => setMenuOpen(false)} />}
      <main className="main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/thread" element={<Thread />} />
          <Route path="/rods" element={<Rods />} />
          <Route path="/weavers" element={<Weavers />} />
          <Route path="/weavers/:id" element={<WeaverDetail />} />
          <Route path="/lots" element={<Lots />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/slip/:id" element={<PaymentSlip settings={settings} />} />
          <Route path="/cutting" element={<Cutting />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales/bill/:id" element={<Invoice settings={settings} />} />
          <Route path="/customers/:id" element={<CustomerDetail />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </div>
  );
}
