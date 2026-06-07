import { createRoot } from "react-dom/client";
import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import App from "./App";
import "./index.css";
import "./rake.css";
import { RPC_URL } from "./config";

function Root() {
  const endpoint = useMemo(() => RPC_URL, []);
  // Phantom + Solflare заданы явно; Backpack и другие Standard-кошельки
  // wallet-adapter добавит автоматически, если они установлены в браузере.
  const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <App />
      </WalletProvider>
    </ConnectionProvider>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
