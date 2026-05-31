# Launch TODO

Legend: **[YOU]** = requires your accounts/browser/device. **[ME]** = hand back to Claude, I'll write the code.
✅ = done. ⏳ = in progress / waiting.

---

## Current Blockers — Do These In Order

```
✅  eas init done               projectId in app.json
✅  App icon                    built + wired in
✅  Apple Developer paid        waiting for Apple activation email (24–48h)
[ ] EXPO_TOKEN secret           YOU — 5 min (instructions in 1.1 below)
[ ] eas credentials             YOU — 10 min (instructions in 1.4 below)
[ ] Apple: create app record    YOU — after activation email arrives
[ ] Apple: API key + 3 secrets  YOU — after activation email arrives (instructions in 1.3)
[ ] Google Play account ($25)   YOU — optional for first iOS-only beta
[ ] Privacy policy              ME — say "write privacy policy"
[ ] First preview build         ME — after EXPO_TOKEN + eas credentials done
```

---

## 1.1 — EXPO_TOKEN GitHub Secret

**Do this now — unblocks everything.**

```bash
# In any terminal, logged in as your Expo account:
eas account:create-token
```

Copy the token. Then:
- GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**
- Name: `EXPO_TOKEN`
- Value: paste token
- Click **Add secret**

---

## 1.2 — Google Play Developer Account

- [ ] **[YOU]** Register at https://play.google.com/console/signup ($25 one-time)
  - Individual account is fine
  - Verification takes 24–48 hours

- [ ] **[YOU]** Once verified → **All apps → Create app**
  - App name: `Product Fulfillment`
  - Language: English (United States)
  - App or game: App
  - Free or paid: Free

- [ ] **[YOU]** Get service account for CI:
  1. Play Console → **Setup → API access**
  2. **Link to a Google Cloud project** (create new, name: `product-fulfillment`)
  3. Google Cloud Console opens → **Create service account**
     - Name: `github-actions-deploy`
     - Role: **Service Account User**
  4. Back in Play Console → **Grant access** to that service account → Role: **Release Manager**
  5. Google Cloud Console → that service account → **Keys → Add key → Create new key → JSON**
  6. Download the `.json` file
  7. GitHub → **Settings → Secrets → New repository secret**
     - Name: `GOOGLE_SERVICE_ACCOUNT_KEY`
     - Value: paste the entire JSON file contents

---

## 1.3 — Apple Developer: App Record + API Key

⏳ **Waiting for Apple activation email.** Apple sends this within 24–48 hours of payment. Check the email address on your Apple ID.

**Once you receive the activation email, do these steps in order:**

### Step A — Create the app record in App Store Connect

1. Go to https://appstoreconnect.apple.com
2. **My Apps → + → New App**
3. Fill in:
   - Platform: **iOS**
   - Name: `Product Fulfillment`
   - Primary language: English (U.S.)
   - Bundle ID: If `com.omegagiven.productfulfillment` isn't in the dropdown yet, see note below
   - SKU: `productfulfillment01` (any unique string, not shown publicly)
   - User access: Full access
4. Click **Create**

> **Bundle ID note:** If it's not in the dropdown, go to https://developer.apple.com/account → **Identifiers → +** → App IDs → App → Continue → Description: `Product Fulfillment`, Bundle ID: Explicit → `com.omegagiven.productfulfillment` → Register. Then come back to App Store Connect and it will appear.

---

### Step B — Create App Store Connect API Key (for GitHub Actions + EAS)

This key lets both GitHub Actions and EAS submit builds automatically without needing your Apple ID password.

1. App Store Connect → **Users and Access** (top menu)
2. Click **Integrations** tab → **App Store Connect API**
3. Click **+** to create a new key
   - Name: `GitHub Actions EAS`
   - Access: **App Manager** ← must be this role, not Developer
4. Click **Generate**
5. **Download the `.p8` file immediately** — this is the only time Apple shows it
6. On that same page, note down:
   - **Key ID** — 10-character string like `AB12CD34EF`
   - **Issuer ID** — UUID like `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`

### Step C — Add the 3 secrets to GitHub

GitHub repo → **Settings → Secrets and variables → Actions**

Add each one as a new repository secret:

