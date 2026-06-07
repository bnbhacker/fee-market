-- Поле website токена (ссылка на сайт). Подставляется при создании токена;
-- если пользователь оставил поле пустым — туда пишется адрес fee market.
alter table public.tokens
  add column if not exists website text;
