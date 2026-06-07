-- Шаг 1.6.1 — поля для привязки NFT-коллекции к токену.
-- collection_address     — адрес Metaplex Core коллекции (родитель 100 NFT)
-- candy_machine_address  — адрес Candy Machine, из которой идёт минт
-- Оба заполняются при запуске токена (после создания коллекции/Candy Machine).
-- IF NOT EXISTS — миграцию можно безопасно применить повторно.

alter table public.tokens
  add column if not exists collection_address text;

alter table public.tokens
  add column if not exists candy_machine_address text;