| Secret name | Value |
|---|---|
| `APPLE_API_KEY_ID` | The 10-char Key ID from step B |
| `APPLE_API_KEY_ISSUER_ID` | The UUID Issuer ID from step B |
| `APPLE_API_KEY` | Open the `.p8` file in any text editor, paste **everything** including the `-----BEGIN PRIVATE KEY-----` header and `-----END PRIVATE KEY-----` footer lines |

---

## 1.4 — EAS Credentials (iOS Provisioning + Android Keystore)

**Do this after EXPO_TOKEN is set. Takes ~10 minutes.**

EAS manages all the signing certificates for you — no manual `.p12` or `.jks` files needed.

```bash
cd apps/mobile
eas credentials
```

When it prompts:
- **iOS** → Select `production` profile → Choose **Expo managed** → EAS creates and stores the provisioning profile + distribution cert on their servers
- **Android** → Select `production` profile → Choose **Expo managed** → EAS creates and stores the keystore

> **Important:** The Android keystore EAS generates is tied to your app forever. EAS stores a backup — but also run `eas credentials --platform android` and note where the keystore is stored for your records.

---

## 2.1 — App Icon ✅

Done. `apps/mobile/assets/icon.png` — open box with flaps + green checkmark on dark navy background.

---

## 2.2 — Splash Screen ✅

Done. Uses same icon asset on `#0f172a` dark background.

---

## 2.3 — Privacy Policy

Required before App Store review. Takes 10 minutes to deploy.

- [ ] **[ME]** Say **"write privacy policy"** → I'll create a complete HTML privacy policy file + exact instructions to host it for free on GitHub Pages in under 5 minutes.

---

## 3.1 — Store Listing Copy

Not needed for beta — needed before public App Store / Play Store listing.

- [ ] **[ME]** Say **"write store listings"** → I'll write:
  - Short description (80 chars, Play Store)
  - Full description (up to 4000 chars, both stores)
  - Keywords (App Store, 100 chars)
  - Promotional text (App Store)
  - What's New for v1.0

---

## 3.2 — Screenshots

Required before public listing (not TestFlight beta).

- [ ] **[YOU]** Needed sizes:
  - **iPhone 6.9"** (iPhone 16 Pro Max simulator) — App Store mandatory
  - **Android phone** (any Pixel emulator) — Play Store mandatory
  
  Screens to capture: Home, Integrations, Fulfillment Run (OCR step), Order match, Message preview

- [ ] **[ME]** Say **"screenshots ready"** with file paths → I'll frame them in clean device mockups

---

## Phase 4 — First Preview Build

After 1.1 (EXPO_TOKEN) and 1.4 (eas credentials) are done:

- [ ] **[ME]** Say **"trigger preview build"** → I'll push a commit to kick off the GitHub Actions workflow
- Builds appear at https://expo.dev → your project → Builds (~20 min)
- Download and install directly from Expo dashboard to test on your phone

---

## Phase 5 — First Production Release (TestFlight + Play Internal)

After all Phase 1 secrets are in place and beta testing is done:

```bash
git tag v1.0.0
git push origin v1.0.0
```

The `production-release.yml` workflow automatically:
1. Sets version `1.0.0` in app.json
2. Queues EAS builds for Android AAB + iOS IPA
3. Submits iOS → TestFlight
4. Submits Android → Play Internal Track
5. Creates GitHub Release with changelog

---

## Phase 6b — Firebase Setup (Cloud Sync activation)

- [ ] **[YOU]** Go to https://console.firebase.google.com → **Create project** → name: `og-product-fulfillment`
- [ ] **[YOU]** Inside project → **Firestore Database** → Create → **Production mode** → choose nearest region
- [ ] **[YOU]** Inside project → **Authentication** → Get started → Sign-in method → enable:
  - **Email/Password** → Enable → Save
  - **Apple** → Enable → paste your Apple Service ID (from developer.apple.com → Identifiers → + → Services IDs) → Save
