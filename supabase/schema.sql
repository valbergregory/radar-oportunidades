-- Radar de Oportunidades: cadastro opcional (Supabase / PostgreSQL).
-- Rode uma vez no SQL Editor do projeto Supabase. Pode rodar de novo: é idempotente.
--
-- Princípios (LGPD):
--   * minimização: só o necessário para o serviço e para os estudos; nenhum dado
--     sensível (art. 5º, II e art. 11);
--   * cada pessoa só lê e altera os próprios dados (Row Level Security);
--   * consentimentos separados e com histórico: termos de uso (obrigatório para
--     ter conta) e uso em pesquisa (opcional, revogável a qualquer momento);
--   * datas de consentimento gravadas pelo servidor, não pelo navegador;
--   * a própria pessoa exclui a conta e tudo o que está ligado a ela.

create table if not exists public.perfis (
  id                   uuid primary key references auth.users (id) on delete cascade,
  nome                 text check (char_length(nome) <= 120),
  vinculo              text not null check (vinculo in (
                         'estudante-graduacao', 'estudante-pos', 'estudante-medio-tecnico',
                         'docente', 'tecnico-administrativo', 'pesquisador', 'egresso',
                         'comunidade', 'outro')),
  curso_area           text check (char_length(curso_area) <= 120),
  instituicao          text check (char_length(instituicao) <= 120),
  municipio            text check (char_length(municipio) <= 80),
  uf                   text check (uf ~ '^[A-Z]{2}$'),
  areas_interesse      text[] not null default '{}' check (cardinality(areas_interesse) <= 50),
  tipos_interesse      text[] not null default '{}' check (cardinality(tipos_interesse) <= 20),
  maior_de_idade       boolean not null check (maior_de_idade),
  termos_versao        text not null check (char_length(termos_versao) <= 20),
  termos_aceitos_em    timestamptz not null default now(),
  pesquisa_consentida  boolean not null default false,
  pesquisa_versao      text check (char_length(pesquisa_versao) <= 20),
  pesquisa_alterada_em timestamptz,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now()
);

-- Oportunidades salvas (ids do Radar). Coluna acrescentada depois: o "add column
-- if not exists" atualiza bancos criados com a versão anterior deste arquivo.
alter table public.perfis add column if not exists favoritos text[] not null default '{}'
  check (cardinality(favoritos) <= 500);

-- Histórico de consentimentos: só o servidor escreve (pelo gatilho abaixo).
create table if not exists public.consentimentos (
  id            bigint generated always as identity primary key,
  usuario       uuid not null references auth.users (id) on delete cascade,
  finalidade    text not null check (finalidade in ('termos', 'pesquisa')),
  concedido     boolean not null,
  versao        text not null,
  registrado_em timestamptz not null default now()
);
create index if not exists consentimentos_usuario on public.consentimentos (usuario);

-- Datas e histórico definidos no servidor.
create or replace function public.perfis_registrar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();
  if tg_op = 'INSERT' then
    new.criado_em := now();
    new.termos_aceitos_em := now();
    insert into public.consentimentos (usuario, finalidade, concedido, versao)
      values (new.id, 'termos', true, new.termos_versao);
    if new.pesquisa_consentida then
      new.pesquisa_alterada_em := now();
      insert into public.consentimentos (usuario, finalidade, concedido, versao)
        values (new.id, 'pesquisa', true, coalesce(new.pesquisa_versao, new.termos_versao));
    end if;
    return new;
  end if;
  new.id := old.id;
  new.criado_em := old.criado_em;
  if new.termos_versao is distinct from old.termos_versao then
    new.termos_aceitos_em := now();
    insert into public.consentimentos (usuario, finalidade, concedido, versao)
      values (new.id, 'termos', true, new.termos_versao);
  else
    new.termos_aceitos_em := old.termos_aceitos_em;
  end if;
  if new.pesquisa_consentida is distinct from old.pesquisa_consentida then
    new.pesquisa_alterada_em := now();
    insert into public.consentimentos (usuario, finalidade, concedido, versao)
      values (new.id, 'pesquisa', new.pesquisa_consentida,
              coalesce(new.pesquisa_versao, new.termos_versao));
  else
    new.pesquisa_alterada_em := old.pesquisa_alterada_em;
  end if;
  return new;
end $$;

drop trigger if exists perfis_registrar on public.perfis;
create trigger perfis_registrar before insert or update on public.perfis
  for each row execute function public.perfis_registrar();

-- Acesso: cada pessoa só enxerga a própria linha.
alter table public.perfis enable row level security;
alter table public.consentimentos enable row level security;

drop policy if exists "perfil proprio: ler" on public.perfis;
drop policy if exists "perfil proprio: criar" on public.perfis;
drop policy if exists "perfil proprio: alterar" on public.perfis;
drop policy if exists "perfil proprio: excluir" on public.perfis;
drop policy if exists "consentimentos proprios: ler" on public.consentimentos;
create policy "perfil proprio: ler" on public.perfis for select to authenticated
  using (id = (select auth.uid()));
create policy "perfil proprio: criar" on public.perfis for insert to authenticated
  with check (id = (select auth.uid()));
create policy "perfil proprio: alterar" on public.perfis for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "perfil proprio: excluir" on public.perfis for delete to authenticated
  using (id = (select auth.uid()));
create policy "consentimentos proprios: ler" on public.consentimentos for select to authenticated
  using (usuario = (select auth.uid()));

revoke all on public.perfis, public.consentimentos from anon, authenticated;
grant select, insert, update, delete on public.perfis to authenticated;
grant select on public.consentimentos to authenticated;

-- Excluir a própria conta (direito de eliminação, art. 18, VI). Apaga o usuário de
-- autenticação; perfil e histórico vão junto (on delete cascade).
create or replace function public.excluir_minha_conta()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'sem sessão';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.excluir_minha_conta() from public, anon;
grant execute on function public.excluir_minha_conta() to authenticated;
revoke all on function public.perfis_registrar() from public, anon, authenticated;

-- Para os estudos: só quem consentiu, sem nome, e-mail nem identificador.
-- Fica num esquema que a API do Supabase não expõe; consulte pelo SQL Editor.
-- Atenção: curso + instituição + município ainda podem identificar alguém em
-- grupos pequenos. Ao publicar resultados, agregue (ex.: grupos de 5 ou mais).
create schema if not exists pesquisa;
revoke all on schema pesquisa from public, anon, authenticated;
create or replace view pesquisa.perfis_sem_identificacao as
  select vinculo, curso_area, instituicao, municipio, uf, areas_interesse,
         tipos_interesse, date_trunc('month', criado_em)::date as mes_cadastro
  from public.perfis
  where pesquisa_consentida;
revoke all on pesquisa.perfis_sem_identificacao from public, anon, authenticated;
