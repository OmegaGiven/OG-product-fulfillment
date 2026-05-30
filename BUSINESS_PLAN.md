# Product Fulfillment — Business Plan

**App:** Product Fulfillment (working title)
**Category:** Business / Productivity
**Target:** Small e-commerce sellers shipping physical goods
**Model:** Freemium → tiered subscription per integration
**Date:** May 2026

---

## 1. Problem

Small e-commerce sellers shipping physical products manually cross-reference orders across 3–5 browser tabs, copy-paste addresses, handwrite tracking, and email customers individually. On platforms like Etsy and eBay there is no mobile tool that lets a seller scan a label, auto-match it to an order, and send a confirmation email in under 30 seconds — without being at a desktop.

---

## 2. Product

A mobile-only fulfillment assistant that:

1. **Captures** a photo of the shipping label and product
2. **Reads** the label via on-device OCR (no internet required for this step)
3. **Matches** the address to an open order from any connected store
4. **Previews** a customer notification email populated from a template
5. **Sends** the email and marks the order fulfilled on the platform — one tap

Works completely offline for the OCR + matching step. Internet only needed for order sync and send.

**Supported integrations today:** Etsy, Squarespace, eBay, Amazon

---

## 3. Go-to-Market: Getting on the Stores

### Phase 0 — Build (now → 4 weeks)

Before submitting to either store the app needs:

- [ ] App icon + splash screen
- [ ] Privacy policy page (required by both stores — can be a hosted GitHub Pages URL)
- [ ] Permissions justification text (camera, secure storage)
- [ ] EAS build pipeline configured (`eas.json`)
- [ ] Version + build number set in `app.json`

### Phase 1 — Beta (free, limited audience)

**Google Play — cost: $25 one-time developer fee**

| Track | Testers | Review time | Notes |
|---|---|---|---|
| Internal Testing | Up to 100 | None | Fastest. Invite by email. Start here. |
| Closed Testing | Up to 2,000 | 1–3 days | Requires opt-in link. Good for a wider pilot. |
| Open Testing | Unlimited | 1–3 days | Public beta listing on Play Store. |

Recommended path: Internal → Closed Beta with 50–100 small business owners → Open Beta once feedback stabilises.

**Apple App Store — cost: $99/year Apple Developer Program**

| Channel | Testers | Review time | Notes |
|---|---|---|---|
| TestFlight Internal | Up to 100 | None | Team members only |
| TestFlight External | Up to 10,000 | 1–5 days (App Review) | Anyone with link. Best for beta. |
| App Store | Unlimited | 1–5 days | Full public release |

Recommended path: TestFlight External with invite link → App Store listing once stable.

**Total beta cost: ~$124 USD** ($25 Play + $99 Apple Developer).

### Phase 2 — Soft Launch (months 2–4)

- Both stores listed as free with a "beta" or "early access" label
- Collect reviews, crash reports, and feature requests
- Target: 500 active users before introducing paid tiers

### Where to find early users (free channels)

- Etsy seller Facebook groups and subreddits (r/EtsySellers, r/smallbusiness)
- eBay sellers community forums
- Product Hunt launch (free, can drive 500–2,000 installs in 48 hours)
- TikTok/Reels demo of the scan-to-email flow (high visual impact, low cost)
- Cold DM to Etsy sellers with 100+ sales and no shipping software visible in their shop

---

## 4. Monetization Model

### Guiding principle

Integrations require ongoing maintenance as platforms change their APIs. Each active integration is a real operational cost. The pricing model reflects that directly — users pay for the integrations they connect, not for vague "features."

### Tiers

| Plan | Price | Integrations | Runs/month | Notes |
|---|---|---|---|---|
| **Free** | $0 | 1 (choice of any) | 50 | Full feature set, one store |
| **Starter** | $7/month | 2 integrations | Unlimited | Good for Etsy + Squarespace sellers |
| **Pro** | $14/month | 4 integrations | Unlimited | Multi-platform sellers |
| **Business** | $24/month | All current + future | Unlimited | Early adopter price lock |

**Add-on:** $5/month per additional integration (for Starter/Pro who want one more without upgrading)

### Why this works

- Free tier drives installs and word-of-mouth with zero conversion pressure
- Starter at $7 is below the cost of one hour of manual work saved per week
- Integrations as the pricing unit is transparent — seller understands what they're paying for
- Locking early adopters at Business price builds loyalty and reduces churn

