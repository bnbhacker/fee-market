// Шаг 1.5.2 — заливка метаданных NFT в Supabase Storage.
// SOL не нужны: это всего лишь подготовка публичных ссылок, на которые потом
// будет ссылаться Candy Machine (создание коллекции — отдельный шаг 1.5.3+).
//
// Что делает: для заданного токена генерирует collection.json + 100 JSON
// метаданных (#1..#100) по правилам проекта и кладёт их в публичный бакет
// nft-assets под префиксом <token>/. Картинку (общую для всех NFT) заливаем
// один раз заранее вручную в тот же бакет — её публичную ссылку передаём входом.
//
// Вызов (POST):
//   { "token": "DEMO", "imageUrl": "https://.../storage/v1/object/public/nft-assets/image.png" }
// Ответ: базовый URL, ссылка на collection.json и пример ссылки на item.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "nft-assets";

// Описание — на английском (правило проекта: весь пользовательский текст по-английски).
// Тот же текст, что в scripts/generate-metadata.mjs — конвенция именования общая.
const DESCRIPTION =
  "SolDrop NFT — a share of the token's trading fees. Holders receive a proportional part of the creator fees.";

// Метаданные одного NFT (#index). Имя/символ — по конвенции проекта.
function buildItemMetadata(tokenName: string, imageUri: string, index: number) {
  return {
    name: `${tokenName} Fee Right #${index}`,
    symbol: tokenName,
    description: DESCRIPTION,
    image: imageUri,
    attributes: [{ trait_type: "Number", value: String(index) }],
    properties: {
      files: [{ uri: imageUri, type: "image/png" }],
      category: "image",
    },
  };
}

// Метаданные самой коллекции (родительский объект в Metaplex Core).
function buildCollectionMetadata(tokenName: string, imageUri: string) {
  return {
    name: `${tokenName} Fee Rights`,
    symbol: tokenName,
    description: DESCRIPTION,
    image: imageUri,
    properties: {
      files: [{ uri: imageUri, type: "image/png" }],
      category: "image",
    },
  };
}

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

// Заливает один JSON-файл в бакет (upsert: можно перезаписывать при повторном прогоне).
async function uploadJson(
  supabase: ReturnType<typeof createClient>,
  path: string,
  data: unknown,
) {
  const body = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, body, { contentType: "application/json", upsert: true });
  if (error) throw new Error(`upload ${path}: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, imageUrl, count = 100 } = await req.json().catch(() => ({}));
    if (!token || !imageUrl) {
      return json(
        { error: 'Нужно тело { "token": "DEMO", "imageUrl": "https://.../image.png" }' },
        400,
      );
    }

    // Сервисный клиент: SUPABASE_URL и SERVICE_ROLE_KEY Supabase подставляет
    // в Edge Functions автоматически. Service role имеет право писать в Storage.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Бакет должен существовать и быть публичным. Создаём идемпотентно
    // (если уже есть — Supabase вернёт ошибку, её просто игнорируем).
    await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});

    // 1) метаданные коллекции
    await uploadJson(supabase, `${token}/collection.json`, buildCollectionMetadata(token, imageUrl));

    // 2) 100 метаданных предметов — грузим пачками по 20, чтобы не упереться в лимиты.
    const CHUNK = 20;
    for (let start = 1; start <= count; start += CHUNK) {
      const batch: Promise<void>[] = [];
      for (let i = start; i < start + CHUNK && i <= count; i++) {
        batch.push(uploadJson(supabase, `${token}/${i}.json`, buildItemMetadata(token, imageUrl, i)));
      }
      await Promise.all(batch);
    }

    const base = `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${token}`;
    return json({
      ok: true,
      token,
      uploaded: count + 1, // 100 предметов + collection.json
      baseUrl: base,
      collectionUri: `${base}/collection.json`,
      sampleItemUri: `${base}/1.json`,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
