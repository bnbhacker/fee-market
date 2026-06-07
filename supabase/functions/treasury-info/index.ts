// Шаг 1.5.1 — проверка связи с Solana.
// Загружает ключ казны из секрета, подключается к devnet и возвращает
// адрес казны + баланс SOL. Это контрольная точка перед тяжёлыми шагами.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { LAMPORTS_PER_SOL } from "npm:@solana/web3.js@1.98.4";
import { loadTreasuryKeypair, getConnection } from "../_shared/solana.ts";

Deno.serve(async () => {
  try {
    const keypair = loadTreasuryKeypair();
    const connection = getConnection();
    const lamports = await connection.getBalance(keypair.publicKey);

    const data = {
      treasury: keypair.publicKey.toBase58(),
      balanceSol: lamports / LAMPORTS_PER_SOL,
      rpc: Deno.env.get("RPC_URL") ? "custom (RPC_URL secret)" : "public devnet",
    };

    return new Response(JSON.stringify(data, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    // Возвращаем понятную ошибку (например, если секрет не задан или ключ кривой).
    return new Response(JSON.stringify({ error: String(e) }, null, 2), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
