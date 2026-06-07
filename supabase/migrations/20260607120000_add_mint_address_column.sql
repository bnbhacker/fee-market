-- Адрес mint созданного SPL-токена. Без этой колонки insert при создании токена падал
-- (код раньше молча проглатывал ошибку → токен не сохранялся в БД).
alter table public.tokens
  add column if not exists mint_address text;
