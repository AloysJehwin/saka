---
name: saka
description: Pricing copilot for small PayPal sellers. Swiss grid on a working screen; every forecast is a range bar.
colors:
  paper: "#fafaf8"
  sheet: "#ffffff"
  ink: "#111111"
  ink-2: "#474744"
  ink-3: "#6b6b67"
  rule: "#deded9"
  rule-2: "#c9c9c3"
  ghost: "#bdbdb7"
  wash: "#efefeb"
  signal-red: "#e1001f"
  red-ink: "#b80019"
  green: "#0b7a3b"
  amber: "#a65600"
  rail: "#111111"
  rail-ink: "#f4f4f1"
  rail-ink-2: "#a8a8a2"
  rail-rule: "#2c2c2a"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  figure:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "-0.03em"
  section:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  note:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  code:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: "0"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.signal-red}"
    textColor: "{colors.paper}"
  button-secondary:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-secondary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.red-ink}"
    rounded: "{rounded.none}"
    height: "40px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "40px"
  nav-rail:
    backgroundColor: "{colors.rail}"
    textColor: "{colors.rail-ink}"
---

# Design System: saka

## Overview

saka is a working screen for a small seller deciding a price. The world is a Swiss grid: black ink on neutral paper, hairline rules, flush-left type, no rounded corners, no shadows. One signal red marks the two things that matter most on any screen: the likely value of a forecast and the price under test.

The signature is the **range bar**. Every forecast saka makes is drawn as one: the low-to-high case as an ink bar on a hairline scale, the likely value as a red tick, today as a hollow tick, and earlier ranges as fading stacked lines underneath, so a seller watches uncertainty narrow as evidence arrives. A price is a range, not a number, and the interface never shows a single forecast figure without its bar.

Motion is stepped, never eased: state changes move in two frames over 90ms. Charts are stepped too, because each week of sales is a fact, not a curve.

## Colors

### Primary
- **Ink** (`#111111`): text, bars, primary buttons, section rules, the nav rail.
- **Signal red** (`#e1001f`): the likely value tick, the price under test, the slider thumb, focus rings, primary-button hover. `red-ink` (`#b80019`) is the text-safe shade for red words.

### Neutral
- **Paper** (`#fafaf8`) is the page; **sheet** (`#ffffff`) is inputs and the storefront.
- **ink-2 / ink-3** step down for secondary and tertiary text. **rule / rule-2** are hairlines; **ghost** is the earlier-range lines; **wash** fills the units area and hover rows.

### State
- **Green** (`#0b7a3b`) means ready to roll out, accepted by PayPal, the 95% line.
- **Amber** (`#a65600`) means a test is running.
- State colours appear only where they carry that meaning, as text and 1px borders, never as fills.

### Named Rules
- **The One Red Rule.** Red marks the likely value and the test price. Nothing decorative is red.
- **Hairlines, not boxes.** Sections are separated by a 1px ink top rule; rows by 1px `rule`. No cards.

## Typography

Geist for everything, Geist Mono only for identifiers (PayPal order and plan ids, item codes). All figures use tabular numerals so they line up on the decimal.

### Hierarchy
- **Display** 32px on mobile, 40px desktop, bold, tight tracking: page titles only.
- **Figure** 40px bold: headline numbers (units a week, chance profit goes up).
- **Section** 17px semibold: section titles, set under the ink rule.
- **Body** 14px; **label** 13px medium for field labels; **note** 12px for sources and assumptions.

### Named Rules
- **No kickers.** No eyebrow labels above titles; context goes in the sentence under them.
- **Say what it means.** Labels are plain sentences ("Units change for a 1% price rise"), not jargon ("elasticity").

## Layout

A left rail (220px, ink) holds navigation and the signed-in user; it becomes a horizontal scrolling bar under 1024px. A sticky product bar sits above every app screen. Content runs flush left with a 68ch measure for prose. Grids collapse to one column below `md` (768px); KPI rows go 1 → 2 → 4 columns. Wide tables scroll horizontally inside their section rather than squeezing.

## Elevation & Depth

Flat. No shadows, no blur, no layered cards. Depth is expressed only by the dark rail and the dark storefront header against paper.

## Shapes

Square everything: radius 0 on buttons, inputs, badges and bars. The only round shape is the share dot, whose size reads as a group's share of units on a fixed five-step ramp.

## Components

### Buttons
Primary: ink fill, paper text, red on hover. Secondary: 1px ink outline, inverts on hover. Danger: 1px red outline, red fill on hover. Quiet: underlined text. Busy state shows a spinner and disables.

### Approve action
Every PayPal write is an approve action: a plain sentence saying exactly what will happen, one button, then PayPal's answer inline: a green-bordered result or a red-bordered refusal quoting PayPal's issue code. Refusals are never hidden.

### Range bar
Large form for headline forecasts, small form inside tables. Marks such as "no change" are dashed vertical lines; their labels hide rather than collide with the range labels.

### Status
A 24px outlined tag with a square dot: Testing (amber), Ready (green), Stopped (red), Done (ink). Stopped items elsewhere are struck through, not deleted, so the record stays complete.

### Inputs
40px, 1px `rule-2` border that darkens to ink on hover and focus, £ prefix for money. The price slider is a 2px ink track with a square red thumb.

### Data grid
AG Grid with the chrome removed: no outer border, ink header rule, hairline rows, tabular figures.

## Do's and Don'ts

- Do draw every forecast as a range bar with its likely value in red.
- Do keep earlier ranges visible as ghosts so narrowing is visible.
- Do quote PayPal's own refusal text when a write fails.
- Do label simulated shoppers separately from real PayPal checkouts.
- Don't use rounded corners, shadows, gradients, or blur.
- Don't ease motion; step it, and drop it under reduced motion.
- Don't use smooth curves for sales data.
- Don't add eyebrow labels, emoji icons, or coloured left borders thicker than 1px.
