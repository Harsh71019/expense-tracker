## ADDED Requirements

### Requirement: Encrypted credential storage
The system SHALL store each user's Zerodha credential (`apiKey`, `apiSecret`, `accessToken`) encrypted at rest using application-level AES-256-GCM, scoped by `userId`, with a fresh random IV generated per encryption operation. The encryption key SHALL be read from a dedicated root key that is separate from any key used for infrastructure/deploy secrets. Repository methods SHALL require `userId` as the first parameter, per the codebase's repository-layering rule.

#### Scenario: Credential persisted encrypted
- **WHEN** a user completes the Zerodha connect flow and an `access_token` is obtained
- **THEN** the stored row contains only ciphertext, IV, auth tag, and key version — never plaintext `apiKey`, `apiSecret`, or `accessToken`

#### Scenario: No nonce reuse
- **WHEN** the encryption service encrypts two different credential payloads for the same or different users
- **THEN** each encryption operation uses a distinct, randomly generated IV

### Requirement: Zerodha connect flow
The system SHALL let a user initiate Zerodha's official login flow from the TreasuryOps UI whenever no valid `access_token` is stored for that user, and SHALL complete the `request_token` → `access_token` exchange (via checksum `SHA256(apiKey + requestToken + apiSecret)` against Zerodha's session/token endpoint) without requiring any new publicly-exposed network endpoint beyond what the user already uses to reach the application.

#### Scenario: No stored token shows connect button
- **WHEN** a user with no stored `access_token` (or an expired one) views the integrations UI
- **THEN** the UI shows a "Connect Zerodha" button instead of holdings data

#### Scenario: Successful login stores access token
- **WHEN** the user completes Zerodha's login page and is redirected back with a `request_token`
- **THEN** the backend exchanges it for an `access_token`, encrypts and stores it, and the UI stops showing the connect button

#### Scenario: No headless/automated login
- **WHEN** the system needs a new `access_token`
- **THEN** it SHALL NOT attempt to programmatically submit Zerodha account credentials (password, TOTP) on the user's behalf — a live user-driven login is always required

### Requirement: Access token expiry detection and reminder
The system SHALL treat a stored Zerodha `access_token` as expired at 6:00 AM IST following its generation (fixed daily expiry, not a rolling window) and SHALL run a scheduled check that detects an empty or expired token and surfaces a reminder to the user. The scheduled check SHALL NOT attempt to log in on the user's behalf.

#### Scenario: Scheduled check flags expired token
- **WHEN** the daily scheduled check runs and finds a user's `access_token` is missing or past its 6:00 AM IST expiry
- **THEN** the system records/surfaces a reminder for that user to reconnect

### Requirement: Read-only holdings sync
The system SHALL fetch and display the user's Zerodha holdings (instrument, quantity, average buy price) via the free Kite Connect Personal API once a valid `access_token` exists, and SHALL NOT create transactions ledger entries, adjust account balances, or otherwise write to the existing money-tracking tables as a result of this sync.

#### Scenario: Holdings displayed read-only
- **WHEN** a user with a valid `access_token` views the integrations UI
- **THEN** the system shows their current holdings (quantity and average buy price per instrument) as a read-only view

#### Scenario: Holdings sync never touches the ledger
- **WHEN** a holdings sync runs
- **THEN** no rows are inserted into the transactions ledger and no account `balanceMinor` is modified

#### Scenario: Valuation is out of scope
- **WHEN** holdings are displayed
- **THEN** the system SHALL NOT display a live current market value/LTP for this change (data plan not included in the free Personal API tier)
