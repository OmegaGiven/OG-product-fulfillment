# GitHub Secrets Setup

Add these at: **Settings → Secrets and variables → Actions → New repository secret**

---

## Required for all builds

### `EXPO_TOKEN`
Your EAS authentication token.

```bash
# Install EAS CLI locally once:
npm install -g eas-cli

# Log in and generate a token:
eas login
eas account:create-token
```

Copy the token value → add as `EXPO_TOKEN` secret.

---

## Required for Android submission (production only)

### `GOOGLE_SERVICE_ACCOUNT_KEY`
A Google Cloud service account JSON key with access to Google Play.

**Steps:**
1. Go to [Google Play Console](https://play.google.com/console) → Setup → API access
2. Link to a Google Cloud project (or create one)
3. Create a service account with **Release Manager** role
4. Download the JSON key file
5. Paste the entire JSON content as the secret value

---

## Required for iOS submission (production only)

### `APPLE_API_KEY_ID`
The Key ID from App Store Connect.

### `APPLE_API_KEY_ISSUER_ID`
The Issuer ID from App Store Connect.

### `APPLE_API_KEY`
The `.p8` private key file content (the entire file including `-----BEGIN PRIVATE KEY-----`).

**Steps:**
1. Go to [App Store Connect](https://appstoreconnect.apple.com) → Users and Access → Integrations → App Store Connect API
2. Generate a new key with **Developer** role (or **Admin** for submissions)
3. Download the `.p8` file (only downloadable once)
4. Copy Key ID, Issuer ID, and the `.p8` file contents into the three secrets

---

## First-time EAS project setup (run once locally)

```bash
cd apps/mobile

# Link the project to your EAS account (creates projectId in app.json)
eas init

# Configure credentials (iOS provisioning profile + Android keystore)
eas credentials
```

After `eas init`, commit the updated `app.json` (it will have an `extra.eas.projectId` added).

---

## Triggering a release

```bash
# Tag the commit you want to release:
git tag v1.0.0
git push origin v1.0.0
```

This triggers `production-release.yml` which:
1. Sets `app.json` version to `1.0.0`
2. Queues EAS builds for Android (AAB) + iOS (IPA) with `autoIncrement` build numbers
3. Creates a GitHub Release with changelog
4. (After build completes on EAS) Submits to Google Play Internal + TestFlight

## Skipping a build on main push

Add `[skip ci]` or `[no build]` to your commit message:

```bash
git commit -m "chore: update readme [skip ci]"
```
