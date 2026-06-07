// Шаг 1.5.3 — создание Metaplex Core коллекции (родитель для 100 NFT).
//
// СЕРВЕРНАЯ операция: подпись ключом казны (TREASURY_PRIVATE_KEY) → только здесь,
// никогда во фронтенде. НУЖНЫ SOL на казне (аренда аккаунта коллекции + комиссия сети).
// Без средств функция дойдёт до отправки транзакции и упадёт на "insufficient funds" —
// это нормально и доказывает, что весь стек Umi/mpl-core в Deno собрался и работает.
//
// Метаданные коллекции (collection.json) уже лежат в Storage после шага 1.5.2.
//
// Вызов (POST): { "token": "DEMO" }  (collectionUri можно передать явно, иначе берём из Storage)
// Ответ: адрес коллекции + сигнатура транзакции.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createUmi } from "npm:@metaplex-foundation/umi-bundle-defaults@0.9.2";
import { generateSigner, keypairIdentity } from "npm:@metaplex-foundation/umi@0.9.2";
import { createCollection, mplCore } from "npm:@metaplex-foundation/mpl-core@1.1.1";
import bs58 from "npm:bs58@6.0.0";

const BUCKET = "nft-assets";

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
    const { token, collectionUri } = await req.json().catch(() => ({}));
    if (!token) {
      return json({ error: 'Нужно тело { "token": "DEMO" }' }, 400);
    }

    const secret = Deno.env.get("TREASURY_PRIVATE_KEY");
    if (!secret) {
      return json({ error: "Секрет TREASURY_PRIVATE_KEY не задан на сервере" }, 500);
    }

    // RPC: берём из секрета RPC_URL, иначе публичный devnet (как в treasury-info).
    const rpc = Deno.env.get("RPC_URL") || "https://api.devnet.solana.com";

    // Umi + плагин mpl-core. Личность (подписант) — ключ казны из секрета (base58, как у Phantom).
    const umi = createUmi(rpc).use(mplCore());
    const treasury = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secret.trim()));
    umi.use(keypairIdentity(treasury));

    // URI метаданных коллекции: по умолчанию — файл из Storage (шаг 1.5.2).
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const uri =
      collectionUri ||
      `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${token}/collection.json`;

    // Адрес новой коллекции (свежая кейпара — это и есть адрес on-chain объекта).
    const collectionSigner = generateSigner(umi);

    const { signature } = await createCollection(umi, {
      collection: collectionSigner,
      name: `${token} Fee Rights`, // имя коллекции по конвенции проекта
      uri,
    }).sendAndConfirm(umi);

    return json({
      ok: true,
      token,
      collectionAddress: collectionSigner.publicKey.toString(),
      uri,
      signature: bs58.encode(signature),
      treasury: treasury.publicKey.toString(),
      explorer: `https://explorer.solana.com/address/${collectionSigner.publicKey.toString()}?cluster=devnet`,
    });
  } catch (e) {
    // Понятная ошибка (например, "insufficient funds" — значит казну надо пополнить).
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});
