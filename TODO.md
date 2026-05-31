# Launch TODO

Legend: **[YOU]** = requires your accounts/browser/device. **[ME]** = hand back to Claude, I'll write the code.

---

## Phase 1 — EAS + Store Accounts (do this first, everything depends on it)

### 1.1 Expo / EAS account

- [ ] **[YOU]** Create free account at https://expo.dev/signup if you don't have one
- [ ] **[YOU]** In terminal, from project root:
  ```bash
  npm install -g eas-cli
  cd apps/mobile
  eas login
  eas init
  ```
  `eas init` adds a `projectId` to `app.json`. When done, come back and say **"eas init done"** →
- [ ] **[ME]** I'll commit the updated `app.json` with the new `projectId`

- [ ] **[YOU]** Generate an EAS token:
  ```bash
  eas account:create-token
  ```
  Copy the token value. Go to GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
  - Name: `EXPO_TOKEN`
  - Value: paste token

---

### 1.2 Google Play Developer account

- [ ] **[YOU]** Pay the $25 one-time fee and register at https://play.google.com/console/signup
  - Use your business email
  - Account type: Individual is fine for now
  - Takes 24–48 hours to verify

- [ ] **[YOU]** Once verified, create the app:
  - Play Console → **All apps → Create app**
  - App name: `Product Fulfillment`
  - Default language: English (United States)
  - App or game: **App**
  - Free or paid: **Free**
  - Accept policies → Create

- [ ] **[YOU]** Set up Google Play API access for automated submissions:
  1. Play Console → **Setup → API access**
  2. Click **Link to a Google Cloud project** (create new one if prompted, name it `product-fulfillment`)
  3. On the Google Cloud page that opens → **Create service account**
     - Name: `github-actions-deploy`
     - Role: **Service Account User** (we set Play permissions next)
  4. Back in Play Console → **Grant access** to that service account → Role: **Release manager**
  5. In Google Cloud Console for that service account → **Keys → Add key → Create new key → JSON**
  6. Download the `.json` file
  7. Go to GitHub → **Settings → Secrets → New repository secret**
     - Name: `GOOGLE_SERVICE_ACCOUNT_KEY`
     - Value: paste the entire contents of the JSON file

---

### 1.3 Apple Developer account

- [ ] **[YOU]** Pay $99/year and register at https://developer.apple.com/enroll
  - Takes 24–48 hours for individual, up to 5 days for org
  - Use your personal Apple ID

- [ ] **[YOU]** Once enrolled, create the app in App Store Connect:
  - Go to https://appstoreconnect.apple.com → **My Apps → + → New App**
  - Platform: iOS
  - Name: `Product Fulfillment`
  - Bundle ID: `com.omegagiven.productfulfillment`
  - SKU: `productfulfillment01`
  - User access: Full access

- [ ] **[YOU]** Create App Store Connect API key for CI:
  1. App Store Connect → **Users and Access → Integrations → App Store Connect API**
  2. Click **+** → Name: `GitHub Actions`, Role: **Developer**
  3. Download the `.p8` file (only shown once — save it)
  4. Note the **Key ID** and **Issuer ID** shown on that page
  5. Add three GitHub secrets:
     - `APPLE_API_KEY_ID` → the Key ID (looks like `ABC123DEF4`)
     - `APPLE_API_KEY_ISSUER_ID` → the Issuer ID (looks like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)
     - `APPLE_API_KEY` → open the `.p8` file in a text editor, paste the entire contents including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines

---

### 1.4 EAS credentials (signing keys)

- [ ] **[YOU]** Run from `apps/mobile`:
  ```bash
  eas credentials
  ```
  - Choose iOS → let EAS manage provisioning profiles (select **Expo managed**)
  - Choose Android → let EAS manage the keystore (select **Expo managed**)
  
  EAS stores these securely on their servers. You never need to handle `.p12` or `.jks` files.

---

## Phase 2 — App Assets (needed before store review)

### 2.1 App icon

Both stores require an icon. Minimum: a 1024×1024 PNG with no transparency.

- [ ] **[YOU]** Create or commission an icon. Options:
  - DIY free: https://www.canva.com (use 1024×1024 template)
  - DIY free: https://icon.kitchen (generates all sizes from one image)
  - Cheap: Fiverr ~$15

  The icon should convey "package / fulfillment / scanning". A box with a checkmark or a phone scanning a label works well.

  When you have a 1024×1024 PNG, drop it into `apps/mobile/assets/` and say **"icon ready"** →
- [ ] **[ME]** I'll wire it into `app.json` (iOS icon, Android adaptive icon, splash screen)

---

### 2.2 Splash screen

