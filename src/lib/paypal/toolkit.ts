/**
 * PayPal Agent Toolkit, connected in-process over MCP and exposed to Claude as tools.
 * Only read actions are enabled: the AI can look at PayPal data but never write to it.
 * Writes go through src/lib/paypal/client.ts after the seller approves them.
 */
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type Anthropic from "@anthropic-ai/sdk";
import { getAccessToken } from "./client";

export const READ_ONLY_ACTIONS = {
  transactions: { list: true },
  insights: { get: true },
  subscriptionPlans: { list: true, show: true },
  subscriptions: { show: true },
  products: { list: true, show: true },
  orders: { get: true },
  disputes: { list: true, get: true },
};

let session: { client: Client; tools: Anthropic.Tool[] } | null = null;

export async function paypalToolkit() {
  if (session) return session;
  const server = new PayPalAgentToolkit({
    accessToken: await getAccessToken(),
    configuration: { actions: READ_ONLY_ACTIONS, context: { sandbox: true } },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const client = new Client({ name: "saka", version: "0.1.0" });
  await client.connect(clientSide);
  const { tools } = await client.listTools();
  session = {
    client,
    tools: tools.map((t) => ({ name: t.name, description: t.description ?? t.name, input_schema: t.inputSchema as Anthropic.Tool.InputSchema })),
  };
  return session;
}

/** Run one toolkit tool and return its text result for a Claude tool_result block. */
export async function callPayPalTool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }> {
  const { client } = await paypalToolkit();
  const res = await client.callTool({ name, arguments: args });
  const parts = (res.content as { type: string; text?: string }[]).filter((c) => c.type === "text").map((c) => c.text ?? "");
  return { text: parts.join("\n") || "(no content)", isError: Boolean(res.isError) };
}
