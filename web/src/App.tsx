import { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { WalletName } from "@solana/wallet-adapter-base";
import { Connection, Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import {
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getMinimumBalanceForRentExemptMint,
  getAssociatedTokenAddress,
  createInitializeMint2Instruction,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
} from "@solana/spl-token";
import { supabase } from "./supabaseClient";
import { RPC_URL, SUPABASE_URL, SUPABASE_ANON_KEY, TREASURY_ADDRESS } from "./config";
import { IconBack, IconChevron, IconCheck, IconExternal, IconCopy, TokenMark } from "./rake/icons";
import { SOL, fmtSol, Pill, Dot } from "./rake/ui";
import { fetchMintedCount, mintMany } from "./rake/mint";

// Бренд — поменяй `word`, чтобы переименовать продукт во всех местах разом.
const BRAND = { word: "fee market", tagline: "own the cut · devnet" };
// Сайт продукта — подставляется в поле website токена, если оставить его пустым. Поменяй на свой домен.
const SITE_URL = "https://feemarket.app";

// Знак бренда (FM-плитка) из public/. Используется в шапке и футере.
function BrandMark({ size = 30, radius = 8 }: { size?: number; radius?: number }) {
  return <img src="/brand-mark.png" alt="fee market" width={size} height={size}
    style={{ borderRadius: radius, display: "block" }} />;
}

const MINT_PRICE = 0.01; // цена минта одного NFT (◎), фиксированная в Candy Machine
const SUPPLY = 100; // NFT на токен

type View = "tokens" | "detail" | "create" | "claim" | "how";

type Token = {
  id: string | number;
  name: string;
  ticker: string;
  twitter?: string | null;
  website?: string | null;
  image_url?: string | null;
  mint_address?: string | null;
  creator?: string | null;
  created_at?: string | null;
  collection_address?: string | null;
  candy_machine_address?: string | null;
};

const NAV: { id: View; label: string }[] = [
  { id: "tokens", label: "Tokens" },
  { id: "create", label: "Create" },
  { id: "claim", label: "Claim" },
  { id: "how", label: "How it works" },
];

const identicon = (ticker: string) =>
  `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(ticker || "TOKEN")}`;

const shortAddr = (a?: string | null) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—");

// Аватарка токена: реальная картинка (image_url), иначе — фирменный знак-заглушка.
function TokenAvatar({ src, size = 38, radius = 10, accent }: { src?: string | null; size?: number; radius?: number; accent?: boolean }) {
  if (src) {
    return (
      <img src={src} alt="" width={size} height={size}
        style={{ width: size, height: size, borderRadius: radius, objectFit: "cover", flex: "none", display: "block", background: "var(--surface-2)", border: "1px solid var(--line)" }} />
    );
  }
  return <TokenMark size={size} radius={radius} accent={accent} />;
}

// Читает файл картинки и ужимает до квадрата size×size (PNG data URL) — чтобы не раздувать БД.
function fileToResizedDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas"));
      // cover-кроп по центру
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("bad image"));
    img.src = URL.createObjectURL(file);
  });
}

// ---------------- presentational pieces ----------------

type WalletOption = { adapter: { name: WalletName; icon: string }; readyState: WalletReadyState };

