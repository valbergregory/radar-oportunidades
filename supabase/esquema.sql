-- Radar de Oportunidades: contas opcionais (Supabase Auth + Postgres).
-- Cole tudo no SQL Editor do projeto e clique em Run. Pode rodar de novo depois
-- de atualizações: o script é idempotente e não apaga dados.
--
-- LGPD, em resumo:
--   * minimização: só o e-mail é obrigatório (a senha fica no Supabase Auth);
--   * cada pessoa só lê e altera as próprias linhas (Row Level Security);
--   * o papel anon (visitante sem login) não lê nada; só chama pulso();
--   * aceite dos termos, newsletter e pesquisa são separados e datados pelo
--     servidor, com histórico;
--   * excluir_minha_conta() apaga a conta e, em cascata, perfil, favoritos e
--     histórico, na hora.

-- ---------------------------------------------------------------- tabelas
create table if not exists public.perfis (
  id               uuid primary key references auth.users (id) on delete cascade,
  nome_exibicao    text check (char_length(nome_exibicao) <= 80),
  vinculo          text check (vinculo in (
                     'estudante-graduacao', 'estudante-pos', 'estudante-medio-tecnico',
                     'docente', 'tecnico-administrativo', 'pesquisador', 'egresso',
                     'comunidade', 'outro')),
  curso_area       text check (char_length(curso_area) <= 120),
  areas            text[] not null default '{}' check (cardinality(areas) <= 50),
  tipos            text[] not null default '{}' check (cardinality(tipos) <= 20),
  frequencia       text not null default 'semanal' check (frequencia in ('diario', 'semanal', 'urgentes')),
  canais           text[] not null default '{}' check (canais <@ array['email', 'calendario']::text[]),
  quer_newsletter  boolean not null default false,
  newsletter_em    timestamptz,  -- quando autorizou newsletter e alertas (nulo se não autorizou)
  aceita_pesquisa  boolean not null default false,
  pesquisa_em      timestamptz,  -- quando autorizou uso em estudos (nulo se não autorizou)
  termos_versao    text check (char_length(termos_versao) <= 20),
  consentimento_em timestamptz,  -- quando aceitou os Termos e a Política (versão acima)
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now()
);

create table if not exists public.favoritos (
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_id    text not null check (item_id ~ '^[0-9a-f]{16}$'),
  criado_em  timestamptz not null default now(),
  primary key (usuario_id, item_id)
);

-- Histórico de aceites e retiradas: só o servidor escreve (gatilhos abaixo).
create table if not exists public.consentimentos (
  id            bigint generated always as identity primary key,
  usuario_id    uuid not null references auth.users (id) on delete cascade,
  finalidade    text not null check (finalidade in ('termos', 'newsletter', 'pesquisa')),
  concedido     boolean not null,
  versao        text,
  registrado_em timestamptz not null default now()
);
create index if not exists consentimentos_usuario on public.consentimentos (usuario_id);

-- ------------------------------------------------ datas definidas no servidor
create or replace function public.perfis_registrar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  antigo_termos text; antigo_news boolean; antigo_pesq boolean;
begin
  new.atualizado_em := now();
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.criado_em := old.criado_em;
    antigo_termos := old.termos_versao; antigo_news := old.quer_newsletter; antigo_pesq := old.aceita_pesquisa;
    new.consentimento_em := old.consentimento_em;
    new.newsletter_em := old.newsletter_em;
    new.pesquisa_em := old.pesquisa_em;
  else
    new.criado_em := now();
    new.consentimento_em := null; new.newsletter_em := null; new.pesquisa_em := null;
    antigo_news := false; antigo_pesq := false;
  end if;
  if new.termos_versao is not null and new.termos_versao is distinct from antigo_termos then
    new.consentimento_em := now();
    insert into public.consentimentos (usuario_id, finalidade, concedido, versao)
      values (new.id, 'termos', true, new.termos_versao);
  end if;
  if new.quer_newsletter is distinct from antigo_news then
    new.newsletter_em := case when new.quer_newsletter then now() end;
    insert into public.consentimentos (usuario_id, finalidade, concedido, versao)
      values (new.id, 'newsletter', new.quer_newsletter, new.termos_versao);
  end if;
  if new.aceita_pesquisa is distinct from antigo_pesq then
    new.pesquisa_em := case when new.aceita_pesquisa then now() end;
    insert into public.consentimentos (usuario_id, finalidade, concedido, versao)
      values (new.id, 'pesquisa', new.aceita_pesquisa, new.termos_versao);
  end if;
  return new;
end $$;

drop trigger if exists perfis_registrar on public.perfis;
create trigger perfis_registrar before insert or update on public.perfis
  for each row execute function public.perfis_registrar();

-- ------------------------------------- perfil criado junto com o usuário
-- O cadastro envia os campos opcionais em options.data (metadados). Aqui eles
-- são conferidos, copiados para perfis e APAGADOS dos metadados, para não
-- circularem no token de acesso.
create or replace function public.criar_perfil_do_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  vinculos text[] := array['estudante-graduacao', 'estudante-pos', 'estudante-medio-tecnico', 'docente',
                           'tecnico-administrativo', 'pesquisador', 'egresso', 'comunidade', 'outro'];
  chaves text[] := array['nome_exibicao', 'vinculo', 'curso_area', 'areas', 'tipos',
                         'quer_newsletter', 'aceita_pesquisa', 'termos_versao'];