- [ ] **[YOU]** Project Settings (gear icon) → **Your apps → Add app → Web** → register app → copy the config object
- [ ] **[YOU]** Paste the 6 values into `apps/mobile/app.json` under `extra`:
  ```json
  "firebaseApiKey": "AIza...",
  "firebaseAuthDomain": "og-product-fulfillment.firebaseapp.com",
  "firebaseProjectId": "og-product-fulfillment",
  "firebaseStorageBucket": "og-product-fulfillment.appspot.com",
  "firebaseMessagingSenderId": "123456789",
  "firebaseAppId": "1:123:web:abc"
  ```
- [ ] **[YOU]** Firestore → **Rules tab** → paste contents of `firestore.rules` from repo → Publish
- [ ] **[ME]** Say **"commit firebase config"** after filling in the values → I'll commit + push + trigger build

---

## Phase 6 — Monetisation ✅ (code done, needs your keys)

Code is built. Three things needed from you:

---

### 6a — RevenueCat account + API keys

**File to edit after getting keys:** `apps/mobile/src/services/cloud/revenueCatService.ts`
Replace lines 7–8:
```
const RC_API_KEY_IOS = "appl_REPLACE_WITH_YOUR_IOS_KEY";
const RC_API_KEY_ANDROID = "goog_REPLACE_WITH_YOUR_ANDROID_KEY";
```

**Steps to get your keys:**

1. Go to https://app.revenuecat.com → **Sign up** (free)
2. **Create new project** → name: `OG Product Fulfillment`
3. Add **iOS app**:
   - App Store Connect App → select `Product Fulfillment`
   - Bundle ID: `com.omegagiven.productfulfillment`
   - Copy the **iOS SDK key** (starts with `appl_`)
4. Add **Android app**:
   - Package name: `com.omegagiven.productfulfillment`
   - Copy the **Android SDK key** (starts with `goog_`)
5. In RevenueCat → **Entitlements** → Create 3 entitlements:
   - Identifier: `single_integration`
   - Identifier: `all_integrations`
   - Identifier: `photo_backup`
6. Paste both keys into `revenueCatService.ts`, then say **"commit RevenueCat keys"** → I'll push

---

### 6b — App Store subscription products

**App Store Connect:** https://appstoreconnect.apple.com → your app → **Monetisation → Subscriptions**

Create a subscription group named `OG Fulfillment Plans`, then add 3 products:

| Product ID | Price | Display name |
|---|---|---|
| `productfulfillment_single_monthly` | $4.99/mo | Integrations |
| `productfulfillment_pro_monthly` | $9.99/mo | Pro |
| `productfulfillment_photo_backup_monthly` | $2.99/mo | Photo Backup |

After creating each product, go back to RevenueCat → **Products** → Add each product ID → attach to the matching entitlement.

---

### 6c — Google Play subscription products

**Play Console:** https://play.google.com/console → your app → **Monetise → Subscriptions → Create subscription**

Create 3 subscriptions with the same product IDs as above, same prices. Then add them in RevenueCat → Products → attach to entitlements.

---

### 6d — Add your first beta promo code

Once Firebase is configured (Phase 6b above), add this document in Firebase Console:

**Collection:** `promoCodes` → **Document ID:** `BETA100`
```json
{
  "discountPercent": 100,
  "entitlement": "all_integrations",
  "durationDays": 90,
  "maxUses": 500,
  "usesRemaining": 500,
  "validUntil": "2026-12-31",
  "active": true
}
```

Users enter `BETA100` on the paywall → 90 days Pro free. Change `active` to `false` to kill it anytime.

---

### 6e — Add `react-native-purchases` plugin to app.json

- [ ] **[ME]** Say **"commit RevenueCat keys"** after filling in the keys → I'll also add the plugin to `app.json` and push

---

## What I Can Do Right Now

Say any of these:

| Say | I do |
|---|---|
| `"write privacy policy"` | Full HTML + GitHub Pages hosting instructions |
| `"write store listings"` | Both store descriptions, keywords, promo text |
| `"add onboarding"` | 3-screen first-launch flow |
| `"commit RevenueCat keys"` | Add plugin to app.json, commit keys, push + trigger build |
| `"trigger preview build"` | ✅ Build triggered — check expo.dev → Builds |
| `"add Shopify"` | Shopify Admin API — orders, OAuth, sync, ship confirm |
| `"add WooCommerce"` | WooCommerce REST API — key auth, order sync |
| `"commit firebase config"` | Commit filled-in Firebase values + push |
