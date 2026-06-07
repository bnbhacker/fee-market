// Генератор метаданных для коллекции из 100 NFT.
// Переиспользуемый: на вход — название токена и URI картинки,
// на выход — 100 JSON-файлов (#1..#100) по правилам проекта.
//
// Запуск:
//   node scripts/generate-metadata.mjs <tokenName> <imageUri> [count] [outDir]
// Пример (тестовый прогон для devnet):
//   node scripts/generate-metadata.mjs DEMO IMAGE_URI_PLACEHOLDER 100 assets/metadata

import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Текст описания — на английском (правило проекта: весь пользовательский текст по-английски).
const DESCRIPTION =
  "SolDrop NFT — a share of the token's trading fees. Holders receive a proportional part of the creator fees.";

export function buildMetadata(tokenName, imageUri, index) {
  return {
    name: `${tokenName} Fee Right #${index}`, // имя по конвенции проекта
    symbol: tokenName,                          // тикер = название токена
    description: DESCRIPTION,
    image: imageUri,
    attributes: [{ trait_type: "Number", value: String(index) }],
    properties: {
      files: [{ uri: imageUri, type: "image/png" }],
      category: "image",
    },
  };
}

export async function generateAll(tokenName, imageUri, count, outDir) {
  await mkdir(outDir, { recursive: true });
  for (let i = 1; i <= count; i++) {
    const meta = buildMetadata(tokenName, imageUri, i);
    await writeFile(join(outDir, `${i}.json`), JSON.stringify(meta, null, 2));
  }
}

// Запуск из командной строки
const isCli = import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCli) {
  const [tokenName, imageUri, count = "100", outDir = "assets/metadata"] =
    process.argv.slice(2);
  if (!tokenName || !imageUri) {
    console.error(
      "Использование: node scripts/generate-metadata.mjs <tokenName> <imageUri> [count] [outDir]",
    );
    process.exit(1);
  }
  await generateAll(tokenName, imageUri, Number(count), outDir);
  console.log(`Создано ${count} файлов метаданных в ${outDir} (токен: ${tokenName})`);
}
