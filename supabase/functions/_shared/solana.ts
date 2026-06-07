// Общие хелперы для работы с Solana в Edge Functions.
// Используются всеми функциями SolDrop (treasury-info, создание коллекции и т.д.).
import { Connection, Keypair } from "npm:@solana/web3.js@1.98.4";
import bs58 from "npm:bs58@6.0.0";

/**
 * Загружает кейпару казны из секрета TREASURY_PRIVATE_KEY.
 * Ключ ожидается в формате base58 (как экспортирует Phantom).
 * Секрет живёт ТОЛЬКО на сервере Supabase — никогда во фронтенде.
 */
export function loadTreasuryKeypair(): Keypair {
  const secret = Deno.env.get("TREASURY_PRIVATE_KEY");
  if (!secret) {
    throw new Error("Секрет TREASURY_PRIVATE_KEY не задан на сервере Supabase");
  }
  const decoded = bs58.decode(secret.trim());
  return Keypair.fromSecretKey(decoded);
}

/**
 * Подключение к Solana. Берёт RPC из секрета RPC_URL,
 * иначе — публичный devnet (для тестов этого достаточно).
 */
export function getConnection(): Connection {
  const rpc = Deno.env.get("RPC_URL") || "https://api.devnet.solana.com";
  return new Connection(rpc, "confirmed");
}
