# OCR And Order Matching Completion Plan

## Current State
- Native iOS and Android OCR exists through `@react-native-ml-kit/text-recognition`.
- The fulfillment workflow can capture product and label photos, run OCR, show parsed recipient fields, rank order candidates, and let a user confirm the match.
- Orders can be added manually or synced from mock Etsy/Squarespace connections.
- Live marketplace order sync is not complete yet. Current live sync returns no orders.
- Matching is exact-field based and needs stronger normalization, fuzzy matching, thresholds, and tests before it should be trusted in production.
- Web/browser OCR and camera selection are not implemented yet.

## Target Capability
The app should let a user take one or more photos of a product package, including a shipping label that may be its own photo or visible inside a product photo. The app should identify the best label image, extract the recipient name, address, and phone when present, match the result to imported ecommerce orders, show ranked matches with reasons, and require human confirmation before the order is linked to the fulfillment packet.

## Phase 1: Productionize Native OCR
- Confirm native OCR builds on both iOS and Android after a clean Expo prebuild/run.
- Add camera permission copy and failure handling for denied camera access.
- Add OCR failure states that distinguish:
  - no readable text
  - OCR native module missing
  - no label-like photo found
  - extracted label text but no recipient fields
- Store OCR metadata with each run:
  - OCR engine name
  - platform
  - source photo id
  - raw text
  - parsed recipient fields
  - confidence
  - created timestamp
- Add a manual "select this as label" override when automatic detection picks the wrong photo.
- Allow the workflow to continue when the label appears inside a product photo instead of requiring a separately captured label photo.

## Phase 2: Improve Label Detection
- Score every captured photo for label likelihood using:
  - recipient field completeness
  - carrier terms such as USPS, UPS, FedEx, tracking, ship to, deliver to
  - address-like line patterns
  - city/state/postal pattern
  - photo label selected by user, if available
- Keep the top label candidate but show alternate candidates when confidence is low.
- Add a label review UI with:
  - chosen source photo preview
  - parsed recipient fields
  - raw OCR text
  - action to rerun OCR
  - action to manually choose another photo
- Do not discard OCR results from other photos; keep them available for debugging and future model improvements.

## Phase 3: Robust Recipient Parsing
- Normalize OCR text before parsing:
  - remove repeated whitespace
  - normalize common OCR punctuation errors
  - normalize state and ZIP formats
  - strip carrier and sender noise lines
- Expand address parsing to handle:
  - PO boxes
  - apartment/unit lines before or after street lines
  - ZIP+4 matching
  - missing comma between city and state
  - all-caps labels
  - phone numbers with punctuation, country code, or extension
- Preserve both raw and normalized recipient values.
- Add parser confidence per field so matching can weigh stronger fields more heavily.
- Add tests using real-looking fixture text for USPS, UPS, FedEx, Etsy, and Squarespace-style labels.

## Phase 4: Stronger Order Matching
- Normalize order and OCR fields before matching:
  - lowercase names
  - remove punctuation
  - normalize phone to digits
  - normalize street suffixes such as Street/St, Road/Rd, Avenue/Ave
  - normalize unit markers such as Apt, Unit, Suite, Ste
  - compare five-digit ZIP even when one side has ZIP+4
- Replace exact-only scoring with weighted matching:
  - postal code
  - street number
  - normalized street name
  - unit/address2
  - recipient name fuzzy match
  - phone
  - buyer/order email where available
  - order recency and open/unfulfilled status
- Add fuzzy matching for OCR mistakes using a small local utility, not a network service.
- Add confidence bands:
  - high confidence: show best candidate first but still require confirmation
  - medium confidence: show multiple candidates and highlight mismatched fields
  - low confidence: require manual order search
- Add "why this matched" details with matched and mismatched fields.
- Prevent already-linked or fulfilled orders from ranking above open/unlinked orders unless manually selected.

## Phase 5: Live Order Import
- Complete Etsy live OAuth callback handling and token exchange.
- Store Etsy access token, refresh token, expiry, shop identity, and token refresh state securely.
- Fetch Etsy Open API v3 orders/receipts and normalize them into the app's `ImportedOrder` shape.
- Add incremental sync using updated/created timestamps where the API supports it.
- Add visible sync results:
  - last synced at
  - imported order count
  - failed sync reason
  - credential/token status
- Implement Squarespace live order import after Etsy is stable.
- Keep manual order entry and mock mode available for testing and fallback.

## Phase 6: Web Capture And Browser OCR
- Add browser camera device enumeration with `getUserMedia`.
- Let users choose built-in webcam, USB camera, or file upload.
- Add browser-compatible OCR behind the existing `OcrService` interface.
- Reuse the same parsing, matching, review, and confirmation screens across native and web where possible.
- Add browser-specific failure handling for camera permissions, unavailable devices, and unsupported OCR runtime.

## Phase 7: Persistence And Audit Trail
- Store each confirmed fulfillment link with:
  - order id
  - fulfillment run id
  - selected source photo id
  - OCR extraction id or timestamp
  - selected candidate confidence
  - user/device that confirmed it
  - confirmation timestamp
- Preserve match candidate snapshots so later order changes do not rewrite history.
- Add order table indicators for:
  - unfulfilled/unlinked
  - linked to fulfillment packet
  - message prepared
  - message sent
- Add a detail view that shows the fulfillment packet, OCR text, match rationale, and selected order.

## Phase 8: Test And Verification Coverage
- Add unit tests for:
  - recipient parsing
  - normalization
  - candidate scoring
  - confidence bands
  - already-linked order ranking
- Add workflow/service tests for:
  - OCR result saved to run state
  - candidates saved to run state
  - confirming a match links order and fulfillment run
  - rerunning OCR replaces extraction and candidates
- Add fixture-based OCR text samples rather than relying on live camera images for automated tests.
- Add manual QA checklist for native devices:
  - clear label photo
  - blurry label photo
  - label inside product photo
  - multiple product photos plus one label
  - no matching order
  - multiple similar orders
  - missing phone
  - ZIP+4 vs five-digit ZIP

## Suggested Implementation Order
1. Add parser and matcher unit tests around the current behavior.
2. Build normalization utilities and upgrade matcher scoring.
3. Add label detection review and manual source-photo override.
4. Relax the workflow so a separate label photo is not mandatory.
5. Complete Etsy live order import.
6. Add stronger persistence/audit records for confirmed links.
7. Add web camera capture and browser OCR.
8. Expand QA fixtures and device testing.

## Definition Of Done
- A native user can capture product/package photos, including a label in any captured photo.
- OCR extracts recipient fields from the most likely label image and shows the source photo.
- The app ranks imported orders with clear reasons and mismatches.
- The user can manually override both the label source photo and matched order.
- Confirming a match creates a durable order-to-fulfillment link.
- Live Etsy orders can be imported into local storage and matched.
- Parser and matcher tests cover common shipping label layouts and OCR error cases.
- Web capture mode can use a selected browser camera or file upload and reach the same matching review flow.
