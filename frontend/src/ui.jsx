import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "./api";
import { iso, today } from "./format";

/* ---------------- Toast messages ---------------- */
const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [t, setT] = useState(null);
  const show = useCallback((msg, type = "ok") => setT({ msg, type, id: Date.now() }), []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), t.type === "error" ? 8000 : 4000);
    return () => clearTimeout(h);
  }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && (
        <div key={t.id} className={`toast ${t.type}`} role="status" onClick={() => setT(null)}>
          <span className="toast-icon">{t.type === "error" ? "!" : "✓"}</span>
          <span>{t.msg}</span>
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------------- Data loading ---------------- */
export function useData(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(Boolean(path));
  const load = useCallback(() => {
    if (!path) { setData(null); setLoading(false); return; }
    setLoading(true);
    api.get(path)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load };
}

/** Run a save/delete call with a toast. Returns the result or undefined on error. */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const out = await fn();
      if (okMsg) toast(typeof okMsg === "function" ? okMsg(out) : okMsg);
      return out ?? true;
    } catch (e) {
      toast(e.message, "error");
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return [run, busy];
}

/** Tabs kept in the URL (?tab=...) so home-screen buttons can open a tab directly. */
export function useTab(def) {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") || def;
  const setTab = (t, extra = {}) => setSp({ tab: t, ...extra });
  return [tab, setTab, sp];
}

/* ---------------- Layout pieces ---------------- */
export function PageHeader({ icon, step, title, help, children }) {
  return (
    <header className="page-head">
      <div className="page-icon" aria-hidden>{icon}</div>
      <div className="page-head-text">
        {step && <div className="step-tag">Step {step}</div>}
        <h1>{title}</h1>
        {help && <p className="muted">{help}</p>}
      </div>
      {children && <div className="page-head-actions no-print">{children}</div>}
    </header>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs no-print" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={value === id}
          className={`tab ${value === id ? "active" : ""}`} onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

export const Card = ({ title, children, className = "", actions }) => (
  <section className={`card ${className}`}>
    {(title || actions) && (
      <div className="card-head">
        {title && <h2>{title}</h2>}
        {actions && <div className="card-actions no-print">{actions}</div>}
      </div>
    )}
    {children}
  </section>
);

export function Field({ label, hint, required, children, wide }) {
  return (
    <label className={`field ${wide ? "wide" : ""}`}>
      <span className="field-label">{label}{required && <b className="req"> *</b>}</span>
      {children}
      {hint && <small className="hint">{hint}</small>}
    </label>
  );
}

export const Input = ({ value, onChange, ...rest }) => (
  <input className="inp" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} />
);

export const NumInput = ({ value, onChange, ...rest }) => (
  <input className="inp num" type="number" inputMode="decimal" step="any" min="0" value={value ?? ""}
    onChange={(e) => onChange(e.target.value)} onWheel={(e) => e.target.blur()} {...rest} />
);

export const DateInput = ({ value, onChange }) => (
  <input className="inp" type="date" value={value ?? ""} max={today()} onChange={(e) => onChange(e.target.value)} />
);

export function Select({ value, onChange, options, placeholder = "— Choose —", ...rest }) {
  return (
    <select className="inp" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest}>
      {placeholder !== null && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
}

/** Big toggle buttons, e.g. Towel / Lungi, Cash / UPI. */
export function Choice({ value, onChange, options }) {
  return (
    <div className="choice" role="radiogroup">
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        const l = typeof o === "string" ? o : o.label;
        return (
          <button type="button" key={v} role="radio" aria-checked={value === v}
            className={`choice-btn ${value === v ? "on" : ""}`} onClick={() => onChange(v)}>
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** The highlighted box that shows an automatic calculation. */
export const CalcBox = ({ label, formula, result, tone = "blue" }) => (
  <div className={`calc ${tone}`}>
    <div className="calc-label">{label}</div>
    {formula && <div className="calc-formula">{formula}</div>}
    <div className="calc-result">{result}</div>
  </div>
);

export const Btn = ({ children, kind = "primary", big, ...rest }) => (
  <button type="button" className={`btn ${kind} ${big ? "big" : ""}`} {...rest}>{children}</button>
);

export const Badge = ({ children, cls = "b-blue" }) => <span className={`badge ${cls}`}>{children}</span>;

export const Loading = () => <div className="loading">Loading…</div>;
export const ErrorBox = ({ msg }) => (msg ? <div className="error-box">⚠ {msg}</div> : null);
export const Empty = ({ children }) => <div className="empty">{children}</div>;

export function Stat({ label, value, sub, tone = "", onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} className={`stat ${tone} ${onClick ? "clickable" : ""}`} onClick={onClick}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </Tag>
  );
}

/* ---------------- Tables ---------------- */
const cellText = (c, row) => {
  if (c.csv) return c.csv(row);
  if (c.key) return row[c.key];
  return "";
};

export function Table({ columns, rows, empty = "Nothing here yet.", footer, rowKey = "id" }) {
  if (!rows) return <Loading />;
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead>
          <tr>{columns.map((c, i) => <th key={i} className={c.align === "right" ? "r" : ""}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={row[rowKey] ?? ri}>
              {columns.map((c, i) => (
                <td key={i} data-label={c.label} className={`${c.align === "right" ? "r" : ""} ${c.className || ""}`}>
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot><tr>{columns.map((c, i) => <td key={i} className={c.align === "right" ? "r" : ""}>{footer[i]}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

/** Download as CSV (opens in Excel) + print (save as PDF). */
export function ExportBar({ rows, columns, filename }) {
  const download = () => {
    const cols = columns.filter((c) => !c.noExport);
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [cols.map((c) => esc(c.label)).join(",")]
      .concat((rows || []).map((r) => cols.map((c) => esc(cellText(c, r))).join(",")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="export-bar no-print">
      <Btn kind="ghost" onClick={download} disabled={!rows?.length}>⬇ Excel (CSV)</Btn>
      <Btn kind="ghost" onClick={() => window.print()}>🖨 Print / PDF</Btn>
    </div>
  );
}

/* ---------------- Date range picker ---------------- */
export function rangeFor(preset) {
  const d = new Date();
  const y = d.getFullYear(), m = d.getMonth();
  switch (preset) {
    case "month": return { from: iso(new Date(y, m, 1)), to: today() };
    case "last": return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
    case "fy": { // Indian financial year: April to March
      const start = m >= 3 ? y : y - 1;
      return { from: iso(new Date(start, 3, 1)), to: today() };
    }
    case "week": { const s = new Date(d); s.setDate(d.getDate() - 6); return { from: iso(s), to: today() }; }
    default: return { from: "", to: "" };
  }
}

export function DateRange({ value, onChange }) {
  const presets = [["week", "Last 7 days"], ["month", "This month"], ["last", "Last month"], ["fy", "This year (Apr–Mar)"], ["all", "All"]];
  const active = presets.find(([p]) => {
    const r = rangeFor(p);
    return r.from === value.from && r.to === value.to;
  })?.[0];
  return (
    <div className="range no-print">
      <div className="chips">
        {presets.map(([p, l]) => (
          <button key={p} type="button" className={`chip ${active === p ? "on" : ""}`} onClick={() => onChange(rangeFor(p))}>{l}</button>
        ))}
      </div>
      <div className="range-dates">
        <label>From <input className="inp sm" type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></label>
        <label>To <input className="inp sm" type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></label>
      </div>
    </div>
  );
}

export function confirmDelete(what) {
  return window.confirm(`Delete ${what}?\n\nThis cannot be undone.`);
}
