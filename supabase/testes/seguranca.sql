-- Testes do schema.sql num PostgreSQL comum, com imitações do Supabase
-- (ver supabase/testes/imitacao_supabase.sql). Cada bloco falha com erro se a
-- regra não valer. Rodar: psql -v ON_ERROR_STOP=1 -f imitacao_supabase.sql
--                        -f ../schema.sql -f seguranca.sql
\set a '''11111111-1111-1111-1111-111111111111'''
\set b '''22222222-2222-2222-2222-222222222222'''
insert into auth.users values (:a, 'a@exemplo.invalid'), (:b, 'b@exemplo.invalid');

create or replace function pg_temp.como(usuario text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false);
end $$;

-- A cria o próprio perfil tentando forjar a data do aceite: o servidor ignora.
select pg_temp.como(:a);
set role authenticated;
insert into public.perfis (id, vinculo, maior_de_idade, termos_versao, termos_aceitos_em,
                           pesquisa_consentida, pesquisa_versao)
  values (:a, 'docente', true, 'v1', '2000-01-01', true, 'v1');
do $$ begin
  if (select termos_aceitos_em < now() - interval '1 minute' from public.perfis) then
    raise exception 'FALHOU: data de aceite forjada pelo cliente foi aceita';
  end if;
  if (select count(*) from public.consentimentos) <> 2 then
    raise exception 'FALHOU: histórico deveria ter termos + pesquisa';
  end if;
end $$;

-- A não cria perfil em nome de B.
do $$ begin
  insert into public.perfis (id, vinculo, maior_de_idade, termos_versao)
    values ('22222222-2222-2222-2222-222222222222', 'docente', true, 'v1');
  raise exception 'FALHOU: A criou perfil para B';
exception when insufficient_privilege then null;
end $$;

-- A não escreve no histórico de consentimentos.
do $$ begin
  insert into public.consentimentos (usuario, finalidade, concedido, versao)
    values ('11111111-1111-1111-1111-111111111111', 'pesquisa', true, 'v1');
  raise exception 'FALHOU: cliente escreveu no histórico';
exception when insufficient_privilege then null;
end $$;

-- Menor de idade (ou sem declarar) não cria conta.
reset role; select pg_temp.como(:b); set role authenticated;
do $$ begin
  insert into public.perfis (id, vinculo, maior_de_idade, termos_versao)
    values ('22222222-2222-2222-2222-222222222222', 'docente', false, 'v1');
  raise exception 'FALHOU: aceitou maior_de_idade = false';
exception when check_violation then null;
end $$;
insert into public.perfis (id, vinculo, maior_de_idade, termos_versao)
  values (:b, 'estudante-graduacao', true, 'v1');

-- B salva favoritos no próprio perfil; o limite de 500 vale.
update public.perfis set favoritos = array['abc123'] where id = :b;
do $$ begin
  update public.perfis set favoritos = array_fill('x'::text, array[501])
    where id = '22222222-2222-2222-2222-222222222222';
  raise exception 'FALHOU: aceitou mais de 500 favoritos';
exception when check_violation then null;
end $$;

-- B só enxerga a si mesmo, e não altera A.
do $$ begin
  if (select count(*) from public.perfis) <> 1 then raise exception 'FALHOU: B vê outros perfis'; end if;
  if (select count(*) from public.consentimentos) <> 1 then raise exception 'FALHOU: B vê consentimentos de outros'; end if;
  update public.perfis set nome = 'invasor' where id = '11111111-1111-1111-1111-111111111111';
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.perfis where nome = 'invasor') then
    raise exception 'FALHOU: B alterou A';
  end if;
end $$;

-- Visitante sem login não lê nada nem acessa a visão de pesquisa.
select pg_temp.como(null); set role anon;
do $$ begin
  perform 1 from public.perfis;
  raise exception 'FALHOU: anônimo leu perfis';
exception when insufficient_privilege then null;
end $$;
reset role; select pg_temp.como(:a); set role authenticated;
do $$ begin
  perform 1 from pesquisa.perfis_sem_identificacao;
  raise exception 'FALHOU: usuário comum leu a visão de pesquisa';
exception when insufficient_privilege then null;
end $$;

-- A revoga o consentimento de pesquisa: some da visão e fica no histórico.
update public.perfis set pesquisa_consentida = false where id = :a;
reset role;
do $$ begin
  if (select count(*) from pesquisa.perfis_sem_identificacao) <> 0 then
    raise exception 'FALHOU: revogação não tirou A da pesquisa';
  end if;
  if (select count(*) from public.consentimentos
      where usuario = '11111111-1111-1111-1111-111111111111' and finalidade = 'pesquisa') <> 2 then
    raise exception 'FALHOU: revogação não ficou no histórico';
  end if;
end $$;

-- A exclui a própria conta: some tudo de A; B continua.
select pg_temp.como(:a); set role authenticated;
select public.excluir_minha_conta();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111')
     or exists (select 1 from public.perfis where id = '11111111-1111-1111-1111-111111111111')
     or exists (select 1 from public.consentimentos where usuario = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FALHOU: exclusão deixou dados de A';
  end if;
  if not exists (select 1 from public.perfis where id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FALHOU: exclusão de A apagou B';
  end if;
end $$;

-- Sem sessão, excluir_minha_conta não apaga ninguém.
select pg_temp.como(null); set role anon;
do $$ begin
  perform public.excluir_minha_conta();
  raise exception 'FALHOU: anônimo executou excluir_minha_conta';
exception when insufficient_privilege then null;
end $$;
reset role;
\echo 'TODOS OS TESTES DE SEGURANCA PASSARAM'
