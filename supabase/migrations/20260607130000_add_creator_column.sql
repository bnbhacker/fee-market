-- Кошелёк создателя токена. Оплата минта NFT (0.01 SOL) идёт на этот адрес
-- (он же задаётся получателем в гарде Candy Machine при её создании).
alter table public.tokens
  add column if not exists creator text;