begin
  insert into public.perfis (id, nome_exibicao, vinculo, curso_area, areas, tipos,
                             quer_newsletter, aceita_pesquisa, termos_versao)
  values (
    new.id,
    left(nullif(btrim(m ->> 'nome_exibicao'), ''), 80),
    case when (m ->> 'vinculo') = any (vinculos) then m ->> 'vinculo' end,
    left(nullif(btrim(m ->> 'curso_area'), ''), 120),
    coalesce((select array_agg(left(x, 60)) from (
      select jsonb_array_elements_text(case when jsonb_typeof(m -> 'areas') = 'array'
                                            then m -> 'areas' else '[]'::jsonb end) x limit 50) a), '{}'),
    coalesce((select array_agg(left(x, 60)) from (
      select jsonb_array_elements_text(case when jsonb_typeof(m -> 'tipos') = 'array'
                                            then m -> 'tipos' else '[]'::jsonb end) x limit 20) t), '{}'),
    coalesce((m ->> 'quer_newsletter') = 'true', false),
    coalesce((m ->> 'aceita_pesquisa') = 'true', false),
    left(nullif(m ->> 'termos_versao', ''), 20)
  )
  on conflict (id) do nothing;
  update auth.users set raw_user_meta_data = raw_user_meta_data - chaves where id = new.id;
  return new;
end $$;

drop trigger if exists criar_perfil_do_usuario on auth.users;
create trigger criar_perfil_do_usuario after insert on auth.users
  for each row execute function public.criar_perfil_do_usuario();

-- Até 500 favoritos por pessoa.
create or replace function public.favoritos_limite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.favoritos where usuario_id = new.usuario_id) >= 500 then
    raise exception 'limite de 500 favoritos' using errcode = 'check_violation';
  end if;
  return new;
end $$;
drop trigger if exists favoritos_limite on public.favoritos;
create trigger favoritos_limite before insert on public.favoritos
  for each row execute function public.favoritos_limite();

-- ------------------------------------------------------ Row Level Security
alter table public.perfis enable row level security;
alter table public.favoritos enable row level security;
alter table public.consentimentos enable row level security;

drop policy if exists "perfil: ler o proprio" on public.perfis;
drop policy if exists "perfil: criar o proprio" on public.perfis;
drop policy if exists "perfil: alterar o proprio" on public.perfis;
drop policy if exists "favoritos: ler os proprios" on public.favoritos;
drop policy if exists "favoritos: criar os proprios" on public.favoritos;
drop policy if exists "favoritos: apagar os proprios" on public.favoritos;
drop policy if exists "consentimentos: ler os proprios" on public.consentimentos;

create policy "perfil: ler o proprio" on public.perfis for select to authenticated
  using (id = (select auth.uid()));
create policy "perfil: criar o proprio" on public.perfis for insert to authenticated
  with check (id = (select auth.uid()));
create policy "perfil: alterar o proprio" on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "favoritos: ler os proprios" on public.favoritos for select to authenticated
  using (usuario_id = (select auth.uid()));
create policy "favoritos: criar os proprios" on public.favoritos for insert to authenticated
  with check (usuario_id = (select auth.uid()));
create policy "favoritos: apagar os proprios" on public.favoritos for delete to authenticated
  using (usuario_id = (select auth.uid()));
create policy "consentimentos: ler os proprios" on public.consentimentos for select to authenticated
  using (usuario_id = (select auth.uid()));

-- ------------------------------------------------------------- funções
-- Excluir a própria conta (LGPD, art. 18, VI): apaga o usuário autenticado; perfil,
-- favoritos e histórico vão junto (on delete cascade).
create or replace function public.excluir_minha_conta()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sem sessão' using errcode = 'insufficient_privilege';
  end if;
  delete from auth.users where id = auth.uid();
end $$;

-- Chamada diária pelo GitHub Actions para o projeto gratuito não ser pausado.
create or replace function public.pulso()
returns integer language sql stable set search_path = '' as $$ select 1 $$;

-- --------------------------------------------------------- privilégios
-- Por padrão o Supabase concede tudo em public a anon e authenticated. Aqui só
-- fica o necessário: anon chama pulso(); authenticated usa as próprias linhas.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

grant select, insert, update on public.perfis to authenticated;
grant select, insert, delete on public.favoritos to authenticated;
grant select on public.consentimentos to authenticated;
grant execute on function public.excluir_minha_conta() to authenticated;
grant execute on function public.pulso() to anon, authenticated;

-- --------------------------------------------------------- para os estudos
-- Só quem autorizou (aceita_pesquisa), sem nome, e-mail nem identificador.
-- Esquema não exposto pela API: consulte pelo SQL Editor. Ao publicar, mostre só
-- agregados (curso + vínculo podem identificar alguém em grupos pequenos).
create schema if not exists pesquisa;
revoke all on schema pesquisa from public, anon, authenticated;
create or replace view pesquisa.perfis_sem_identificacao as
  select vinculo, curso_area, areas, tipos, frequencia, canais,
         date_trunc('month', criado_em)::date as mes_cadastro
  from public.perfis
  where aceita_pesquisa;
revoke all on pesquisa.perfis_sem_identificacao from public, anon, authenticated;