### Revenue implementation (technical)

Use **RevenueCat** (free up to $2,500 MRR):

- Manages App Store + Play Store subscriptions in one SDK
- Handles receipt validation, restore purchases, trial periods
- Provides a dashboard with MRR, churn, conversion metrics
- Integrates with Expo/React Native in ~1 day of work

Integration gate logic: on app launch, check RevenueCat entitlements → unlock integrations based on active subscription. No backend needed.

### Revenue projections (conservative)

| Month | Users | Paid (5%) | ARPU | MRR |
|---|---|---|---|---|
| 3 | 500 | 25 | $10 | $250 |
| 6 | 1,500 | 105 | $11 | $1,155 |
| 12 | 4,000 | 320 | $12 | $3,840 |
| 18 | 8,000 | 720 | $13 | $9,360 |

5% paid conversion is conservative for a tool with a clear daily workflow benefit. Many utility apps in this category see 8–12%.

App Store + Play Store take 15% after year one (Apple Small Business Program) and 15% on Play Store under $1M/year.

---

## 5. Pricing for New Integrations

As new platforms are added (Shopify, WooCommerce, BigCommerce, etc.):

- **First 90 days after launch:** included free in all paid plans as a launch incentive
- **After 90 days:** added to Pro and Business automatically; available as $5/month add-on on Starter
- **Maintenance window:** if a platform breaks its API, patched within 7 business days for paid tiers, 30 days for free

This creates a recurring reason for users to stay on higher tiers.

---

## 6. Competitive Landscape

| Tool | Price | Mobile OCR | Multi-platform | Local/offline |
|---|---|---|---|---|
| ShipStation | $9–$229/month | No | Yes | No |
| Shippo | Free + per-label | No | Yes | No |
| Pirateship | Free (label costs) | No | No | No |
| **This app** | $0–$24/month | Yes | Yes | Yes |

The unique position: **mobile-first, scan-to-send in one flow, works offline.** No existing tool targets the seller who ships from home with just their phone.

---

## 7. Technical Roadmap to Store Submission

### Immediate (before first TestFlight/Play beta)

```
1. Add app icon (1024x1024 iOS, adaptive icon Android)
2. Add splash screen
3. Configure eas.json for development + production profiles
4. Write privacy policy (camera, local storage only — no data leaves device)
5. Add expo-tracking-transparency (required by Apple for iOS 14+)
6. Set bundle ID: com.omegagiven.productfulfillment
7. First EAS build: eas build --platform all
```

### Before public launch

```
8. Integrate RevenueCat for subscription management
9. Add paywall screen (shown when user tries to add 2nd integration on free plan)
10. Add onboarding flow (3-screen walkthrough)
11. Crash reporting (Sentry — free tier)
12. Add "Rate this app" prompt after 5 completed fulfillments
```

### Post-launch (based on user feedback)

```
13. Shopify integration
14. WooCommerce integration
15. Tracking number input step in workflow
16. Bulk fulfillment mode (process 10 packages in a session)
17. Email template library (pre-built templates per platform tone)
```

---

## 8. Privacy & Legal (required for store approval)

**Data storage:** All order data, credentials, and photos stored locally on device using `expo-secure-store` and `expo-sqlite`. No data transmitted to any server owned by this app.

**Third-party API calls:** Only to e-commerce platforms the user explicitly connects (Etsy, Squarespace, eBay, Amazon). Credentials never leave the device except to authenticate with those platforms directly.

**Privacy policy must state:**
- Camera permission: used to capture product and shipping label photos
- No analytics or tracking (or list any added)
- Data deletion: uninstalling the app deletes all local data

**Recommended host for privacy policy:** GitHub Pages (free), Notion public page, or Carrd ($9/year).

---

## 9. Summary Milestones

| Milestone | Target | Cost |
|---|---|---|
| First TestFlight external beta | Week 4 | $99 |
| First Google Play closed beta | Week 4 | $25 |
| 100 beta testers | Week 6 | $0 |
| 500 users, first paid conversions | Month 3 | $0 |
| RevenueCat integrated, paywall live | Month 3 | $0 (under $2.5k MRR) |
| Product Hunt launch | Month 4 | $0 |
| $1k MRR | Month 6–8 | — |
| Add Shopify integration | Month 6 | Dev time |
| $5k MRR | Month 12–15 | — |
