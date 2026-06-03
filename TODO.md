# Launch TODO — Your Actions Only

✅ = done. [ ] = needs you.

---

## Blockers (do in order)

- [x] Expo token → https://expo.dev/settings/access-tokens → add as `EXPO_TOKEN` in GitHub Secrets
- [x] `eas credentials` — Android keystore exists; iOS handled automatically by EAS CI via Apple API key secrets
- [x] Apple app record created (OG Fulfillment)
- [x] Apple API key — 3 secrets in GitHub (`APPLE_API_KEY_ID`, `APPLE_API_KEY_ISSUER_ID`, `APPLE_API_KEY`)

---

## Google Play ($25 — optional, iOS-only beta works without it)

- [x] Register at https://play.google.com/console/signup
- [x] Create app: name `OG Fulfillment`, package `com.omegagiven.ogfulfillment`
- [x] Create service account `play-publisher@og-fulfillment.iam.gserviceaccount.com` → key at `.playwright-mcp/play-publisher-key.json` → wired into `eas.json`
- [x] Service account added to Play Console (Users & Permissions) with Release permissions
- [x] Add `GOOGLE_SERVICE_ACCOUNT_KEY` to GitHub Secrets

---

## RevenueCat (free account)

- [x] Sign up at https://app.revenuecat.com
- [x] Create project → name: `OG Fulfillment`
- [x] Add iOS app → bundle ID `com.omegagiven.ogfulfillment` → `appl_HBJIncohBoiBCSCAqDdXvPcoDrC`
- [x] Add Android app → package `com.omegagiven.ogfulfillment` → `goog_hXzrxVAphxgplXbYNBFGXMCpIHa`
- [x] Create 3 entitlements: `single_integration`, `all_integrations`, `photo_backup`
- [x] Keys wired into `apps/mobile/src/services/cloud/revenueCatService.ts`

---

## App Store Subscriptions (after RevenueCat account exists)

- [x] App created in App Store Connect (ID: 6776081678)
- [x] Subscription group `OG Fulfillment Plans` created (ID: 22130261)
- [x] `productfulfillment_single_monthly` — Integrations Monthly (1 month)
- [x] `productfulfillment_pro_monthly` — Pro Monthly (1 month)
- [x] `productfulfillment_photo_backup_monthly` — Photo Backup Monthly (1 month)
- [x] Set prices: $4.99 (single) / $9.99 (pro) / $2.99 (photo backup)
- [x] Add display name + description localizations for each subscription (English U.S.)
- [x] RevenueCat → Products → add each ID → attach to matching entitlement

---

## Google Play Subscriptions (after Play account + RevenueCat)

- [ ] **Set up Google Payments merchant account** — Play Console → Subscriptions page → "Set up a merchant account" (requires business/banking info, Google reviews in 1–3 days)
- [ ] Once approved: Play Console → Monetise → Subscriptions → create these 3 product IDs:
  - `productfulfillment_single_monthly` — $4.99/month
  - `productfulfillment_pro_monthly` — $9.99/month
  - `productfulfillment_photo_backup_monthly` — $2.99/month
- [ ] RevenueCat → Product catalog → Products → add same 3 IDs under OG Fulfillment (Play Store) → attach to matching entitlements

---

## Firebase (Cloud Sync + promo codes)

- [x] https://console.firebase.google.com → Create project → `og-product-fulfillment`
- [x] Firestore → Create → Production mode → pick nearest region
- [x] Authentication → Email/Password → Enable; Apple → Enable (needs Apple Service ID from developer.apple.com → Identifiers → Services IDs)
- [x] Project Settings → Your apps → Add web app → copy 6 config values → paste into `apps/mobile/app.json` under `extra`, then tell me "commit firebase config"
- [x] Firestore → Rules tab → paste contents of `firestore.rules` from repo → Publish
- [x] Firestore → add promo code doc: Collection `promoCodes`, ID `BETA100`:
  ```json
  { "discountPercent": 100, "entitlement": "all_integrations", "durationDays": 90, "maxUses": 500, "usesRemaining": 500, "validUntil": "2026-12-31", "active": true }
  ```

---

## Screenshots (before public listing, not needed for TestFlight beta)

- [ ] iPhone 6.9" simulator (iPhone 16 Pro Max) — capture: Home, Integrations, Fulfillment Run, Order match, Message preview
- [ ] Android Pixel emulator — same screens

Tell me "screenshots ready" with file paths → I'll frame them.

---

## Privacy Policy (required before App Store review)

- [x] Policy generated → `privacy-policy.html` in repo root
- [x] Host it: pushed to GitHub → Pages enabled → branch: main, folder: /
  - URL: `https://omegagiven.github.io/OG-fulfillment/privacy-policy.html`
  - [ ] Add that URL to App Store Connect → App Information → Privacy Policy URL
