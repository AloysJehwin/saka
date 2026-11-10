# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Small online sellers who take payment through PayPal: shops selling one-off products, and creators selling
monthly subscriptions. They set prices by guessing. They open saka when they are thinking about a price change
and want to know who will leave, what it does to profit after PayPal fees, and how to try it without risking
their customers. The UI is built for a real seller using it as a daily tool; the hackathon demo walks through
that working tool rather than a staged presentation.

## Product Purpose

saka (product name in the demo: PriceTwin) is a pricing copilot. It learns customer groups ("twins") and price
sensitivity from the seller's sales history, forecasts a price change with an honest range, has Claude explain
the numbers and propose levers, then tests the new price on a slice of real PayPal checkouts before rollout.
Success: the seller changes a price with evidence instead of a guess, and stops a bad change before most
customers see it.

## Positioning

Forecasts are anchored to real buying data and then checked on real PayPal checkouts. A Bayesian price test
narrows the range with every purchase and stops automatically when the new price is losing. AI explains and
proposes; statistics produce the numbers; nothing is written to PayPal without the seller clicking Approve.

## Operating Context

- Sales history: UCI Online Retail II (real UK gift shop, CC BY 4.0), top 60 products in `data/uci/lines.csv.gz`.
- Live data: PayPal sandbox (transactions, plans, subscriptions, disputes) through REST and the Agent Toolkit.
- Demo shop: a small UK gift shop selling one-off products (for example the jumbo bag) plus a monthly
  "Gift Box Club" subscription on PayPal, so every lever has something to apply to. Currency GBP.
- Buyers see a storefront page with PayPal checkout buttons; the price they see depends on the test arm.

## Capabilities and Constraints

- Engine (`src/lib/engine`): weekly series, price-change detection, customer groups (regulars, bulk buyers,
  new customers, occasional buyers), elasticity with Bayesian shrinkage, Monte Carlo forecast including
  PayPal fees (default 2.9% + £0.30), difference-in-differences history check, Bayesian price canary
  (stop below 5% chance of winning, roll out above 95%, minimum 60 views per price).
- History is too noisy to prove price sensitivity on its own (documented in PLAN.md section 13). The UI must
  say so plainly instead of implying precision.
- PayPal sandbox only. Plan-wide price updates are rejected by this sandbox (422); apply prices through a new
  plan for new customers and a consent-first subscription revise.
- The sandbox merchant cannot take server-side card payments, so simulated shoppers in the price test are
  labelled as simulated and real PayPal checkouts are counted separately.
- Claude Opus 5.5 writes customer-group reactions and advisor proposals; it never invents numbers.

## Brand Commitments

- Name: saka; product name PriceTwin. Plain-English copy for non-statisticians.

## Evidence on Hand

- Real history: UCI Online Retail II, DOI 10.24432/C5CG6D.
- Live sandbox: plan P-4062070307478343ANLZNQ6Q (trial £12, then £18), sandbox transactions.
- No customers, testimonials or benchmark claims exist; do not invent them.

## Product Principles

1. Honest uncertainty: always show the range, and say when history cannot tell.
2. Evidence before rollout: real checkouts decide, not the forecast.
3. The seller approves every write to PayPal.
4. Numbers come from the model; AI explains them in plain language.
5. Built for repeated daily use: scannable, consistent, fast.
