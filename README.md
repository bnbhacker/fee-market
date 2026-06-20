<div align="center">

<img src="web/public/brand-mark.png" width="84" alt="fee market" />

# fee market

**Own the cut.** A marketplace for token fees on Solana.

Launch a token, issue 100 NFTs against it — each NFT earns **1% of the token's trading fees**.
Mint a share, claim the coupons, trade the NFTs on the open market.

`React + TypeScript` · `Solana web3.js` · `Metaplex Core Candy Machine` · `Supabase Edge Functions (Deno)`

</div>

---

> **Status:** active development on **mainnet**

## The idea

Every token's trading generates creator fees. **fee market** turns the right to that fee stream into something you can own and trade:

1. **A token is launched.** On launch it issues a collection of **100 NFTs**.
2. **1 NFT = 1% of the token's fees.** Hold an NFT, earn a proportional share of the fees the token collects.
3. **Anyone can mint** an NFT for a fixed price (open mint, no whitelist). Mint revenue goes to the token's creator.
4. **Claim & trade.** Holders claim accrued fees; NFTs resell on Magic Eden / Tensor like any Solana NFT.

You own a token's *fees*, not the token.

## How it's built

```
┌──────────────────────────┐        ┌─────────────────────────────┐
│  Web app (React + Vite)  │        │  Supabase Edge Functions     │
│                          │        │  (Deno, sign with treasury)  │
│  • wallet connect        │        │                              │
│  • launch token (SPL)    │──────▶ │  • upload-metadata           │
│  • mint NFTs (1 sig for  │        │  • create-collection         │
│    many)                 │        │  • create-candy-machine      │
│  • custom design system  │        └──────────────┬──────────────┘
└───────────┬──────────────┘                       │
            │                                       ▼
            ▼                        ┌─────────────────────────────┐
   ┌──────────────────┐             │  Solana (Metaplex Core)      │
   │  Supabase (DB +   │             │  • 1 collection per token    │
   │  Storage)         │             │  • Candy Machine, 100 items  │
   └──────────────────┘             │  • solPayment guard → creator│
                                     └─────────────────────────────┘
```

- **Frontend** (`web/`): a single-page React app with a hand-built design system (no UI kit). Connects Phantom / Solflare, launches a real SPL token in the browser, and mints NFTs from a Candy Machine — building *N* mint transactions that the wallet signs in **one approval**.
- **Edge Functions** (`supabase/functions/`): the operations that must be signed by the platform treasury key (creating a collection and a Candy Machine) run server-side in Deno, never in the browser. The treasury private key lives only in a server secret.
- **On-chain**: each token gets its own Metaplex **Core** collection and a **Core Candy Machine** loaded with 100 config lines. The mint price is enforced by the Candy Machine's `solPayment` guard, with the payout routed to the token's creator.

## Tech stack

| Layer | Tools |
|---|---|
| Frontend | React 19, TypeScript, Vite, Tailwind v4, custom CSS design system |
| Solana | `@solana/web3.js`, `@solana/spl-token`, wallet-adapter (Phantom/Solflare) |
| NFTs | Metaplex **Umi**, `mpl-core`, `mpl-core-candy-machine`, `mpl-toolbox` |
| Backend | Supabase — Postgres, Storage, Edge Functions (Deno) |

## Repository structure

```
web/                         React + Vite app
  src/
    App.tsx                  app shell, routing, launch & mint flows
    rake/                    design system + Solana helpers
      mint.ts                read mint count + multi-mint via Umi
      icons.tsx  ui.tsx      icons, formatters, primitives
    rake.css                 the visual design system
    config.ts                env-driven network / RPC / Supabase config
supabase/
  functions/                 Deno Edge Functions (treasury-signed ops)
    _shared/solana.ts        load treasury keypair, RPC connection
    create-collection/       create a Metaplex Core collection
    create-candy-machine/    create the Candy Machine + load 100 items
    upload-metadata/         generate + host NFT metadata in Storage
  migrations/                SQL schema migrations
scripts/
  generate-metadata.mjs      reusable 100-item metadata generator
```

## Notable engineering notes

A few problems worth highlighting (the kind of thing that doesn't show up in a screenshot):

- **pump.fun can't run on devnet.** Its program is mainnet-only and its metadata API is CORS-blocked from the browser. So devnet token creation was reimplemented as a real in-browser SPL mint (`createAccount` + `initializeMint2` + ATA + `mintTo`), with pump.fun reserved for mainnet via a browser-friendly relay.
- **Heavy Metaplex stack in the browser.** Bundling `mpl-core-candy-machine` under Vite surfaced a `@noble/hashes` export-map conflict (`Missing "./sha3"`): newer `@noble/curves@2` pulls `@noble/hashes@2` which dropped the bare `./sha3` specifier the Metaplex stack imports. Pinned `@noble/hashes` to `1.8.0` — the one version exposing **both** `./sha3` and `./sha3.js`.
- **One signature for many mints.** Minting *N* NFTs builds *N* transactions; each new asset keypair self-signs, then the wallet signs them all at once via `signAllTransactions` — a single Phantom prompt instead of *N*.
- **Treasury key never touches the client.** Collection and Candy Machine creation are signed by the platform key inside Edge Functions; the browser only triggers them and the user only ever signs their own token launch / mints.
- **Browser-callable Edge Functions** with explicit CORS, called over `fetch` with just the anon key — and the slow public devnet RPC swapped for a dedicated endpoint to keep the 100-item Candy Machine setup well under the function timeout.

## Local development

> Requires your own Supabase project and a Solana RPC. Copy `web/.env.example` → `web/.env` and fill it in.

```bash
cd web
pnpm install
pnpm dev            # http://localhost:5173
```

Environment (`web/.env`):

```
VITE_SOLANA_NETWORK=devnet
VITE_RPC_URL=...           # your devnet RPC
VITE_TREASURY_ADDRESS=...  # platform wallet (public address)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Edge Functions read a `TREASURY_PRIVATE_KEY` secret (set via `supabase secrets set`) — it is **never** committed or shipped to the browser.


## License

MIT — see [LICENSE](LICENSE).
