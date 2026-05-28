# Product Fulfillment V1 Plan

## Summary
Build a phone-first, local-first fulfillment app with `Expo` as the primary client. The V1 goal is a complete mobile workflow that lets an admin take product and label photos, extract recipient information from the label, match that information to imported ecommerce orders, preview a customer message with the photos attached, and send only after human approval.

V1 must be usable on a phone without requiring a server. The architecture should still support a later server-backed mode where the phone keeps the same screens and workflow, but server services take over credential storage, data sync, matching, storage, and sending.

The product should also support a future dual-mode access model:
- `local mode` for device-only, single-user operation without login
- `organization mode` for Google-first OAuth login, shared server-backed access, and multi-user collaboration

The plan should prioritize the real fulfillment loop first. Workflow modularity, additional integrations, and server mode should be designed in now, but staged after the core mobile experience is working.

## V1 Product Goals
### Primary mobile MVP
- Start a new fulfillment run from the phone
- Capture one or more product photos and a label photo, even if the label appears inside a product photo set
- Review and confirm the photos before processing
- Identify the label photo and extract recipient fields such as name, address, and phone when present
- Pull order data from supported integrations into local storage
- Match OCR results against imported orders and show ranked candidates
- Let the user confirm the matched order
- Generate a message preview with the fulfillment photos attached
- Require human approval before send
- Record what was sent, when it was sent, and through which channel

### Mobile admin and settings goals
- Provide a user button in a top corner of the app that opens account and settings actions
- Include a settings screen with an integrations list
- Let the admin add, update, disable, and remove credentials for each supported integration
- Securely store integration credentials on-device in local mode
- Move credential storage responsibility to the server when the phone is connected to a server-backed deployment

### Post-V1 goals
- Add more integrations after Etsy
- Add browser camera capture and browser-based OCR so the same fulfillment flow can run on laptops, desktops, and external USB cameras
- Add a lite web interface for server-backed review and operations
- Add server-backed sync, storage, OCR, matching, and messaging
- Add Google-first OAuth login, organization creation, invite-based membership, and shared server-backed sessions
- Expand workflow configurability beyond the default fulfillment flow

## Frameworks And Dependencies
### Core stack
- `Expo` / `React Native` for the mobile app and V1 primary runtime
- `NestJS` for the future enterprise/server backend
- `PostgreSQL` for the future central database in enterprise mode
- `Supabase` for future hosted Postgres, auth, storage, and realtime support in enterprise mode

### V1 mobile app
- `expo`
- `react`
- `react-native`
- `expo-router`
- `expo-camera`
- `expo-image-picker`
- `expo-file-system`
- `expo-sqlite`
- `expo-secure-store`
- `expo-mail-composer`
- `expo-sharing`
- `@tanstack/react-query`
- `zod`
- `react-hook-form`
- `zustand`
- On-device OCR implementation hidden behind `OcrService`

### Future backend
- `@nestjs/common`
- `@nestjs/config`
- `@nestjs/passport`
- `@nestjs/jwt`
- `@nestjs/bullmq`
- `prisma`
- `@prisma/client`
- `@supabase/supabase-js`
- `pg`
- `redis`
- `zod`

### Future web/admin
- `Next.js`
- `React`
- `@tanstack/react-query`
- `zod`
- Shared contracts reused from the mobile and backend layers
- Browser camera access through `getUserMedia`
- Browser-compatible OCR engine behind the same `OcrService` contract

## Implementation Plan
For the focused work needed to finish reliable shipping label OCR, label detection, and order matching, see `OCR_ORDER_MATCHING_PLAN.md`.

### Phase 1: Mobile fulfillment loop
- Build the default V1 workflow around the README flow:
  1. Start fulfillment
  2. Capture product and label photos
  3. Review and confirm photos
  4. Run label detection and OCR
  5. Match against imported orders
  6. Confirm matched order
  7. Preview customer message
  8. Approve and send
