# Launch TODO — Your Actions Only

✅ = done. [ ] = needs you.

---

## Blockers (do in order)

- [x] Expo token → https://expo.dev/settings/access-tokens → add as `EXPO_TOKEN` in GitHub Secrets
- [ ] `eas credentials` — run in `apps/mobile`, choose Expo managed for iOS + Android
- [x] Apple app record created (OG Fulfillment)
- [x] Apple API key — 3 secrets in GitHub (`APPLE_API_KEY_ID`, `APPLE_API_KEY_ISSUER_ID`, `APPLE_API_KEY`)

---

## Google Play ($25 — optional, iOS-only beta works without it)

- [ ] Register at https://play.google.com/console/signup
- [ ] Create app: name `OG Fulfillment`, package `com.omegagiven.productfulfillment`
- [ ] Create service account → download JSON → add as `GOOGLE_SERVICE_ACCOUNT_KEY` in GitHub Secrets

---

## RevenueCat (free account)

- [ ] Sign up at https://app.revenuecat.com
- [ ] Create project → name: `OG Fulfillment`
- [ ] Add iOS app → bundle ID `com.omegagiven.productfulfillment` → copy `appl_` key
- [ ] Add Android app → same package name → copy `goog_` key
- [ ] Create 3 entitlements: `single_integration`, `all_integrations`, `photo_backup`
- [ ] Paste both keys into `apps/mobile/src/services/cloud/revenueCatService.ts` lines 7–8, then tell me "commit RevenueCat keys"

---

## App Store Subscriptions (after RevenueCat account exists)

App Store Connect → your app → **Monetisation → Subscriptions** → create group `OG Fulfillment Plans`

| Product ID | Price | Name |
|---|---|---|
| `productfulfillment_single_monthly` | $4.99/mo | Integrations |
| `productfulfillment_pro_monthly` | $9.99/mo | Pro |
| `productfulfillment_photo_backup_monthly` | $2.99/mo | Photo Backup |

Then RevenueCat → **Products** → add each ID → attach to matching entitlement.

---

## Google Play Subscriptions (after Play account + RevenueCat)

Play Console → your app → **Monetise → Subscriptions** → create same 3 product IDs + prices → add in RevenueCat.

---

## Firebase (Cloud Sync + promo codes)

- [ ] https://console.firebase.google.com → Create project → `og-product-fulfillment`
- [ ] Firestore → Create → Production mode → pick nearest region
- [ ] Authentication → Email/Password → Enable; Apple → Enable (needs Apple Service ID from developer.apple.com → Identifiers → Services IDs)
- [ ] Project Settings → Your apps → Add web app → copy 6 config values → paste into `apps/mobile/app.json` under `extra`, then tell me "commit firebase config"
- [ ] Firestore → Rules tab → paste contents of `firestore.rules` from repo → Publish
- [ ] Firestore → add promo code doc: Collection `promoCodes`, ID `BETA100`:
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

Tell me "write privacy policy" → I'll generate + hosting instructions.
