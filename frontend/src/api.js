const BASE = "/api";

const FIELD_NAMES = {
  name: "Name", quantity_kg: "Quantity (kg)", rate_per_kg: "Rate per kg", thread_type: "Thread type",
  color: "Colour", gross_weight: "Total weight", rod_weight: "Steel rod weight", length_m: "Thread length",
  rate_per_meter: "Rate per meter", meters: "Meters of cloth", pieces: "Number of pieces", amount: "Amount",
  weaver_id: "Weaver", customer_id: "Customer", quantity: "Quantity", rate: "Rate", good_pieces: "Good pieces",
  date: "Date", product: "Product", items: "Items", rod_ids: "Rods", number: "Machine number",
};

function friendly(err) {
  const field = err.loc?.[err.loc.length - 1];
  const label = FIELD_NAMES[field] || field;
  if (err.type === "missing" || err.type === "string_too_short") return `${label} is required`;
  if (err.type?.includes("greater_than")) return `${label} must be more than ${err.ctx?.gt ?? err.ctx?.ge ?? 0}`;
  if (err.type?.includes("parsing")) return `${label} is not a valid number/date`;
  if (err.type === "too_short") return `Please choose at least one ${String(label).toLowerCase()}`;
  return `${label}: ${err.msg}`;
}

async function req(method, path, body) {
  let res;
  try {
    res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. Is the app running?");
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    let msg = data?.detail;
    if (Array.isArray(msg)) msg = msg.map(friendly).join(". ");
    throw new Error(msg || "Something went wrong. Please try again.");
  }
  return data;
}

export const api = {
  get: (p) => req("GET", p),
  post: (p, b) => req("POST", p, b ?? {}),
  put: (p, b) => req("PUT", p, b),
  del: (p) => req("DELETE", p),
};

/** Build a query string, skipping empty values. */
export function qs(params) {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== "" && v != null && v !== false) s.set(k, v); });
  const out = s.toString();
  return out ? `?${out}` : "";
}