- Define the primary record as a `FulfillmentRun`
- Treat the photo set for a run as the app’s stored fulfillment packet
- Store `photos`, `detected label photo`, `ocr result`, `match candidates`, `selected order`, `approval state`, and `message attempt` under each run
- Preserve in-progress runs across app restarts and intermittent connectivity

### Phase 2: On-device integrations and settings
- Build a settings entry under a user button in the app chrome
- Create an integrations settings screen that lists supported integrations and connection state
- Start with Etsy as the first integration adapter
- Design each adapter behind a common contract so later integrations such as Squarespace, Amazon, or eBay can be added without changing workflow screens
- In local mobile mode:
  - store imported order data locally
  - store integration credentials and tokens in `expo-secure-store`
  - keep non-sensitive synced order and configuration data in local database storage
- In server-backed mode:
  - the phone sends credentials to the server through authenticated APIs
  - the server stores credentials and performs sync
  - the phone no longer persists raw integration secrets locally beyond session needs

### Etsy live integration plan
- Use Etsy Open API v3 with OAuth 2.0 Authorization Code flow and PKCE for seller authorization
- Store Etsy `keystring`, `shared secret`, and the exact registered HTTPS `redirect URI` in secure local storage in local mode
- Generate and store a single-use OAuth `state` and PKCE `code_verifier` locally before launching Etsy authorization
- Start with Etsy scopes:
  - `transactions_r`
  - `shops_r`
  - `shops_w`
- Expose an Etsy authorization URL from the mobile app so live testing can begin before the full callback exchange is wired
- Stage the Etsy rollout as:
  1. save Etsy live credentials
  2. generate OAuth URL with PKCE
  3. complete seller approval in browser
  4. add callback handling and token exchange
  5. store `access_token`, `refresh_token`, expiry, and Etsy account identity
  6. fetch live Etsy orders into normalized local storage
- Keep the callback/token exchange compatible with a future HTTPS backend callback service, because Etsy requires an exact registered HTTPS redirect URI
- Continue supporting mock mode while live Etsy auth remains partial

### Phase 3: Matching and message preparation
- Run OCR on-device against the detected or selected label photo
- Add a web OCR implementation later that can use browser camera capture or uploaded images on desktop and laptop environments
- Normalize imported orders into a shared internal shape
- Match OCR output against locally stored orders and return ranked candidates with confidence scoring
- Require manual confirmation of both photo quality and order match before sending
- Generate a message preview using the matched order, configured template, and attached fulfillment photos
- Offer the best outbound channel per integration:
  - native integration messaging if supported
  - otherwise email when order email exists
  - otherwise block sending and surface a manual state

### Phase 4: Modular workflow foundation
- Implement a bounded workflow system underneath the default flow so the UI is not hardcoded to one sequence
- Define:
  - `WorkflowTemplate`
  - `WorkflowStepDefinition`
  - `WorkflowRun`
  - `WorkflowRunStepState`
- Support a bounded catalog of approved step types in V1
- Allow admins to reorder approved steps, toggle optional steps, and insert supported checkpoints later in V1 or shortly after core launch
- Do not support arbitrary scripting in V1

### Phase 5: Enterprise compatibility
- Support two execution modes behind one UI:
  - `local mode` for V1: the phone performs OCR, calls marketplace APIs directly, stores data locally, and sends messages directly from the device
  - `remote mode` for later enterprise use: the phone becomes a client to a backend that performs sync, OCR, matching, storage, and sending
- Support multiple OCR implementations behind one contract:
  - native mobile OCR for iOS and Android
  - browser OCR for web capture mode using connected computer cameras
- Route workflow operations through service interfaces:
  - `OrderSyncService`
  - `OcrService`
  - `MatchService`
  - `MessageService`
  - `WorkflowService`
  - `StorageService`
  - `IntegrationAuthService`