function TopNav({
  view, onNav, walletLabel, connected, connecting, onWalletClick, walletMenu, wallets, onPick,
}: {
  view: View; onNav: (v: View) => void; walletLabel: string;
  connected: boolean; connecting: boolean; onWalletClick: () => void;
  walletMenu: boolean; wallets: WalletOption[]; onPick: (name: WalletName) => void;
}) {
  const active: View = view === "detail" ? "tokens" : view;
  return (
    <div className="topnav">
      <div className="topnav-inner">
        <button className="brand" onClick={() => onNav("tokens")}>
          <BrandMark size={30} radius={8} />
          <span className="brand-word">{BRAND.word}</span>
        </button>
        <nav className="tabs">
          {NAV.map((n) => (
            <button key={n.id} className={"tab" + (active === n.id ? " tab-on" : "")} onClick={() => onNav(n.id)}>
              {n.label}
            </button>
          ))}
        </nav>
        <div className="wallet-wrap">
          <button className={"wallet" + (connected ? " wallet-on" : "")} onClick={onWalletClick} disabled={connecting}>
            <span className="wallet-dot" />
            <span className="mono">{walletLabel}</span>
          </button>
          {walletMenu && !connected && (
            <>
              <div className="wallet-overlay" onClick={onWalletClick} />
              <div className="wallet-menu">
                {wallets.length === 0 ? (
                  <div className="wallet-menu-empty">No Solana wallet detected. Install Phantom, Solflare or Backpack.</div>
                ) : (
                  wallets.map((w) => (
                    <button key={w.adapter.name} className="wallet-opt" onClick={() => onPick(w.adapter.name)}>
                      {w.adapter.icon && <img src={w.adapter.icon} alt="" width={18} height={18} style={{ borderRadius: 5 }} />}
                      <span className="wallet-opt-name">{w.adapter.name}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Hero({ onBrowse, onHow }: { onBrowse: () => void; onHow: () => void }) {
  return (
    <header className="hero">
      <div className="eyebrow">A marketplace for token fees · on Solana</div>
      <h1 className="hero-title">Own the <span className="hl">cut.</span></h1>
      <p className="hero-sub">
        Every token launches 100 NFTs — each one earns 1% of the token&rsquo;s trading fees.
        Mint a share, claim the coupons. Own a token&rsquo;s fees, not the token.
      </p>
      <div className="hero-actions">
        <button className="btn btn-primary" onClick={onBrowse}>Browse tokens</button>
        <button className="btn btn-ghost" onClick={onHow}>How it works</button>
      </div>
    </header>
  );
}

const SORTS: { id: string; label: string }[] = [
  { id: "new", label: "New" },
  { id: "name", label: "Name" },
];

function Segmented({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="segmented" role="tablist">
      {SORTS.map((o) => (
        <button key={o.id} role="tab" aria-selected={value === o.id}
          className={"seg" + (value === o.id ? " seg-on" : "")} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function TokenRow({ t, index, onOpen }: { t: Token; index: number; onOpen: (t: Token) => void }) {
  return (
    <button className="trow" onClick={() => onOpen(t)}>
      <span className="trow-idx mono">{String(index + 1).padStart(2, "0")}</span>
      <span className="trow-token">
        <TokenAvatar src={t.image_url} accent={!!t.candy_machine_address} />
        <span className="trow-token-text">
          <span className="trow-ticker mono">${t.ticker}</span>
          <span className="trow-blurb">{t.name}</span>
        </span>
      </span>
      {/* Rake / trade и Est. coupon пока не считаем — честный прочерк */}
      <span className="trow-num trow-dim mono">—</span>
      <span className="trow-num trow-dim mono">—</span>
      <span className="trow-num trow-price mono">{fmtSol(MINT_PRICE)} {SOL}</span>
      <span className="trow-go"><IconChevron size={18} /></span>
    </button>
  );
}

function Metric({ label, children, accent }: { label: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className="metric">
      <div className="metric-label mono">{label}</div>
      <div className={"metric-value" + (accent ? " metric-accent" : "")}>{children}</div>
    </div>
  );
}

function DetailRow({ k, v, copyable }: { k: string; v: React.ReactNode; copyable?: string | null }) {
  return (
    <div className="drow">
      <span className="drow-k">{k}</span>
      <span className="drow-v mono">
        {v}
        {copyable && (
          <button className="drow-copy" title="Copy" onClick={() => navigator.clipboard?.writeText(copyable)}>
            <IconCopy size={13} />
          </button>
        )}
      </span>
    </div>
  );
}

// ---------------- main app ----------------

export default function App() {
  const { connected, connecting, connect, disconnect, publicKey, signTransaction, signAllTransactions, signMessage, wallet, wallets, select } = useWallet();
  // Флаг «хотим подключиться после выбора кошелька» — connect() требует уже выбранного кошелька.
  const [wantConnect, setWantConnect] = useState(false);
  const [walletMenu, setWalletMenu] = useState(false);

  // Доступные (установленные) кошельки для меню выбора.
  const availableWallets = wallets.filter(
    (w) => w.readyState === WalletReadyState.Installed || w.readyState === WalletReadyState.Loadable,
  );

  const [view, setView] = useState<View>("tokens");
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [sort, setSort] = useState("new");
  const [modalOpen, setModalOpen] = useState(false);

  // Минт NFT (1.6.3)
  const [mintedCount, setMintedCount] = useState<number | null>(null);
  const [minting, setMinting] = useState(false);
  const [mintStatus, setMintStatus] = useState("");
  const [mintError, setMintError] = useState("");
  const [mintedAsset, setMintedAsset] = useState("");
  const [mintQty, setMintQty] = useState(1); // сколько NFT минтим за раз
  const [mintedQty, setMintedQty] = useState(0); // сколько сминтили (для экрана успеха)

  const [formData, setFormData] = useState({ name: "", ticker: "", twitter: "", website: "", image: "" });
  const fileRef = useRef<HTMLInputElement>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [successMint, setSuccessMint] = useState("");
  // Результат автонастройки NFT-коллекции при запуске токена (1.6.4).
  const [setupNote, setSetupNote] = useState<"" | "ok" | "fail">("");

  useEffect(() => {
    if (view === "tokens") fetchTokens();
  }, [view]);

  // Живой счётчик минта (X/100) с on-chain при открытии детальной.
  useEffect(() => {
    setMintedCount(null);
    const cm = selectedToken?.candy_machine_address;
    if (view !== "detail" || !cm) return;
    let cancelled = false;
    fetchMintedCount(cm).then((n) => { if (!cancelled) setMintedCount(n); }).catch(() => {});
    return () => { cancelled = true; };
  }, [view, selectedToken?.candy_machine_address]);

  function openMintModal() {
    setMintError("");
    setMintedAsset("");
    setMintStatus("");
    setMintQty(1);
    setModalOpen(true);
  }

  // Загрузка аватарки токена: ужимаем до 256px и кладём в форму как data URL.
  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file, 256);
      setFormData((f) => ({ ...f, image: dataUrl }));
    } catch { /* кривая картинка — игнор */ }
  }

  async function handleMint() {
    const cm = selectedToken?.candy_machine_address;
    const coll = selectedToken?.collection_address;
    if (!cm || !coll) return;
    setMintError("");
    if (!connected || !publicKey) {
      await handleWallet();
      return;
    }
    const destination = selectedToken.creator || TREASURY_ADDRESS; // получатель оплаты = создатель (старые токены → казна)
    setMinting(true);
    setMintStatus(mintQty > 1 ? `Approve ${mintQty} mints in Phantom…` : "Approve in Phantom…");
    try {
      const wallet = { publicKey, signTransaction, signAllTransactions, signMessage };
      const { assets } = await mintMany(wallet, cm, coll, destination, mintQty);
      setMintedAsset(assets[0] || "");
      setMintedQty(assets.length);
      fetchMintedCount(cm).then(setMintedCount).catch(() => {});
    } catch (e: any) {
      const msg = e?.message || "Mint failed";
      setMintError(/reject/i.test(msg) ? "Transaction rejected by wallet." : msg);
    } finally {
      setMinting(false);
      setMintStatus("");
    }
  }

  async function fetchTokens() {
    setLoading(true);
    const { data, error } = await supabase.from("tokens").select("*").order("created_at", { ascending: false });
    if (!error && data) setTokens(data as Token[]);
    setLoading(false);
  }

  const go = (v: View, token?: Token) => {
    setView(v);
    if (token) setSelectedToken(token);
    document.querySelector(".scroll")?.scrollTo({ top: 0 });
  };

  async function handleWallet() {
    if (connected) { await disconnect(); return; }
    if (!wallet) {
      // Кошелёк ещё не выбран — показываем меню выбора.
      setWalletMenu(true);
      return;
    }
    try { await connect(); } catch { /* user dismissed */ }
  }

  // Выбор кошелька из меню → выбираем и доводим подключение в эффекте.
  function pickWallet(name: WalletName) {
    setWalletMenu(false);
    setWantConnect(true);
    select(name);
  }

  // Как только Phantom выбран — доводим подключение (connect() требует выбранного кошелька).
  useEffect(() => {
    if (wantConnect && wallet && !connected && !connecting) {
      setWantConnect(false);
      connect().catch(() => { /* user dismissed */ });
    }
  }, [wantConnect, wallet, connected, connecting]);

  // Вызов Edge Function обычным fetch (только Authorization + Content-Type —
  // эти заголовки функции уже разрешают в CORS, передеплой не нужен). Бросает при ошибке.
  async function invokeFn(name: string, body: Record<string, unknown>) {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || (data as any)?.error) throw new Error(`${name}: ${(data as any)?.error || res.status}`);
    return data as any;
  }

  // 1.6.4 — автонастройка коллекции из 100 NFT для нового токена:
  // метаданные в Storage → Core-коллекция → Candy Machine → запись адресов в токен.
  async function setupNftCollection(tokenId: string | number, key: string, creator: string) {
    const imageUrl = `${SUPABASE_URL}/storage/v1/object/public/nft-assets/image.png`;
    setTxStatus("Uploading NFT metadata…");
    await invokeFn("upload-metadata", { token: key, imageUrl });
    setTxStatus("Creating collection…");
    const coll = await invokeFn("create-collection", { token: key });
    // Сохраняем адрес коллекции СРАЗУ — чтобы не потерять, если долгий следующий шаг упадёт.
    await supabase.from("tokens").update({ collection_address: coll.collectionAddress }).eq("id", tokenId);
    setTxStatus("Loading 100 NFTs… (~20 sec)");
    // creator — кошелёк создателя: оплата минта пойдёт ему.
    const cm = await invokeFn("create-candy-machine", { token: key, collection: coll.collectionAddress, creator });
    await supabase.from("tokens").update({ candy_machine_address: cm.candyMachine }).eq("id", tokenId);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError("");
    setSuccessMint("");
    setSetupNote("");

    if (!connected || !publicKey || !signTransaction) {
      await handleWallet();
      return;
    }

    setSubmitting(true);
    try {
      const connection = new Connection(RPC_URL, "confirmed");

      // Создаём реальный SPL-токен на devnet. pump.fun здесь не годится: его программы
      // нет в devnet, а его API блокирует браузер по CORS. Имя/тикер/аватарка/сайт
      // храним у нас в БД для отображения. На mainnet вернём pump.fun (через PumpPortal).
      setTxStatus("Building transaction…");
      const mintKeypair = Keypair.generate();
      const mint = mintKeypair.publicKey;
      const mintAddress = mint.toBase58();
      const decimals = 6;
      const rent = await getMinimumBalanceForRentExemptMint(connection);
      const ata = await getAssociatedTokenAddress(mint, publicKey);
      const supply = BigInt(1_000_000_000) * BigInt(10) ** BigInt(decimals); // 1B токенов создателю

      const tx = new Transaction().add(
        SystemProgram.createAccount({ fromPubkey: publicKey, newAccountPubkey: mint, space: MINT_SIZE, lamports: rent, programId: TOKEN_PROGRAM_ID }),
        createInitializeMint2Instruction(mint, decimals, publicKey, null, TOKEN_PROGRAM_ID),
        createAssociatedTokenAccountInstruction(publicKey, ata, publicKey, mint, TOKEN_PROGRAM_ID),
        createMintToInstruction(mint, ata, publicKey, supply, [], TOKEN_PROGRAM_ID),
      );

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      tx.partialSign(mintKeypair);

      setTxStatus("Approve in Phantom…");
      const signedTx = await signTransaction(tx);

      setTxStatus("Sending transaction…");
      const signature = await connection.sendRawTransaction(signedTx.serialize(), { skipPreflight: false });
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      const imageUrl = formData.image || identicon(formData.ticker);
      const website = formData.website.trim() || SITE_URL;
      const creatorAddr = publicKey.toBase58(); // создатель токена — ему пойдёт оплата минта
      const { data: inserted, error: insertErr } = await supabase.from("tokens").insert([{
        name: formData.name,
        ticker: formData.ticker,
        twitter: formData.twitter || null,
        website,
        image_url: imageUrl,
        mint_address: mintAddress,
        creator: creatorAddr,
      }]).select();
      // Не глотаем ошибку вставки — иначе токен есть on-chain, а в списке его нет.
      if (insertErr) throw new Error(`Saving token failed: ${insertErr.message}`);

      setSuccessMint(mintAddress);
      const ticker = formData.ticker;
      setFormData({ name: "", ticker: "", twitter: "", website: "", image: "" });
      if (fileRef.current) fileRef.current.value = "";

      // Токен создан. Теперь автонастройка NFT-коллекции (best-effort):
      // если упадёт — токен всё равно остаётся, просто без минта (можно повторить).
      const row = inserted?.[0];
      if (row) {
        try {
          await setupNftCollection(row.id, ticker, creatorAddr);
          setSetupNote("ok");
        } catch (setupErr) {
          console.error(setupErr);
          setSetupNote("fail");
        }
      }
      fetchTokens();
    } catch (err: any) {
      const msg = err?.message || "Transaction failed";
      setSubmitError(msg.includes("reject") ? "Transaction rejected by wallet." : msg);
    } finally {
      setSubmitting(false);
      setTxStatus("");
    }
  }

  const sortedTokens = [...tokens].sort((a, b) => {
    if (sort === "name") return a.ticker.localeCompare(b.ticker);
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  const walletLabel = connecting
    ? "Connecting…"
    : connected && publicKey
    ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
    : "Connect";

  const previewTicker = (formData.ticker || "TICKER").toUpperCase().slice(0, 8);
  // Максимум за один минт: не больше остатка из 100 и не больше 10 за раз.
  const maxQty = Math.max(1, Math.min(10, SUPPLY - (mintedCount ?? 0)));

  return (
    <div className="rake-app">
      <TopNav view={view} onNav={(v) => go(v)} walletLabel={walletLabel}
        connected={connected} connecting={connecting}
        onWalletClick={() => { if (connected) disconnect(); else setWalletMenu((o) => !o); }}
        walletMenu={walletMenu} wallets={availableWallets as WalletOption[]} onPick={pickWallet} />

      <div className="scroll">
        <main className="stage" key={view + (selectedToken?.id ?? "")}>

          {/* ===== TOKENS (list) ===== */}
          {view === "tokens" && (
            <>
              <Hero
                onBrowse={() => document.querySelector(".list-wrap")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                onHow={() => go("how")}
              />
              <section className="list-wrap">
                <div className="list-head">
                  <div className="list-head-left">
                    <h2 className="list-title">Titles for sale</h2>
                    <span className="list-count mono">{tokens.length} listed</span>
                  </div>
                  <Segmented value={sort} onChange={setSort} />
                </div>

                {loading && (
                  <div className="rake-empty"><div className="rake-spinner" /></div>
                )}

                {!loading && tokens.length === 0 && (
                  <div className="rake-empty">
                    <h3 className="list-title" style={{ marginBottom: 8 }}>No titles yet.</h3>
                    <p className="page-sub" style={{ margin: "0 0 24px" }}>Be the first to issue one.</p>
                    <button className="btn btn-primary" onClick={() => go("create")}>Create a title</button>
                  </div>
                )}

                {!loading && tokens.length > 0 && (
                  <div className="table card">
                    <div className="thead mono">
                      <span>#</span><span>Token</span>
                      <span className="ta-r">Rake / trade</span>
                      <span className="ta-r">Est. coupon</span>
                      <span className="ta-r">Mint price</span>
                      <span></span>
                    </div>
                    <div className="tbody">
                      {sortedTokens.map((t, i) => (
                        <TokenRow key={t.id} t={t} index={i} onOpen={(tok) => go("detail", tok)} />
                      ))}
                    </div>
                  </div>
                )}
                <p className="list-foot">
                  Mint price is fixed at {fmtSol(MINT_PRICE)} {SOL} per NFT. Fee metrics arrive once trading data is tracked.
                </p>
              </section>
            </>
          )}

          {/* ===== TOKEN DETAIL ===== */}
          {view === "detail" && selectedToken && (
            <section className="detail">
              <button className="back" onClick={() => go("tokens")}><IconBack size={16} /> All titles</button>

              <div className="detail-top">
                <div className="detail-id">
                  <TokenAvatar src={selectedToken.image_url} size={56} radius={14} accent={!!selectedToken.candy_machine_address} />
                  <div className="detail-id-text">
                    <div className="detail-ticker-row">
                      <h2 className="detail-ticker mono">${selectedToken.ticker}</h2>
                      <Pill tone="sale"><Dot color="var(--accent)" /> {selectedToken.candy_machine_address ? "Mintable" : "Pending"}</Pill>
                    </div>
                    <p className="detail-blurb">{selectedToken.name}</p>
                  </div>
                </div>
              </div>

              <div className="metric-grid card">
                <Metric label="Mint price">{fmtSol(MINT_PRICE)} {SOL}</Metric>
                <Metric label="Minted">{mintedCount === null ? "—" : mintedCount} / {SUPPLY}</Metric>
                <Metric label="Supply">{SUPPLY}</Metric>
                <Metric label="Per-NFT share" accent><Dot /> 1%</Metric>
              </div>

              <div className="detail-cols">
                <div className="detail-main">
                  <div className="card prose-card">
                    <div className="card-kicker mono">About this title</div>
                    <p className="prose">
                      Each ${selectedToken.ticker} NFT carries the right to <strong>1% of every fee</strong> the
                      token collects. There are <strong>{SUPPLY}</strong> of them — mint as many as you like at
                      {" "}{fmtSol(MINT_PRICE)} {SOL} each. Fees accrue on-chain; whoever holds the NFT can claim
                      them at any time. You own the cut, not the token.
                    </p>
                  </div>

                  <div className="card details-card">
                    <div className="card-kicker mono">Details</div>
                    <DetailRow k="Token mint" v={shortAddr(selectedToken.mint_address)} copyable={selectedToken.mint_address} />
                    <DetailRow k="Network" v="Solana devnet" />
                    <DetailRow k="NFT standard" v="Metaplex Core" />
                    <DetailRow k="Collection" v={shortAddr(selectedToken.collection_address)} copyable={selectedToken.collection_address} />
                    {selectedToken.website && (
                      <DetailRow k="Website" v={<a href={selectedToken.website} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", textDecoration: "none" }}>{selectedToken.website.replace(/^https?:\/\//, "")} ↗</a>} />
                    )}
                    {selectedToken.twitter && (
                      <DetailRow k="Twitter" v={<a href={selectedToken.twitter} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)", textDecoration: "none" }}>open ↗</a>} />
                    )}
                    <DetailRow k="Issued" v={selectedToken.created_at ? new Date(selectedToken.created_at).toLocaleDateString() : "—"} />
                  </div>
                </div>

                <aside className="detail-side">
                  <div className="card buy-card">
                    <div className="claimable">
                      <span className="claimable-label mono">Each NFT earns</span>
                      <span className="claimable-val mono"><Dot /> 1% of fees</span>
                    </div>
                    <div className="mint-rows">
                      <div className="mint-row">
                        <span className="buy-price-label mono">Mint price</span>
                        <span className="buy-price-val mono">{fmtSol(MINT_PRICE)} {SOL}</span>
                      </div>
                      <div className="mint-row">
                        <span className="buy-price-label mono">Minted</span>
                        <span className="mint-edition mono">{mintedCount === null ? "—" : mintedCount} / {SUPPLY}</span>
                      </div>
                    </div>
                    {selectedToken.candy_machine_address ? (
                      <button className="btn btn-accent btn-block" onClick={openMintModal}>Mint NFT</button>
                    ) : (
                      <button className="btn btn-accent btn-block" disabled>NFT collection pending</button>
                    )}
                    <p className="buy-note">Each NFT pays its holder 1% of every fee ${selectedToken.ticker} collects. Mint more to earn a bigger share.</p>
                  </div>

                  <div className="card market-card">
                    <div className="card-kicker mono">Trade on secondary</div>
                    <a className="market-btn" href="https://magiceden.io" target="_blank" rel="noreferrer">
                      <span className="market-dot" style={{ background: "#e42575" }} />
                      <span className="market-name">Magic Eden</span><IconExternal size={15} />
                    </a>
                    <a className="market-btn" href="https://www.tensor.trade" target="_blank" rel="noreferrer">
                      <span className="market-dot" style={{ background: "#54d6c2" }} />
                      <span className="market-name">Tensor</span><IconExternal size={15} />
                    </a>
                    <p className="buy-note">Once minted, these NFTs trade like any Solana NFT — resale happens on these marketplaces, not here.</p>
                  </div>
                </aside>
              </div>
            </section>
          )}

          {/* ===== CREATE ===== */}
          {view === "create" && (
            <section className="create">
              <div className="page-head">
                <h2 className="page-title">Issue a title</h2>
                <p className="page-sub">Launch a real token on Solana devnet. Honest defaults, no hidden cuts. Wallet required to sign.</p>
              </div>

              <div className="create-cols">
                <form className="card create-form" onSubmit={handleCreate}>
                  <label className="field">
                    <span className="field-label">Token name</span>
                    <input className="input" value={formData.name} placeholder="Kettle"
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                  </label>
                  <label className="field">
                    <span className="field-label">Ticker</span>
                    <input className="input mono" value={formData.ticker} placeholder="KETTLE" maxLength={8}
                      onChange={(e) => setFormData({ ...formData, ticker: e.target.value })} required />
                  </label>
                  <label className="field">
                    <span className="field-label">Twitter / X <span className="field-hint mono">optional</span></span>
                    <input className="input" value={formData.twitter} placeholder="https://twitter.com/yourtoken"
                      onChange={(e) => setFormData({ ...formData, twitter: e.target.value })} />
                  </label>
                  <label className="field">
                    <span className="field-label">Website <span className="field-hint mono">optional · defaults to {BRAND.word}</span></span>
                    <input className="input" value={formData.website} placeholder={SITE_URL}
                      onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
                  </label>
                  <div className="field">
                    <span className="field-label">Token avatar <span className="field-hint mono">optional</span></span>
                    <div className="avatar-slot" onClick={() => fileRef.current?.click()}>
                      {formData.image
                        ? <img src={formData.image} alt="avatar" />
                        : <span className="avatar-hint">Click to add an image</span>}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={onAvatarChange} />
                  </div>

                  {submitting && txStatus && <p className="modal-status">{txStatus}</p>}
                  {submitError && <p className="modal-error">{submitError}</p>}
                  {successMint && (
                    <div className="claimable" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                      <span className="claimable-label mono">Token launched</span>
                      <a className="mono" style={{ color: "var(--accent-ink)", fontSize: 12, wordBreak: "break-all", textDecoration: "none" }}
                        href={`https://explorer.solana.com/address/${successMint}?cluster=devnet`} target="_blank" rel="noreferrer">{successMint} →</a>
                      {setupNote === "ok" && (
                        <span className="mono" style={{ color: "var(--accent-ink)", fontSize: 12 }}>NFT collection live — ready to mint ✓</span>
                      )}
                      {setupNote === "fail" && (
                        <span className="mono" style={{ color: "var(--neg)", fontSize: 12 }}>Token created, but NFT collection setup failed (treasury may be low on devnet SOL).</span>
                      )}
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
                    {submitting ? (txStatus || "Processing…") : connected ? "Create title (devnet)" : "Connect wallet to launch"}
                  </button>
                  <p className="buy-note">Creates a real SPL token on devnet, then auto-sets up its 100-NFT fee collection. Mainnet (pump.fun) later.</p>
                </form>

                <aside className="create-preview">
                  <div className="card-kicker mono preview-kicker">Live preview</div>
                  <div className="card preview-card">
                    <div className="detail-top" style={{ marginBottom: 18 }}>
                      <div className="detail-id">
                        <img src={formData.image || identicon(previewTicker)} alt="" width={48} height={48}
                          style={{ borderRadius: 12, objectFit: "cover", background: "var(--surface-2)", border: "1px solid var(--line)" }} />
                        <div className="detail-id-text">
                          <div className="detail-ticker-row">
                            <h3 className="detail-ticker mono" style={{ fontSize: 24 }}>${previewTicker}</h3>
                            <Pill tone="neutral">DRAFT</Pill>
                          </div>
                          <p className="detail-blurb">{formData.name || "Your token name"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="metric-grid" style={{ border: "none", padding: 0, gridTemplateColumns: "1fr 1fr", marginBottom: 0 }}>
                      <Metric label="Mint price">{fmtSol(MINT_PRICE)} {SOL}</Metric>
                      <Metric label="Per-NFT share" accent><Dot /> 1%</Metric>
                    </div>
                    <p className="prose" style={{ marginTop: 16, minHeight: 44 }}>
                      {`A 100-NFT fee collection for $${previewTicker} — mint a share, claim every coupon the pot pays.`}
                    </p>
                    <div className="preview-meta mono">100 NFTs · Metaplex Core · Solana</div>
                  </div>
                </aside>
              </div>
            </section>
          )}

          {/* ===== CLAIM ===== */}
          {view === "claim" && (
            <section className="claim">
              <div className="page-head">
                <h2 className="page-title">Claim coupons</h2>
                <p className="page-sub">Fees you&rsquo;re owed across the NFTs you hold. Claim individually or all at once.</p>
              </div>

              <div className="claim-total-card">
                <div className="claim-total-left">
                  <div className="claim-total-label mono">Total claimable</div>
                  <div className="claim-total-val mono"><Dot color="#1ad17a" size={9} /> {fmtSol(0, 3)} {SOL}</div>
                </div>
                <button className="btn btn-accent btn-lg" disabled>Claim all</button>
              </div>

              <div className="card claim-list">
                <div className="claim-empty">
                  {connected
                    ? "No coupons to claim yet — mint a title's NFT to start earning."
                    : "Connect your wallet to see coupons owed to your NFTs."}
                </div>
              </div>
              <p className="list-foot">Real claims arrive in a later phase — payouts settle from the treasury to NFT holders on Solana.</p>
            </section>
          )}

          {/* ===== HOW IT WORKS ===== */}
          {view === "how" && (
            <section className="how">
              <div className="page-head">
                <h2 className="page-title">How it works</h2>
                <p className="page-sub">Four steps. No jargon, no leverage, no fine print that matters.</p>
              </div>
              <div className="how-grid">
                {[
                  { n: "01", title: "A token pays the rake", body: "Every trade on the token routes a small creator fee — the rake — into a shared pot on-chain." },
                  { n: "02", title: "The rake is split into 100 NFTs", body: "Each token issues 100 NFTs. One NFT = the right to 1% of that fee stream — something you actually own." },
                  { n: "03", title: "Mint or trade the NFTs", body: "Mint a share at 0.01 ◎, or buy and sell on Magic Eden and Tensor. The market sets the price." },
                  { n: "04", title: "Claim the coupons", body: "Fees accrue to whoever holds the NFT. Claim what the pot owes you, whenever you like." },
                ].map((s, i) => (
                  <div className="card how-card" key={s.n} style={{ ["--i" as any]: i }}>
                    <div className="how-n mono">{s.n}</div>
                    <h3 className="how-title">{s.title}</h3>
                    <p className="how-body">{s.body}</p>
                  </div>
                ))}
              </div>
              <div className="how-cta">
                <button className="btn btn-primary" onClick={() => go("tokens")}>Browse tokens</button>
              </div>
            </section>
          )}
        </main>

        <footer className="site-foot">
          <BrandMark size={20} radius={5} />
          <span className="mono">{BRAND.word} · {BRAND.tagline}</span>
        </footer>
      </div>

      {/* ===== Mint modal ===== */}
      {modalOpen && selectedToken && (
        <div className="modal-scrim" onClick={() => { if (!minting) setModalOpen(false); }}>
          <div className="modal card" onClick={(e) => e.stopPropagation()}>
            {mintedAsset ? (
              <div className="modal-done">
                <div className="done-check"><IconCheck size={26} /></div>
                <h3 className="modal-title">{mintedQty > 1 ? `${mintedQty} NFTs minted` : "NFT minted"}</h3>
                <p className="modal-sub">
                  Your ${selectedToken.ticker} Fee Right NFT{mintedQty > 1 ? "s are" : " is"} in your wallet.
                  Coupons start accruing now — list on Magic Eden whenever you want.
                </p>
                <a className="mono" href={`https://explorer.solana.com/address/${mintedAsset}?cluster=devnet`}
                  target="_blank" rel="noreferrer"
                  style={{ display: "block", color: "var(--accent-ink)", fontSize: 12, margin: "0 0 18px", wordBreak: "break-all", textDecoration: "none" }}>
                  {mintedAsset} →
                </a>
                <button className="btn btn-primary btn-block" onClick={() => setModalOpen(false)}>Done</button>
              </div>
            ) : (
              <>
                <div className="modal-head">
                  <TokenAvatar src={selectedToken.image_url} size={40} radius={10} accent={!!selectedToken.candy_machine_address} />
                  <div>
                    <div className="mono modal-ticker">${selectedToken.ticker}</div>
                    <div className="modal-sub mono">Fee Right NFT · 1% of fees</div>
                  </div>
                </div>
                <h3 className="modal-title">Mint Fee Right NFTs</h3>
                <div className="modal-line mono">
                  <span>Quantity</span>
                  <span className="qty">
                    <button type="button" className="qty-btn" disabled={minting || mintQty <= 1} onClick={() => setMintQty((q) => Math.max(1, q - 1))}>−</button>
                    <span className="qty-val">{mintQty}</span>
                    <button type="button" className="qty-btn" disabled={minting || mintQty >= maxQty} onClick={() => setMintQty((q) => Math.min(maxQty, q + 1))}>+</button>
                  </span>
                </div>
                <div className="modal-line mono"><span>Mint price</span><span>{mintQty} × {fmtSol(MINT_PRICE)} {SOL}</span></div>
                <div className="modal-line modal-line-total mono"><span>Total</span><span>{fmtSol((MINT_PRICE + 0.00005) * mintQty, 5)} {SOL}</span></div>
                <p className="buy-note">Each NFT earns 1% of ${selectedToken.ticker} fees, paid to whoever holds it. {mintQty > 1 ? "All mints go to your wallet in one approval." : "Resale happens on Solana NFT marketplaces."}</p>
                {minting && mintStatus && <p className="modal-status">{mintStatus}</p>}
                {mintError && <p className="modal-error">{mintError}</p>}
                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={minting}>Cancel</button>
                  <button className="btn btn-accent" onClick={handleMint} disabled={minting}>
                    {minting ? "Minting…" : connected ? `Confirm & mint${mintQty > 1 ? ` ×${mintQty}` : ""}` : "Connect & mint"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
