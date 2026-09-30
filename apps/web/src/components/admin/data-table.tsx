import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

/** Tabla simple para /admin. Con scroll horizontal en pantallas chicas. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  empty = "Sin datos.",
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="py-10 text-center text-sm text-stone">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line">
          <tr>
            {columns.map((col) => (
              <th
                key={col.header}
                scope="col"
                className={`px-4 py-3 eyebrow ${col.align === "right" ? "text-right" : ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line last:border-0">
              {columns.map((col) => (
                <td
                  key={col.header}
                  className={`px-4 py-3 align-top ${col.align === "right" ? "text-right tabular-nums" : ""}`}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value === "FAILED" || value === "EXPIRED" || value === "PAST_DUE"
      ? "bg-danger/10 text-danger"
      : value === "COMPLETED" || value === "ACTIVE" || value === "IN_STOCK"
        ? "bg-moss/15 text-moss"
        : "bg-sand text-ink";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{value}</span>;
}

export const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString("es-UY", { dateStyle: "short", timeStyle: "short" }) : "—";
