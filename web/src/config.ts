import { clusterApiUrl, type Cluster } from "@solana/web3.js";

// Сеть берётся из .env (VITE_SOLANA_NETWORK), по умолчанию devnet.
export const NETWORK = (import.meta.env.VITE_SOLANA_NETWORK || "devnet") as Cluster;

// RPC: если задан кастомный VITE_RPC_URL (Helius) — используем его,
// иначе публичный эндпоинт выбранной сети.
export const RPC_URL =
  import.meta.env.VITE_RPC_URL && import.meta.env.VITE_RPC_URL.trim() !== ""
    ? import.meta.env.VITE_RPC_URL
    : clusterApiUrl(NETWORK);

// Адрес кошелька-казны SolDrop (получатель creator fees, источник выплат).
export const TREASURY_ADDRESS = import.meta.env.VITE_TREASURY_ADDRESS || "";

// Supabase
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
