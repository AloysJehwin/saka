# saka · PriceTwin

**Test a price change on AI copies of your real customers, built from your PayPal sales,
then let PayPal safely test it on real checkouts before you roll it out.**

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/) on Devpost.
Status: in active development. See [PLAN.md](./PLAN.md) for the full build plan and research log.

---

## The problem

Small online sellers set prices by guessing. Raise too much and loyal customers leave.
Never raise and rising costs eat the margin. Big companies run pricing teams and experiments;
a one-person shop on PayPal has nothing.

## What saka does

1. **Learn** from PayPal: sales, PayPal fees, buyer countries, subscriptions.
2. **Build customer twins**: segments such as regulars, bulk buyers and occasional buyers,
   each with its own price sensitivity learned from real purchases.
3. **Stays honest**: shows how much your history can and cannot tell, as a forecast range.
4. **Answer "what if"**: a price slider forecasts units, revenue and profit after PayPal fees,
   with an uncertainty range, the segment most at risk, and plain-English reactions.
5. **Test on real PayPal checkouts**: a price canary shows the new price to a slice of buyers.
   A Bayesian update narrows the range with every PayPal purchase and stops the test if it is losing.
6. **Apply with PayPal-native levers**: new price for new customers, intro offers, a consent-first
   plan switch for existing subscribers, or a plan-wide update. Every write needs your approval.

## How PayPal is used

| Stage | PayPal capability |
|---|---|
| Learn | PayPal Agent Toolkit (`list_transactions`, `get_merchant_insights`, `list_subscription_plans`), Transaction Search API |
| Test | PayPal JavaScript SDK checkout, Orders v2 API, Subscriptions plans, webhooks |
| Apply | Catalog Products API, Billing Plans (priced trial cycles), `update-pricing-schemes`, subscription `revise` with buyer consent |
| Protect | Webhooks for captures, refunds, cancellations and disputes; webhook signature verification |

Everything runs against the **PayPal sandbox**.

## How AI is used

- **Claude Opus 5.5** through the official Anthropic TypeScript SDK.
- The statistical engine produces the numbers: elasticity with Bayesian shrinkage, Monte Carlo ranges,
  difference-in-differences checks on past price changes, and a Bayesian price canary.
- Claude voices each customer segment, explains the forecast, and proposes pricing actions as structured outputs.
- Claude reads the seller's PayPal data through the **PayPal Agent Toolkit**, connected in-process over MCP.
- Nothing is written to PayPal until the seller approves it.

## Data

The demo shop's history is real: the **UCI Online Retail II** dataset, transactions of a UK online
gift retailer from December 2009 to December 2011. `data/uci/lines.csv.gz` holds the cleaned purchase
lines of the 60 best-selling products (108,779 lines).

> Chen, D. (2012). Online Retail II [Dataset]. UCI Machine Learning Repository.
> https://doi.org/10.24432/C5CG6D. Licensed under CC BY 4.0.

To regenerate it:

```bash
curl -L -o online_retail_ii.zip "https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip"
unzip online_retail_ii.zip
pnpm tsx scripts/import-uci.ts ./online_retail_II.xlsx 60
```

## Getting started

Requirements: Node 24+, pnpm, a PayPal developer sandbox app, an Anthropic API key.

```bash
pnpm install
cp .env.example .env.local   # fill in your keys
pnpm dev                     # http://localhost:3000
pnpm test                    # engine unit tests
```

PayPal sandbox setup: create an app in the PayPal developer dashboard, enable Transaction search
and Subscriptions on it, and add a webhook to `/api/paypal/webhook`. Details are in
[PLAN.md, section 8](./PLAN.md#8-owner-setup-checklist-needs-your-accounts).

## Tech stack

Next.js 16 · TypeScript · Tailwind · AG Grid · Node built-in SQLite · Anthropic SDK ·
PayPal Agent Toolkit · Model Context Protocol SDK · Vitest · Render

## License

[MIT](./LICENSE). Dataset under CC BY 4.0 as cited above.