- Keep local schemas and service contracts portable to a future server-backed backend
- Keep identifiers stable and sync-friendly

### Phase 6: OAuth and organization login
- Add a future `Welcome / Access Mode` entry flow with:
  - `Continue Locally`
  - `Sign In With Google`
- Keep local mode fully available for solo/mobile-first use
- Add clear UI state that distinguishes:
  - device-only local data
  - signed-in organization data
- Scope the first auth-enabled server-backed version to user login only
- Do not include Etsy or Squarespace provider OAuth in the first auth phase
- Plan Google as the first user-login provider
- Define first signed-in user flow:
  - sign in with Google
  - create organization
  - become organization owner
- Define later org member flow:
  - sign in with Google
  - accept invite
  - join existing organization
- Add backend-owned application sessions after OAuth exchange
- Use a hybrid session model in signed-in mobile mode:
  - the mobile app stores Google access and refresh tokens securely
  - the backend maintains its own application session
  - the backend remains authoritative for organization membership and server-backed APIs
- Require organization mode for shared runs, shared integrations, and server-owned secrets
- Add future service interfaces:
  - `AuthService`
  - `SessionService`
  - `OrganizationService`
- Add future client capabilities:
  - start Google OAuth flow
  - complete OAuth exchange with backend
  - restore prior signed-in session on app launch
  - switch cleanly between local mode and organization mode
  - sign out and clear local auth state
  - route signed-in users to remote service implementations without changing workflow screens

## Mobile UX Requirements
- The app is phone-first and fully usable from a mobile device
- A user button should live in a top corner and expose settings and future account actions
- A future access-mode screen should let the user continue locally or sign in with Google
- The settings area should include:
  - integrations list
  - per-integration credential entry
  - connection status
  - sync controls
  - future server connection settings
- The app should always make it clear whether the user is in local mode or signed-in organization mode
- The capture flow should make it clear whether the label photo was auto-detected or manually selected
- The order match screen should show confidence and key recipient details before confirmation
- The send screen should always require explicit approval before the final action

## Web Capture Requirements
- The web app should be able to enumerate available browser camera devices
- The user should be able to choose a built-in webcam or connected USB camera for capture
- Web capture should support both live camera capture and file upload fallback
- Browser OCR should feed the same review and order-matching flow used by native mobile

## Data And Storage Model
### Local mobile mode
- Use `expo-sqlite` for local operational data:
  - fulfillment runs
  - photo metadata and file references
  - OCR results
  - normalized orders
  - message templates
  - send history
  - workflow configuration
- Use `expo-secure-store` for sensitive data:
  - API keys
  - OAuth tokens
  - refresh tokens
  - integration secrets
- In future signed-in organization mode:
  - the device stores only session-critical auth state, Google tokens, and cached non-sensitive data
  - integration secrets are no longer device-owned

### Server-backed mode
- Server stores integration credentials, synced orders, photos, audit history, workflow state, organization membership, and application sessions
- Mobile app stores only what is needed for session continuity, caching, and offline tolerance
- Sensitive integration secrets should be treated as server-owned in this mode

### Future auth and organization entities
- `User`
- `Organization`
- `OrganizationMember`
- `OrganizationInvite`
- `Session`
- `IntegrationConnection`
- `FulfillmentRun`
- `AuditEvent`

### Future auth role expectations
- First server-backed auth version supports at least `owner` and `member`
- Only organization members can access server-backed runs and integrations
- Owners can invite users and manage organization integrations

## Public Interfaces
- Front-end service contracts:
  - `createFulfillmentRun`
  - `savePhotos`
  - `detectLabelPhoto`
  - `syncOrders`
  - `runOcr`
  - `findMatchCandidates`
  - `confirmMatchedOrder`
  - `generateMessagePreview`
  - `approveAndSend`
  - `getWorkflowDefinition`
  - `getWorkflowRunState`
  - `listIntegrationConnections`
  - `saveIntegrationCredentials`
  - `removeIntegrationCredentials`
  - `signInWithGoogle`
  - `completeOAuthExchange`
  - `restoreSession`
  - `signOut`
  - `getCurrentUser`
  - `getCurrentOrganization`
  - `createOrganization`
  - `acceptOrganizationInvite`
  - `listOrganizationMembers`
