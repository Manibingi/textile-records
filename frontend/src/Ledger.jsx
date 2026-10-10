import { Table, ExportBar } from "./ui";
import { rs, dt } from "./format";

/** Running account: opening balance, + (earned / billed), − (paid / received). */
export default function Ledger({ data, plusLabel, minusLabel, balanceLabel, filename }) {
  if (!data) return null;
  const rows = [{ id: "open", date: null, ref: "Opening", detail: "Opening balance", plus: 0, minus: 0, balance: data.opening }, ...data.entries]
    .map((r, i) => ({ ...r, key: i }));
  const cols = [
    { label: "Date", render: (r) => (r.date ? dt(r.date) : "—"), csv: (r) => dt(r.date) },
    { label: "Ref", key: "ref", render: (r) => <b>{r.ref}</b> },
    { label: "Details", key: "detail" },
    { label: plusLabel, key: "plus", render: (r) => (r.plus ? rs(r.plus) : ""), align: "right" },
    { label: minusLabel, key: "minus", render: (r) => (r.minus ? rs(r.minus) : ""), align: "right" },
    { label: balanceLabel, key: "balance", render: (r) => <b className={r.balance < 0 ? "neg" : ""}>{rs(r.balance)}</b>, align: "right" },
  ];
  return (
    <>
      <ExportBar rows={rows} columns={cols} filename={filename} />
      <Table rows={rows} columns={cols} rowKey="key" />
    </>
  );
}
