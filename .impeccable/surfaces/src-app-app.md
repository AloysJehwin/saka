---
version: 1
slug: "src-app-app"
primary_target: "src/app/app"
related_targets: ["src/app/store","src/app/sign-in"]
---

# Surface brief: seller app (/app/*), storefront (/store/*), sign-in

Mode: Operate. Seller app used daily by a small PayPal seller; storefront is the buyer view of a price test.

Audience and job: a small shop owner deciding a price change: read customer groups, check what history can prove, try a price, test it on real PayPal checkouts, then apply it with PayPal-native levers. Every PayPal write sits behind an Approve button.

Constraints: PayPal sandbox only; simulated shoppers labelled; Claude never invents numbers; Google/GitHub sign-in, anyone may enter the shared demo shop.

## Direction contract

THESIS: A price is a range, not a number. The surface refuses the KPI-card dashboard of single big figures; every forecast and test result is drawn as a range that the seller watches shrink as PayPal evidence arrives.

OWN-WORLD: Swiss International Style on a working screen. Neutral white ground, black ink, one signal red reserved for the likely value and the price under test; a black rail shell with white labels; strict 12-column grid, flush-left grotesk (Geist) with heavy weights for figures, tabular numerals everywhere, hairline rules, square corners, no shadows, no gradients. State colours (green ready, amber testing, red stop) only where they carry meaning.

STORY: The seller sees how sure saka is, learns history alone cannot settle it, tries a price, watches real checkouts narrow the range, and approves the PayPal change.

FIRST VIEWPORT: Black rail left (wordmark, five steps, storefront link, account). Content: product bar with picker and list price; a row of four range-bar figures; customer-groups table below with a stepped weekly chart beside it; live PayPal sales at the right edge. Primary action per screen top-right.

FORM: Swiss grid + range bar, candidate 7 of 7 on the ordered list (1 Bank of England fan chart, 2 FT data graphics, 3 wholesale catalogue, 4 till receipt, 5 swing tag, 6 ledger, 7 Swiss style). Signature: the range bar, p10 to p90 ink bar on a hairline scale, red median tick, hollow tick for today, faint ghost ticks for earlier widths. Raises: steps(2) 90ms state changes, no eased motion (acetate manual); stopped tests and dismissed proposals stay visible, struck through (ticket wallet); group share as a fixed dot-size ramp (star atlas); tabular figures aligned on the decimal (datamatics); stepped orthogonal chart lines only, never smoothed (transit diagram). seed:85d1eb1efef3d498

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