- [ ] **[YOU]** Can reuse the icon or provide a separate image. A simple logo on a white/dark background works.
  Say **"use icon as splash"** and I'll handle it, or drop a separate file and say **"splash ready"** →
- [ ] **[ME]** I'll add `expo-splash-screen` plugin and configure it in `app.json`

---

### 2.3 Privacy policy

- [ ] **[ME]** I'll write the privacy policy text right now — just say **"write privacy policy"** →
  I'll create a simple HTML page you can host for free on GitHub Pages in under 5 minutes.

---

## Phase 3 — Store Listings (needed before public release, not for beta)

### 3.1 Short and full descriptions

- [ ] **[ME]** I'll write these for both stores — say **"write store listings"** →
  I'll produce:
  - Short description (80 chars, Play Store)
  - Full description (4000 chars, both stores)
  - Keywords list (App Store)
  - What's New text for first release

---

### 3.2 Screenshots

Both stores require screenshots at specific sizes. Fastest path: run the app in a simulator and screenshot each key screen.

- [ ] **[YOU]** Take screenshots on:
  - iPhone 6.9" (iPhone 16 Pro Max simulator) — App Store requires this
  - Android phone (any Pixel simulator) — Play Store requires this
  
  Key screens to capture: Home, Integrations, active Fulfillment Run (showing the OCR step), Order match step, Message preview step.

- [ ] **[ME]** Once you have raw screenshots, say **"screenshots ready"** and tell me the file paths → I'll help frame them in a device mockup if needed.

---

## Phase 4 — First Beta Build

Once Phase 1 is done (accounts + secrets), a build triggers automatically on the next push to `main`.

- [ ] **[YOU]** After completing Phase 1, just push any small change or say **"trigger preview build"** →
- [ ] **[ME]** I'll push a trivial commit that triggers the preview workflow.

After ~20 minutes check:
- Android build: https://expo.dev (your project → Builds)
- iOS build: same place

---

## Phase 5 — First Production Release

When you're happy with beta feedback:

- [ ] **[YOU]**
  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
  That's it. The `production-release.yml` workflow:
  1. Sets version `1.0.0` in `app.json`
  2. Builds Android AAB + iOS IPA
  3. Submits Android to Play Internal Track
  4. Submits iOS to TestFlight
  5. Creates a GitHub Release with changelog

---

## Phase 6 — Monetisation (after beta, before growth push)

- [ ] **[ME]** When ready, say **"add RevenueCat"** → I'll:
  - Add `react-native-purchases` dependency
  - Add subscription check on integration count
  - Wire up the paywall screen with your tier pricing
  - All in one session, no manual steps needed from you for the code

- [ ] **[YOU]** Create products in both stores:
  - App Store Connect → your app → In-App Purchases → Subscriptions
  - Play Console → your app → Monetise → Subscriptions
  - Product IDs to use (I'll match these in code):
    - `starter_monthly` — $7/month
    - `pro_monthly` — $14/month
    - `business_monthly` — $24/month

---

## Current blocker checklist (do in order)

```
[ ] 1.1  eas login + eas init                  — YOU (15 min)
[ ] 1.1  Add EXPO_TOKEN to GitHub secrets       — YOU (5 min)
[ ] 1.2  Register Google Play ($25)             — YOU (can do async, 24–48h verify)
[ ] 1.3  Register Apple Developer ($99)         — YOU (can do async, 24–48h verify)
[ ] 2.1  App icon 1024x1024 PNG                 — YOU
[ ] 2.3  Privacy policy                         — ME (say "write privacy policy")
[ ] 1.4  eas credentials                        — YOU (after eas init)
[ ] 1.2  Google service account + secret        — YOU (after Play account ready)
[ ] 1.3  Apple API key + 3 secrets              — YOU (after Apple account ready)
[ ] 4    Trigger first preview build            — ME (after secrets in place)
[ ] 5    Tag v1.0.0 for first production build  — YOU (when beta looks good)
[ ] 6    Add RevenueCat paywall                 — ME (when monetisation ready)
```

---

## What I can do right now without waiting for anything

Say any of these and I'll do it immediately:

- **"write privacy policy"** → full HTML privacy policy + GitHub Pages setup instructions
- **"write store listings"** → Play Store + App Store copy, keywords, what's new
- **"add onboarding"** → 3-screen onboarding flow shown on first launch
- **"add RevenueCat"** → full subscription paywall wired to integration count gating
- **"add app icon [filename]"** → wire your icon into app.json for all platforms
- **"add Shopify integration"** → Shopify Admin API orders, OAuth, sync, ship confirm
- **"add WooCommerce integration"** → WooCommerce REST API, key auth, order sync
- **"trigger preview build"** → push a dummy commit to kick off the EAS build workflow
