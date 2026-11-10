"use client";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { RangeBar, ShareDot } from "./charts";
import { int, pctPlain } from "@/lib/client/format";
import type { Forecast } from "@/lib/client/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "inherit", fontSize: 14, headerFontSize: 13, headerFontWeight: 600,
  backgroundColor: "#ffffff", foregroundColor: "#111111", headerBackgroundColor: "#ffffff", headerTextColor: "#111111",
  borderColor: "#deded9", rowBorder: { color: "#deded9" }, wrapperBorder: false, wrapperBorderRadius: 0, borderRadius: 0,
  rowHoverColor: "#efefeb", selectedRowBackgroundColor: "#efefeb", accentColor: "#e1001f",
  spacing: 7, rowHeight: 66, headerHeight: 40, cellHorizontalPadding: 14,
});

type Row = Forecast["groups"][number];
const reactsLabel = (s: number) => (s < 0.85 ? "Less than average" : s > 1.15 ? "More than average" : "About average");

/** The customer groups ("twins") behind every forecast, with how many each price would keep. */
export function GroupsGrid({ rows, newPrice }: { rows: Row[]; newPrice: string }) {
  const lowest = Math.min(...rows.map((r) => r.retained.p50));
  const cols: ColDef<Row>[] = [
    { field: "name", headerName: "Group", flex: 1.6, minWidth: 220, cellRenderer: (p: ICellRendererParams<Row>) => (
      <div className="flex h-full flex-col justify-center whitespace-normal py-2 leading-tight">
        <span className="font-semibold">{p.data!.name}{p.data!.retained.p50 === lowest && <span className="ml-2 text-[12px] font-semibold text-red-ink">Most at risk</span>}</span>
        <span className="mt-0.5 text-[12px] leading-snug text-ink-3">{p.data!.description}</span>
      </div>
    ) },
    { field: "share", headerName: "Share of units", width: 150, sort: "desc", cellRenderer: (p: ICellRendererParams<Row>) => (
      <span className="flex h-full items-center gap-3 num"><span className="grid w-5 place-items-center"><ShareDot share={p.value} /></span>{pctPlain(p.value)}</span>
    ) },
    { field: "customers", headerName: "Customers", width: 120, type: "rightAligned", valueFormatter: (p) => int(p.value) },
    { field: "weeklyUnits", headerName: "Units a week", width: 130, type: "rightAligned", valueFormatter: (p) => int(p.value) },
    { field: "typicalQty", headerName: "Typical order", width: 130, type: "rightAligned", valueFormatter: (p) => `${int(p.value)} units` },
    { field: "sensitivity", headerName: "Reacts to price", width: 160, valueFormatter: (p) => reactsLabel(p.value) },
    { colId: "kept", headerName: `Keep buying at ${newPrice}`, flex: 1.4, minWidth: 220, sortable: true,
      comparator: (_a, _b, na, nb) => na.data!.retained.p50 - nb.data!.retained.p50,
      cellRenderer: (p: ICellRendererParams<Row>) => (
        <div className="flex h-full items-center gap-3">
          <span className="w-11 text-right font-semibold num">{pctPlain(p.data!.retained.p50)}</span>
          <div className="flex-1"><RangeBar size="sm" low={p.data!.retained.p10} mid={p.data!.retained.p50} high={p.data!.retained.p90} base={1} domain={[0.6, 1.1]} format={(v) => pctPlain(v)} label={p.data!.name} /></div>
        </div>
      ) },
  ];
  return (
    <div className="saka-grid w-full overflow-x-auto">
      <div style={{ minWidth: 1000 }}>
        <AgGridReact<Row> theme={theme} rowData={rows} columnDefs={cols} domLayout="autoHeight" suppressCellFocus
          defaultColDef={{ sortable: true, resizable: true, suppressMovable: true }} getRowId={(p) => p.data.id} />
      </div>
    </div>
  );
}
