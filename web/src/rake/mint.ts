// mint.ts — работа с Candy Machine из браузера (Umi + mpl-core-candy-machine).
// Чтение счётчика минта (read-only) и минт одного/нескольких NFT кошельком пользователя.
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { generateSigner, publicKey as umiPublicKey, some, transactionBuilder } from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { mplCore } from "@metaplex-foundation/mpl-core";
import { fetchCandyMachine, mintV1, mplCandyMachine } from "@metaplex-foundation/mpl-core-candy-machine";
import { setComputeUnitLimit } from "@metaplex-foundation/mpl-toolbox";
import { RPC_URL } from "../config";

// Базовый Umi (без подписанта) — для чтения и как основа для минта.
function baseUmi() {
  return createUmi(RPC_URL).use(mplCore()).use(mplCandyMachine());
}

// Минимальный набор методов кошелька, который понимает walletAdapterIdentity.
export type MintWallet = {
  publicKey: unknown;
  signTransaction?: unknown;
  signAllTransactions?: unknown;
  signMessage?: unknown;
};

// Сколько NFT уже сминчено (itemsRedeemed) из коллекции. Read-only, SOL не нужен.
export async function fetchMintedCount(candyMachineAddress: string): Promise<number> {
  const umi = baseUmi();
  const cm = await fetchCandyMachine(umi, umiPublicKey(candyMachineAddress));
  return Number(cm.itemsRedeemed);
}

// Минт `count` NFT за один заход. Платит пользователь; 0.01 SOL за каждый уходит
// на `destination` (получатель, заданный в гарде Candy Machine — создатель токена).
// Все транзакции подписываются кошельком разом (одно подтверждение в Phantom).
export async function mintMany(
  wallet: MintWallet,
  candyMachineAddress: string,
  collectionAddress: string,
  destination: string,
  count: number,
): Promise<{ assets: string[] }> {
  const umi = baseUmi().use(walletAdapterIdentity(wallet as any));
  const candyMachine = umiPublicKey(candyMachineAddress);
  const collection = umiPublicKey(collectionAddress);
  const dest = umiPublicKey(destination);

  const latest = await umi.rpc.getLatestBlockhash();
  const assets: ReturnType<typeof generateSigner>[] = [];
  const built = [];

  for (let i = 0; i < count; i++) {
    const asset = generateSigner(umi);
    assets.push(asset);
    let tx = transactionBuilder()
      .add(setComputeUnitLimit(umi, { units: 800_000 }))
      .add(
        mintV1(umi, {
          candyMachine,
          asset,
          collection,
          mintArgs: { solPayment: some({ destination: dest }) },
        }),
      )
      .setBlockhash(latest)
      .build(umi);
    // Кейпара нового NFT подписывает свою транзакцию сама (без попапа).
    tx = await asset.signTransaction(tx);
    built.push(tx);
  }

  // Кошелёк подписывает все транзакции разом — одно подтверждение в Phantom.
  const signed = await umi.identity.signAllTransactions(built);

  // Отправляем и подтверждаем.
  const sigs: Uint8Array[] = [];
  for (const tx of signed) sigs.push(await umi.rpc.sendTransaction(tx));
  await Promise.all(
    sigs.map((sig) =>
      umi.rpc.confirmTransaction(sig, {
        strategy: { type: "blockhash", blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      }),
    ),
  );

  return { assets: assets.map((a) => a.publicKey.toString()) };
}
