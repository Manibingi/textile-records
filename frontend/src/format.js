const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

export const rs = (v) => inr.format(Number(v || 0));
export const num = (v, dp = 2) => Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: dp });
export const kg = (v) => `${num(v, 3)} kg`;
export const mtr = (v) => `${num(v, 2)} m`;
export const n = (v) => (v === "" || v == null ? 0 : Number(v));

/** "2026-10-05" -> "05-10-2026" */
export const dt = (s) => {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return `${d}-${m}-${y}`;
};

export const iso = (d) => {
  const x = new Date(d);
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset());
  return x.toISOString().slice(0, 10);
};
export const today = () => iso(new Date());

export const PRODUCTS = ["Towel", "Lungi"];
export const PAY_MODES = ["Cash", "UPI", "Bank", "Cheque"];
export const ROD_STATUS = {
  in_stock: { label: "In stock", cls: "b-blue" },
  with_weaver: { label: "With weaver", cls: "b-amber" },
  finished: { label: "Finished", cls: "b-grey" },
};
