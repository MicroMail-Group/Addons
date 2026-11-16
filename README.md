# MicroMail Addons & SDKs 🧩

Official WebAssembly (WASM) and frontend addons, sample packages, and developer SDKs for [MicroMail](https://github.com/grimmdev/micromail).

---

## Directory Structure

```text
addons/
├── sdk/
│   ├── rust/               # Rust SDK (micromail-sdk crate for WASI backend addons)
│   └── typescript/         # TypeScript SDK for UI slot integration
└── packages/               # Official addon packages
    ├── antivirus-wasm/     # Real-time malware & signature scanner (Rust -> WASM)
    ├── spam-bayes-wasm/    # Heuristic Bayesian spam scoring hook (Rust -> WASM)
    └── voice-search-wasm/  # Client-side offline browser speech search (JS/WASM)
```

---

## Developer SDKs

### Rust SDK (`sdk/rust/micromail-sdk`)

Use the Rust SDK to build sandboxed backend WASI hooks (`on_inbound_pre_store`, etc.):

```toml
[dependencies]
micromail-sdk = { path = "../../sdk/rust/micromail-sdk" }
```

### TypeScript SDK (`sdk/typescript/`)

Use the TypeScript definitions for writing frontend UI slot extensions that run in the MicroMail webmail interface.

---

## Packaging an Addon

Addons are distributed as standard `.zip` files containing:
- `addon.json` (the manifest)
- WebAssembly binary (`.wasm`) or frontend entry (`index.js`)

Package example:
```bash
cd packages/antivirus-wasm
cargo build --target wasm32-wasip1 --release
zip -r antivirus.zip addon.json target/wasm32-wasip1/release/antivirus.wasm
```
