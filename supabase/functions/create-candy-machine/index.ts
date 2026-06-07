// Шаг 1.5.4 — создание Candy Machine для коллекции (минт 100 NFT).
//
// СЕРВЕРНАЯ операция: подпись ключом казны. НУЖНЫ SOL на казне (аренда + комиссии).
// Требует уже созданной коллекции (шаг 1.5.3) — её адрес передаётся входом.
//
// Что делает:
//  1) создаёт Candy Machine на 100 предметов с гардом оплаты 0.01 SOL → КАЗНЕ
//     (открытый минт: без вайтлиста, без лимита на кошелёк — по решениям проекта);
//  2) загружает 100 строк конфигурации (#1..#100), ссылаясь на метаданные из Storage.
//
// Минтить будут пользователи с фронта через свой Phantom (отдельный шаг 1.6).
//
// Вызов (POST): { "token": "DEMO", "collection": "<адрес коллекции из create-collection>" }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@0.9.2";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
  some,
  sol,
} from "npm:@metaplex-foundation/umi@0.9.2";
import { mplCore } from "npm:@metaplex-foundation/mpl-core@1.1.1";
import {
  addConfigLines,
  create,
  mplCandyMachine,
} from "npm:@metaplex-foundation/mpl-core-candy-machine@0.3.0";
import bs58 from "npm:bs58@6.0.0";

const BUCKET = "nft-assets";
const ITEMS = 100;
const MINT_PRICE_SOL = 0.01; // цена минта одного NFT
const BATCH = 20; // строк конфигурации за транзакцию (5 транзакций вместо 11 — быстрее)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // creator — кошелёк создателя токена, ему пойдёт оплата минта (0.01 SOL).
    // Если не передан — фолбэк на казну (для обратной совместимости).
    const { token, collection, creator } = await req.json().catch(() => ({}));
    if (!token || !collection) {
      return json(
        { error: 'Нужно тело { "token": "DEMO", "collection": "<адрес коллекции>" }' },
        400,
      );
    }

    const secret = Deno.env.get("TREASURY_PRIVATE_KEY");
    if (!secret) {
      return json({ error: "Секрет TREASURY_PRIVATE_KEY не задан на сервере" }, 500);
    }

    const rpc = Deno.env.get("RPC_URL") || "https://api.devnet.solana.com";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Umi + плагины Core и Core Candy Machine. Подписант — казна.
    const umi = createUmi(rpc).use(mplCore()).use(mplCandyMachine());
    const treasury = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret.trim()));
    umi.use(keypairIdentity(treasury));

    // Получатель оплаты минта: создатель токена (или казна, если creator не задан).
    const payoutDestination = creator ? publicKey(creator) : treasury.publicKey;

    // Префиксы для строк конфигурации: общую часть имени/URI храним один раз,
    // переменная часть в каждой строке — только номер (имя) и "<n>.json" (URI).
    const prefixName = `${token} Fee Right #`;
    const prefixUri = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${token}/`;

    // 1) Создаём Candy Machine + гард оплаты.
    const candyMachine = generateSigner(umi);
    const createBuilder = await create(umi, {
      candyMachine,
      collection: publicKey(collection),
      collectionUpdateAuthority: umi.identity, // казна — апдейт-авторитет коллекции
      itemsAvailable: ITEMS,
      configLineSettings: some({
        prefixName,
        nameLength: 3, // максимум "100"
        prefixUri,
        uriLength: 8, // максимум "100.json"
        isSequential: false, // выдача предметов в случайном порядке
      }),
      guards: {
        // Оплата 0.01 SOL за минт уходит СОЗДАТЕЛЮ токена (его доход с продажи NFT).
        solPayment: some({
          lamports: sol(MINT_PRICE_SOL),
          destination: payoutDestination,
        }),
        // Лимита на кошелёк нет — открытый минт.
      },
    });
    const createResult = await createBuilder.sendAndConfirm(umi);

    // 2) Загружаем 100 строк конфигурации пачками.
    const batches: { index: number; count: number; signature: string }[] = [];
    for (let start = 0; start < ITEMS; start += BATCH) {
      const lines = [];
      for (let i = start; i < start + BATCH && i < ITEMS; i++) {
        const n = i + 1; // предметы нумеруются с 1
        lines.push({ name: String(n), uri: `${n}.json` });
      }
      const r = await addConfigLines(umi, {
        candyMachine: candyMachine.publicKey,
        index: start,
        configLines: lines,
      }).sendAndConfirm(umi);
      batches.push({ index: start, count: lines.length, signature: bs58.encode(r.signature) });
    }

    return json({
      ok: true,
      token,
      collection,
      candyMachine: candyMachine.publicKey.toString(),
      itemsLoaded: ITEMS,
      priceSol: MINT_PRICE_SOL,
      payout: payoutDestination.toString(),
      createSignature: bs58.encode(createResult.signature),
      configBatches: batches,
      explorer: `https://explorer.solana.com/address/${candyMachine.publicKey.toString()}?cluster=devnet`,
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
