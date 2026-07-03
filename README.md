# UPI Offline Mesh - Demo

A Spring Boot backend that demonstrates **offline UPI payments routed through a Bluetooth-style mesh network**. You're in a basement with zero connectivity. You send your friend ₹500. Your phone encrypts the payment, broadcasts it to nearby phones, and the packet hops device-to-device until *some* phone walks outside, gets 4G, and silently uploads it to this backend. The backend decrypts, deduplicates, and settles.

This repo is the **server side** of that system, plus a software simulator of the mesh so you can demo the whole flow on a single laptop without any real Bluetooth hardware.

---

## Table of Contents

1. [What this demo proves](#what-this-demo-proves)
2. [How to run it](#how-to-run-it)
3. [The demo flow (step by step)](#the-demo-flow-step-by-step)
4. [Architecture](#architecture)
5. [The three hard problems and how they're solved](#the-three-hard-problems-and-how-theyre-solved)
6. [File-by-file walkthrough](#file-by-file-walkthrough)
7. [API reference](#api-reference)
8. [Tests](#tests)
9. [What's NOT real (and what would change for production)](#whats-not-real-and-what-would-change-for-production)
10. [Honest limitations of the concept](#honest-limitations-of-the-concept)

---

## What this demo proves

The system shows three things working end to end:

1. **A payment can travel from sender to backend through untrusted intermediaries** without any of them being able to read or tamper with it. (Hybrid RSA + AES-GCM encryption.)
2. **Even if the same payment reaches the backend simultaneously through multiple bridge nodes, it settles exactly once.** (Idempotency via atomic compare-and-set on the ciphertext hash.)
3. **A tampered or replayed packet is rejected** before it touches the ledger.

You'll see all three in the dashboard.

---

## How to run it

### Prerequisites

- **JDK 17 or newer** installed and on PATH (or `JAVA_HOME` set). Check with `java -version`.
- That's it. No database, no Redis, no Maven (the wrapper handles it). Just Java.

### Run on Windows

Open a terminal in the project folder and run:

```cmd
mvnw.cmd spring-boot:run
```

The first run downloads Maven (~10 MB) and all dependencies (~80 MB) — give it a couple of minutes. Subsequent runs start in a few seconds.

### Run on Mac/Linux

```bash
./mvnw spring-boot:run
```

### Open the dashboard

Once you see `Started UpiMeshApplication in X.XXX seconds`, open:

**http://localhost:8080**

You'll get a dark dashboard with everything you need to drive the demo.

### Stop the server

`Ctrl+C` in the terminal.

### Run the tests

```cmd
mvnw.cmd test
```

The interesting one is `IdempotencyConcurrencyTest` — it fires three threads delivering the same packet simultaneously and asserts that exactly one settles.

---

## The demo flow (step by step)

The React dashboard now drives the full mesh simulation from one screen. It includes payment controls, mesh topology controls, a packet journey timeline, account balances, activity feed, and the transaction ledger.

### Step 1 - Compose a payment

Choose sender, receiver, amount, PIN, TTL, and the start device. Click **Inject packet**.

The backend validates the request before creating a packet:
- amount must be positive
- sender and receiver must be different
- PIN is required
- sender and receiver VPAs must exist
- start device must exist in the mesh

If validation fails, the React dashboard shows the backend error message directly.

### Step 2 - Watch the packet journey

The dashboard timeline tracks:

1. Payment created
2. Encrypted packet injected
3. Gossip round completed
4. Bridge uploaded
5. Settled / duplicate / rejected

### Step 3 - Run gossip

Click **Gossip** for one round, or **Run 3 rounds** to fast-forward the mesh. The topology panel shows which virtual phones hold packet IDs.

### Step 4 - Add mesh nodes

Use **Add offline** to add another relay-only phone, or **Add bridge** to add another phone with internet. More bridge nodes make duplicate delivery easier to demonstrate.

### Step 5 - Flush bridges

Click **Flush bridges**. All devices with internet upload every packet they hold to the backend in parallel.

The backend pipeline runs:
1. Hash the ciphertext (`SHA-256`).
2. Claim the hash through `IdempotencyService`.
3. If claimed: decrypt with the server's RSA private key.
4. Verify freshness (`signedAt` within 24 hours).
5. Settle the debit/credit in one DB transaction.

The production-facing `/api/bridge/ingest` endpoint now requires `X-Bridge-Api-Key`. The dashboard simulator calls the service internally, but real bridge clients must authenticate.

### Step 6 - Simulate a duplicate storm

Click **Duplicate storm** to automatically:

1. Reset the mesh topology to include multiple bridge nodes.
2. Create one encrypted payment packet.
3. Gossip it across the mesh.
4. Make multiple bridges upload that same packet concurrently.

Expected result:

```text
1 SETTLED
N DUPLICATE_DROPPED
```

This proves exactly-once settlement: even if the same encrypted packet reaches the backend through several bridge phones at once, the sender is debited only once.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SENDER PHONE (offline)                          │
│  PaymentInstruction { sender, receiver, amount, pinHash, nonce, time }  │
│              │                                                          │
│              ▼ encrypt with server's RSA public key                     │
│   MeshPacket { packetId, ttl, createdAt, ciphertext }                   │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ Bluetooth gossip
                                       ▼
        ┌─────────┐  hop    ┌─────────┐  hop   ┌─────────┐
        │stranger1│ ─────▶ │stranger2│ ─────▶ │ bridge  │ ◀── walks outside
        └─────────┘         └─────────┘        └────┬────┘     gets 4G
                                                    │
                                                    ▼ HTTPS POST
┌─────────────────────────────────────────────────────────────────────────┐
│                     SPRING BOOT BACKEND (this project)                  │
│                                                                         │
│  /api/bridge/ingest                                                     │
│       │                                                                 │
│       ▼                                                                 │
│  [1] hash ciphertext (SHA-256)                                          │
│       │                                                                 │
│       ▼                                                                 │
│  [2] IdempotencyService.claim(hash)  ◀── atomic putIfAbsent (≈ Redis   │
│       │                                  SETNX). Duplicates rejected    │
│       │                                  here, before any work.         │
│       ▼                                                                 │
│  [3] HybridCryptoService.decrypt(ciphertext)                            │
│       │       (RSA-OAEP unwraps AES key, AES-GCM decrypts payload       │
│       │        AND verifies the auth tag — tampering = exception)       │
│       ▼                                                                 │
│  [4] Freshness check: signedAt within last 24h                          │
│       │                                                                 │
│       ▼                                                                 │
│  [5] SettlementService.settle()                                         │
│       @Transactional: debit sender, credit receiver, write ledger       │
│       @Version on Account = optimistic locking (defense in depth)       │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## The three hard problems and how they're solved

### Problem 1: Untrusted intermediates

A random stranger's phone is carrying your transaction. How do you stop them from reading the amount or changing it?

**Solution: Hybrid encryption (RSA-OAEP + AES-GCM).**

The sender encrypts the payload with the server's public key. Only the server holds the private key, so intermediates see opaque ciphertext.

But RSA can only encrypt small data (~245 bytes for a 2048-bit key), and our payload is JSON that could exceed that. So we use the standard hybrid pattern:

1. Generate a fresh AES-256 key for *this packet*.
2. Encrypt the JSON with **AES-256-GCM** (fast + authenticated).
3. Encrypt just the AES key with **RSA-OAEP**.
4. Concatenate: `[256 bytes RSA-encrypted AES key][12 bytes IV][AES ciphertext + 16-byte GCM tag]`.

**Why GCM specifically?** It's authenticated encryption. If an intermediate flips one bit anywhere in the ciphertext, decryption throws an exception — the GCM tag won't verify. The server cannot be tricked into processing tampered data.

This is the same scheme TLS uses. See `HybridCryptoService.java`.

### Problem 2: The duplicate-storm

Three bridge nodes can hold the same encrypted packet. If they all regain internet at the same time, they may all upload that packet within milliseconds of each other. Without idempotency, one Rs. 500 payment could debit the sender multiple times.

**Solution: claim the ciphertext hash before doing settlement work.**

The first backend step is to compute `SHA-256(ciphertext)` and claim it through `IdempotencyService`:

```java
public boolean claim(String packetHash) {
    return store.claim(packetHash);
}
```

`IdempotencyService` now depends on an `IdempotencyStore` interface. The demo implementation is `InMemoryIdempotencyStore`, which uses `ConcurrentHashMap.putIfAbsent` for atomic first-writer-wins behavior. A production implementation can replace it with Redis using `SET key NX EX 86400` without changing the ingestion pipeline.

Only the first bridge that claims the hash proceeds to decrypt and settle. Later uploads of the same ciphertext return `DUPLICATE_DROPPED`.

**Why hash the ciphertext, not the packetId or the cleartext?**
- `packetId` can be rewritten by an intermediate phone.
- The cleartext requires decryption first; dedupe should happen before RSA work.
- The ciphertext is authenticated by AES-GCM, so tampering is detected during decrypt.

There's also a defense-in-depth fallback: `transactions.packet_hash` has a unique index. If the cache layer ever fails and two settlements somehow try to write the same hash, the database rejects the second one.

### Problem 3: Replay attacks

An attacker who captured a ciphertext weeks ago could replay it whenever convenient.

**Solution: Two layers.**

1. **Inside the encrypted payload**, the sender includes `signedAt` (epoch millis). The server rejects any packet older than 24 hours. The attacker can't change `signedAt` without breaking the GCM tag.
2. **Inside the encrypted payload**, the sender includes a **nonce** (UUID). Even if Alice legitimately sends Bob ₹100 twice, the nonces differ → ciphertexts differ → hashes differ → both settle. But a *replay* of one specific signed packet is byte-identical, so the idempotency cache catches it.

See `BridgeIngestionService.java` for the freshness check.

---

## File-by-file walkthrough

```text
upi-offline-mesh/
+-- pom.xml                                  Maven build, Spring Boot 3.3, Java 17
+-- mvnw, mvnw.cmd                           Maven wrapper
+-- README.md                                this file
+-- frontend/                                React dashboard source
�   +-- package.json                         React/Vite scripts and dependencies
�   +-- vite.config.js                       builds into Spring Boot static resources
�   +-- src/
�       +-- App.jsx                          dashboard orchestration and action handlers
�       +-- api/dashboardApi.js              typed fetch helpers for /api endpoints
�       +-- components/                      dashboard panels and controls
�       �   +-- DemoControls.jsx             payment, gossip, bridge, duplicate-storm controls
�       �   +-- MeshNetwork.jsx              visual mesh topology
�       �   +-- PacketJourney.jsx            payment-to-settlement timeline
�       �   +-- AccountPanel.jsx             balances
�       �   +-- TransactionLedger.jsx        latest transaction table
�       +-- styles/index.css                 responsive dashboard styling
+-- src/main/
    +-- resources/
    �   +-- application.properties           H2, TTLs, bridge API key
    �   +-- static/                          built React app served by Spring Boot
    +-- java/com/demo/upimesh/
        +-- UpiMeshApplication.java          Spring Boot main class
        +-- controller/
        �   +-- ApiController.java           REST endpoints
        �   +-- ApiExceptionHandler.java     validation/error response mapping
        �   +-- DashboardController.java     forwards / to React index.html
        +-- crypto/
        �   +-- ServerKeyHolder.java         generates RSA-2048 keypair on startup
        �   +-- HybridCryptoService.java     RSA-OAEP + AES-256-GCM + ciphertext hash
        +-- model/                           JPA entities and wire models
        +-- service/
            +-- DemoService.java             seeds accounts, simulates sender phone
            +-- MeshSimulatorService.java    gossip, add nodes, duplicate-storm topology
            +-- BridgeAuthService.java       X-Bridge-Api-Key validation
            +-- IdempotencyService.java      idempotency facade
            +-- IdempotencyStore.java        production-ready store interface
            +-- InMemoryIdempotencyStore.java JVM-local store for the demo
            +-- BridgeIngestionService.java  hash -> claim -> decrypt -> freshness -> settle
            +-- SettlementService.java       @Transactional debit/credit + ledger insert

src/test/java/com/demo/upimesh/
+-- IdempotencyConcurrencyTest.java          concurrency, crypto, auth, validation tests
```

---

## API reference

| Method | Path | What it does |
|---|---|---|
| GET | `/` | React dashboard |
| GET | `/api/server-key` | Server RSA public key metadata |
| GET | `/api/accounts` | Demo accounts and balances |
| GET | `/api/transactions` | Last 20 transactions |
| GET | `/api/mesh/state` | Current virtual devices, held packets, bridge count, idempotency cache size |
| POST | `/api/demo/send` | Validate, encrypt, and inject a demo payment packet |
| POST | `/api/mesh/gossip` | Run one gossip round |
| POST | `/api/mesh/gossip-rounds` | Run 1-10 gossip rounds in one call |
| POST | `/api/mesh/devices` | Add an offline relay or bridge node |
| POST | `/api/mesh/duplicate-storm` | Seed multiple bridges, inject one packet, gossip, and flush concurrently |
| POST | `/api/mesh/flush` | Upload all packets held by bridge nodes in parallel |
| POST | `/api/mesh/reset` | Clear mesh packets and idempotency cache |
| POST | `/api/bridge/ingest` | Production bridge endpoint; requires `X-Bridge-Api-Key` |
| GET | `/h2-console` | Browse the in-memory database |

H2 console login: JDBC URL `jdbc:h2:mem:upimesh`, username `sa`, no password.

### Request format for `/api/demo/send`

```json
{
  "senderVpa": "alice@demo",
  "receiverVpa": "bob@demo",
  "amount": 500,
  "pin": "1234",
  "ttl": 5,
  "startDevice": "phone-alice"
}
```

Validation errors return `400` with a JSON body such as:

```json
{
  "error": "bad_request",
  "message": "Sender and receiver must be different"
}
```

### Request format for `/api/mesh/devices`

```json
{ "hasInternet": true }
```

Use `true` for a bridge node and `false` for an offline relay.

### Request format for `/api/bridge/ingest`

```http
POST /api/bridge/ingest
Content-Type: application/json
X-Bridge-Api-Key: demo-bridge-secret
X-Bridge-Node-Id: phone-bridge-42
X-Hop-Count: 3

{
  "packetId": "550e8400-e29b-41d4-a716-446655440000",
  "ttl": 2,
  "createdAt": 1730000000000,
  "ciphertext": "base64-encoded-RSA-and-AES-blob"
}
```

The demo key is configured in `application.properties` as `upi.mesh.bridge-api-key`. In production, inject this from a secret manager or replace it with signed bridge tokens / mutual TLS.

Successful response:

```json
{
  "outcome": "SETTLED",
  "packetHash": "a3f8c9...",
  "reason": null,
  "transactionId": 42
}
```

Other outcomes include `DUPLICATE_DROPPED` and `INVALID`.

---
## Tests

Run all tests:

```cmd
mvnw.cmd test
```

Current test coverage includes:

- **`encryptDecryptRoundTrip`** - sanity-checks hybrid encryption/decryption.
- **`tamperedCiphertextIsRejected`** - flips a byte in the ciphertext and verifies the packet is rejected.
- **`singlePacketDeliveredByThreeBridgesSettlesExactlyOnce`** - sends one packet through three simultaneous bridge deliveries and verifies exactly one settlement.
- **`bridgeIngestRequiresApiKey`** - verifies `/api/bridge/ingest` rejects missing API keys and accepts the configured bridge key.
- **`demoSendRejectsInvalidPaymentInput`** - verifies bad demo payment input returns a clean validation error.

---

## What's NOT real (and what would change for production)

This is a teaching demo. To make it production-grade you'd swap or harden these things:

| What's in the demo | What it would be in production |
|---|---|
| H2 in-memory DB | PostgreSQL / MySQL with replicas |
| `InMemoryIdempotencyStore` | Redis-backed `IdempotencyStore` using `SET NX EX` |
| RSA keypair regenerated on every startup | Private key in HSM / KMS / Vault; public key cached on devices |
| Server-side `DemoService.createPacket()` | Equivalent code running on Android/iOS client |
| Software-simulated mesh (`MeshSimulatorService`) | Real BLE GATT, Wi-Fi Direct, or platform-specific nearby transport |
| Simple `X-Bridge-Api-Key` bridge auth | Signed bridge tokens, rotating credentials, or mutual TLS certificates |
| In-memory accounts seeded on startup | Real KYC users, VPAs, balances, and bank-core integration |
| Demo PIN hashing | Real device-bound PIN verification / secure element / bank auth flow |
| H2 console exposed | Disabled |
| No rate limiting | Per-bridge-node and per-sender velocity controls |
| Logs to console | Structured logs, audit trail, SIEM alerts for invalid/tampered packets |

The cryptography, idempotency contract, validation flow, and bridge-auth shape are intentionally production-like. The surrounding infrastructure is what changes.

---
## Honest limitations of the concept

I want this README to be useful to you when someone reviews the project, so let's be straight about what this design **does not** solve. These are not implementation bugs — they're inherent to "no internet, anywhere in the chain":

1. **The receiver has no way to verify the sender has the funds.** When sender hands receiver a phone showing "₹500 sent," it's an IOU, not a settled payment. If the sender's account is empty when the packet finally reaches the backend, the settlement will be `REJECTED` and the receiver is out ₹500 with no recourse. *This is why real offline UPI (UPI Lite) uses a pre-funded hardware-backed wallet* — to give cryptographic proof of available funds offline.
2. **A malicious sender can double-spend offline.** With ₹500 in their account, they could send a packet to Bob in basement A, walk to basement B, and send another ₹500 to Carol. Whichever packet hits the backend first wins; the other gets `REJECTED`. Same root cause as #1.
3. **Bluetooth in real life is hard.** Background BLE on Android is heavily throttled since Android 8. iOS peripheral mode is locked down. Two strangers' phones reliably forming a GATT connection while the apps aren't actively open is genuinely difficult and a lot of energy. This demo skips that problem entirely by simulating the mesh.
4. **Privacy / liability.** A stranger carries your encrypted transaction packet on their phone. They can't read it, but its existence is metadata. In a real deployment you'd want to think about regulatory disclosures and what happens if a device is seized.


---

## Frontend development

The dashboard is a React app under `frontend/`.

Common commands:

```cmd
cd frontend
npm install
npm run dev
```

The Vite dev server proxies `/api` to the Spring Boot backend on port 8080.

To rebuild the React bundle that Spring Boot serves from `/`:

```cmd
cd frontend
npm run build
```

The production build is emitted into `src/main/resources/static`. You can also run the combined Maven profile:

```cmd
mvnw.cmd -Pfrontend package
```

---

## Troubleshooting

**`java: command not found`** — Install JDK 17+. On Windows, `winget install EclipseAdoptium.Temurin.17.JDK` or download from adoptium.net.

**Port 8080 already in use** — Change `server.port` in `application.properties`.

**First `mvnw.cmd` run hangs for a long time** — It's downloading Maven (~10 MB) then dependencies (~80 MB). Give it 2–3 minutes on a normal connection. After that, startup is ~5 seconds.

**`mvnw.cmd : The term 'mvnw.cmd' is not recognized`** — On PowerShell you need to prefix with `.\`: `.\mvnw.cmd spring-boot:run`.

**Tests fail intermittently** — The concurrency test is timing-sensitive. If it ever flakes, run it 3x; if it consistently fails on your hardware, file the actual failure output.

---

## License

Demo code, no license. Use it however you want for learning.
