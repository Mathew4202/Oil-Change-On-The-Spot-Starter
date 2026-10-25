import { Fragment } from "react";
// HQ: everything we know about a car's oil and parts, in one block (new booking, extra cars).
export type HqSpec = {
  engine?: string | null; grade: string; oilSpec?: string | null; capacityL: number; filter?: string | null; fuel?: string | null; wix?: string | null;
  cabin?: string | null; air?: string | null; wiperDriver?: string | null; wiperPassenger?: string | null; filterNote?: string | null;
  source?: string | null; confidence?: string | null; filterInStock?: boolean | null;
};

export default function SpecCard({ spec, engine }: { spec: HqSpec; engine?: string | null }) {
  const diesel = spec.fuel === "diesel";
  const rows: [string, string][] = [
    ["Engine", `${engine || spec.engine || "not on file"}${diesel ? " (diesel)" : spec.fuel === "hybrid" ? " (hybrid)" : ""}`],
    ["Oil", `${spec.grade.replace(/^Euro /, "")} ${diesel ? "diesel oil" : "full synthetic"}, ${spec.capacityL} L`],
    ["Must meet", spec.oilSpec || "not on file yet"],
    ["Oil filter", spec.filter ? `NAPA ${spec.filter}${spec.wix ? ` · WIX ${spec.wix}` : ""}${spec.filterInStock == null ? "" : spec.filterInStock ? " · in stock" : " · buy"}` : "find on site"],
  ];
  if (spec.cabin) rows.push(["Cabin filter", spec.cabin]);
  if (spec.air) rows.push(["Air filter", spec.air]);
  if (spec.wiperDriver || spec.wiperPassenger) rows.push(["Wipers", [spec.wiperDriver && `driver ${spec.wiperDriver}`, spec.wiperPassenger && `passenger ${spec.wiperPassenger}`].filter(Boolean).join(", ")]);
  const from = spec.source === "sheet" || spec.source === "job_history" ? "From a car we've done" : spec.source === "ai_lookup" ? "Found online" : null;
  return (
    <div className="rounded-lg bg-[#f4f6fa] px-3 py-2 text-[14px] leading-snug grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      {rows.map(([k, v]) => <Fragment key={k}><span className="text-[#4a5878]">{k}</span><span className="font-semibold">{v}</span></Fragment>)}
      {spec.filterNote && <span className="col-span-2 text-[12px] text-[#8a5a00]">{spec.filterNote}</span>}
      {from && <span className="col-span-2 text-[12px] text-[#4a5878]">{from}{spec.source === "ai_lookup" && spec.confidence === "low" ? ", not sure: check the oil cap or the manual" : ""}</span>}
    </div>
  );
}
