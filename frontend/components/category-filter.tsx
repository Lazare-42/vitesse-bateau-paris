"use client";

import { useState } from "react";
import { FastestTable, type FastestEver } from "./fastest-table";
import { OffendersTable } from "./offenders-table";
import { CATEGORY_SHORT, type Category } from "@/lib/api";

type Filter = "tous" | Category;
const ORDER: Category[] = ["passagers", "petits", "fret", "autres"];

function Chips({
  value,
  onChange,
  counts,
}: {
  value: Filter;
  onChange: (f: Filter) => void;
  counts: Record<string, number>;
}) {
  const opts: Filter[] = ["tous", ...ORDER.filter((c) => counts[c])];
  return (
    <div role="radiogroup" aria-label="Type de bateau" className="mb-4 flex flex-wrap gap-2">
      {opts.map((f) => (
        <button
          key={f}
          role="radio"
          aria-checked={value === f}
          onClick={() => onChange(f)}
          className={`rounded-full border px-3 py-1 text-xs transition-colors ${
            value === f
              ? "border-foreground bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {f === "tous" ? "Tous" : CATEGORY_SHORT[f]}{" "}
          <span className="opacity-60">{f === "tous" ? counts.tous : counts[f]}</span>
        </button>
      ))}
    </div>
  );
}

function countBy<T extends { category?: Category }>(rows: T[]) {
  const c: Record<string, number> = { tous: rows.length };
  for (const r of rows) if (r.category) c[r.category] = (c[r.category] || 0) + 1;
  return c;
}

export function FastestByCategory({ data }: { data: (FastestEver & { category?: Category })[] }) {
  const [f, setF] = useState<Filter>("tous");
  const rows = f === "tous" ? data : data.filter((r) => r.category === f);
  return (
    <>
      <Chips value={f} onChange={setF} counts={countBy(data)} />
      <FastestTable data={rows} />
    </>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OffenderRow = Parameters<typeof OffendersTable>[0]["data"][number] & { category?: Category };

export function OffendersByCategory({ data }: { data: OffenderRow[] }) {
  const [f, setF] = useState<Filter>("tous");
  const rows = f === "tous" ? data : data.filter((r) => r.category === f);
  return (
    <>
      <Chips value={f} onChange={setF} counts={countBy(data)} />
      <OffendersTable data={rows} />
    </>
  );
}
