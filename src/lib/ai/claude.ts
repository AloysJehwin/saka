/**
 * Claude layer. The pricing engine produces every number; Claude explains them, voices each customer
 * segment, and proposes PayPal actions. Proposals are never executed here: the seller approves them in the UI.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { paypalToolkit, callPayPalTool } from "../paypal/toolkit";

export const MODEL = "claude-opus-5-5";
// Server-side refusal fallback: if a request is declined, the API re-runs it on a fallback model.
const FALLBACK = { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const };

let client: Anthropic | null = null;
// Keys that are not scoped to a workspace must name one on every request.
const claude = () => (client ??= new Anthropic(
  process.env.ANTHROPIC_WORKSPACE_ID ? { defaultHeaders: { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } } : {},
));

// ---------------------------------------------------------------------------------------------
// Segment voices
// ---------------------------------------------------------------------------------------------
export const SegmentVoicesSchema = z.object({
  headline: z.string().describe("One plain-English sentence summarising how customers react overall."),
  segments: z.array(z.object({
    segment: z.string(),
    reactions: z.array(z.string()).describe("Two short first-person quotes a customer in this segment might say."),
    why: z.string().describe("One sentence on why this segment reacts this way, consistent with its predicted retention."),
  })),
});
export type SegmentVoices = z.infer<typeof SegmentVoicesSchema>;

export type SegmentFacts = { segment: string; name: string; description: string; share: number; retainedP50: number; retainedP10: number; retainedP90: number };

export async function segmentVoices(input: { product: string; currency: string; currentPrice: number; newPrice: number; segments: SegmentFacts[] }): Promise<SegmentVoices> {
  const facts = input.segments.map((s) =>
    `- ${s.name} (${s.segment}): ${s.description}. ${Math.round(s.share * 100)}% of units. Predicted to keep ${Math.round(s.retainedP50 * 100)}% of purchases (80% range ${Math.round(s.retainedP10 * 100)}% to ${Math.round(s.retainedP90 * 100)}%).`).join("\n");
  const res = await claude().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...FALLBACK,
    output_config: { effort: "low", format: zodOutputFormat(SegmentVoicesSchema) },
    system: "You write short, realistic customer reactions for a small online shop's pricing tool. " +
      "The statistical model has already predicted each segment's behaviour; never contradict or invent numbers. " +
      "A segment predicted to keep most purchases sounds mildly annoyed at most; one predicted to drop a lot sounds ready to leave. Plain everyday language, no marketing tone.",
    messages: [{
      role: "user",
      content: `Product: ${input.product}. Price change: ${input.currency}${input.currentPrice.toFixed(2)} to ${input.currency}${input.newPrice.toFixed(2)}.\nSegments:\n${facts}`,
    }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Claude did not return segment voices");
  return res.parsed_output;
}

// ---------------------------------------------------------------------------------------------
// Pricing advisor: reads PayPal via the Agent Toolkit, then proposes actions
// ---------------------------------------------------------------------------------------------
export const ProposalSchema = z.object({
  kind: z.enum(["start_canary", "new_customers_only", "intro_offer", "consent_switch", "update_plan_price", "hold_price"]),
  title: z.string(),
  newPrice: z.number().nullable(),
  introPrice: z.number().nullable(),
  introMonths: z.number().int().nullable(),
  canaryShare: z.number().nullable().describe("Share of new checkouts that see the test price, 0 to 1."),
  rationale: z.string(),
  risk: z.string(),
});
export type Proposal = z.infer<typeof ProposalSchema>;

const PROPOSE_TOOL: Anthropic.Beta.BetaTool = {
  name: "propose_actions",
  description: "Submit your final pricing recommendation as 1 to 3 proposed actions. Call this exactly once, at the end.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["summary", "proposals"],
    properties: {
      summary: { type: "string", description: "Two or three plain-English sentences for the seller." },
      proposals: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["kind", "title", "newPrice", "introPrice", "introMonths", "canaryShare", "rationale", "risk"],
          properties: {
            kind: { type: "string", enum: ["start_canary", "new_customers_only", "intro_offer", "consent_switch", "update_plan_price", "hold_price"] },
            title: { type: "string" },
            newPrice: { type: ["number", "null"] },
            introPrice: { type: ["number", "null"] },
            introMonths: { type: ["integer", "null"] },
            canaryShare: { type: ["number", "null"] },
            rationale: { type: "string" },
            risk: { type: "string" },
          },
        },
      },
    },
  },
};

export type AdvisorInput = { product: string; currency: string; currentPrice: number; candidatePrice: number; forecastSummary: string; usePayPalData: boolean };
export type AdvisorResult = { summary: string; proposals: Proposal[]; paypalToolsUsed: string[] };

export async function advise(input: AdvisorInput): Promise<AdvisorResult> {
  const toolkit = input.usePayPalData ? await paypalToolkit() : null;
  const tools: Anthropic.Beta.BetaToolUnion[] = [...(toolkit?.tools ?? []), PROPOSE_TOOL];
  const used: string[] = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{
    role: "user",
    content:
      `Product: ${input.product}. Current price ${input.currency}${input.currentPrice.toFixed(2)}; the seller is considering ${input.currency}${input.candidatePrice.toFixed(2)}.\n` +
      `Forecast from the pricing engine:\n${input.forecastSummary}\n\n` +
      (toolkit ? "Use the PayPal tools to check recent sales, fees, subscription plans and disputes if they help. " : "") +
      "Then call propose_actions once with your recommendation.",
  }];

  for (let turn = 0; turn < 8; turn++) {
    const res = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      ...FALLBACK,
      output_config: { effort: "medium" },
      system:
        "You are a careful pricing advisor for a small online shop that sells through PayPal. " +
        "The forecast numbers come from a statistical model and are uncertain; respect the ranges. " +
        "Prefer reversible, low-risk moves: a price canary on a slice of new PayPal checkouts before any full rollout, " +
        "new prices for new customers only, intro offers using PayPal trial billing cycles, and consent-first plan switches for existing subscribers. " +
        "Recommend holding the price when the downside is large. Never claim an action has been executed: the seller approves each one.",
      tools,
      messages,
    });
    if (res.stop_reason === "refusal") throw new Error("Claude declined the request");
    messages.push({ role: "assistant", content: res.content });

    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const final = calls.find((c) => c.name === PROPOSE_TOOL.name);
    if (final) {
      const parsed = z.object({ summary: z.string(), proposals: z.array(ProposalSchema) }).safeParse(final.input);
      if (parsed.success) return { ...parsed.data, paypalToolsUsed: used };
    }
    if (res.stop_reason !== "tool_use" || calls.length === 0) break;

    const results = await Promise.all(calls.map(async (c): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
      if (c.name === PROPOSE_TOOL.name) return { type: "tool_result", tool_use_id: c.id, content: "Invalid proposal format, please call propose_actions again.", is_error: true };
      used.push(c.name);
      try {
        const r = await callPayPalTool(c.name, c.input as Record<string, unknown>);
        return { type: "tool_result", tool_use_id: c.id, content: r.text.slice(0, 20000), is_error: r.isError };
      } catch (e) {
        return { type: "tool_result", tool_use_id: c.id, content: `Tool failed: ${(e as Error).message}`, is_error: true };
      }
    }));
    messages.push({ role: "user", content: results });
  }
  throw new Error("Advisor did not return a recommendation");
}