- Integration adapter contract:
  - `connect`
  - `syncOrders`
  - `normalizeOrder`
  - `getSupportedMessageChannels`
  - `sendMessage`
  - `prepareMessage`

### Future auth/session payloads
- `appUserId`
- `organizationId`
- `organizationRole`
- `sessionExpiry`
- `executionMode`

## Testing Strategy
### Core requirement
- The app must be testable before a real Etsy key is available

### Integration testing without live keys
- Create a mock integration mode for Etsy-compatible test data
- Provide a seeded local dataset of orders, buyers, recipients, and products
- Make the adapter contract support both:
  - real provider implementation
  - mock provider implementation
- Allow switching an integration between `mock`, `local test`, and `live` modes from development configuration
- Verify the core fulfillment flow can be demonstrated end-to-end using mock data only

### Core workflow tests
- Create a new fulfillment run and complete the default workflow fully on the phone
- Verify required steps cannot be skipped
- Verify send cannot happen before photo review and match confirmation
- Verify workflow configuration changes preserve core required steps

### Local processing tests
- Verify OCR produces extracted recipient data without a backend
- Verify order sync stores normalized orders locally
- Verify matching works using only locally stored data
- Verify message preview and send work without server infrastructure
- Verify settings can save and retrieve credentials securely in local mode

### Matching and messaging tests
- Clear label photo matches the correct order
- Similar orders produce a ranked candidate list
- OCR partial failure surfaces a retry and review path
- Native integration messaging is preferred when supported
- Email fallback is offered when native messaging is unavailable
- Missing channels produce a blocked manual state
- Approval is required before every send

### Security and settings tests
- API keys are not stored in plain SQLite tables
- Credentials can be updated or removed cleanly
- Invalid credentials produce a clear integration error state
- Server mode hides or disables local secret storage behavior appropriately

### Resilience tests
- In-progress runs resume after app restart
- Unsynced local data survives app termination
- Temporary network failures produce retryable states
- Repeated taps and retries do not create duplicate sends

### Enterprise readiness tests
- Local service implementations can be swapped for remote ones without changing workflow screens
- Local entity shapes map cleanly to future server-backed persistence

### Future auth and organization tests
- New user can enter local mode without signing in
- New user can sign in with Google and create an organization
- Invited user can sign in with Google and join an existing organization
- Signed-in user can relaunch the app and restore prior session
- Sign-out removes backend session and locally stored Google credentials
- Local mode data remains isolated from organization/server-backed data
- Remote-mode APIs reject users without valid organization membership
- Integration secrets are not persisted locally in organization/server mode
- Existing mobile workflow screens continue to work with swapped remote service implementations
- Auth failures are covered:
  - canceled Google sign-in
  - expired application session
  - revoked Google token
  - invalid or expired organization invite
  - backend unavailable during session restore

## Assumptions And Defaults
- V1 is single-device and local-first
- Human approval before send is mandatory
- OCR and matching happen on-device in V1
- Etsy is the first production integration
- V1 must be testable without live Etsy credentials
- Messaging capability is determined by the matched integration adapter
- Workflow modularity in V1 means configurable supported step types, not arbitrary user scripting
- Squarespace is a follow-up integration after Etsy
- OAuth/login is planned as a future server-backed phase, not a V1 mobile prerequisite
- Google is the first user-login provider
- Marketplace OAuth is out of scope for the first auth phase
- Local mode remains available alongside signed-in organization mode
- Hybrid session means the device stores Google access and refresh tokens while the backend also maintains its own application session
