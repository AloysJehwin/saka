import type { overview, forecastFor, historyFor } from "@/lib/server/shop";
import type { experimentView, ExperimentRow } from "@/lib/server/experiments";
import type { clubState } from "@/lib/server/club";
import type { SegmentVoices, AdvisorResult, Proposal } from "@/lib/ai/claude";

export type Overview = NonNullable<ReturnType<typeof overview>> & { runningTest: string | null };
export type Forecast = ReturnType<typeof forecastFor>;
export type HistoryView = ReturnType<typeof historyFor>;
export type ExperimentView = ReturnType<typeof experimentView>;
export type { ExperimentRow, SegmentVoices, AdvisorResult, Proposal };
export type ClubState = Awaited<ReturnType<typeof clubState>>;
export type PayPalSummary = { from: string; to: string; transactions: { id: string; date: string; amount: number; currency: string; fee: number | null; status: string; code: string; country: string | null }[] };
