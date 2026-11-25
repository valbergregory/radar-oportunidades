-- Testes do esquema.sql num PostgreSQL comum, com a imitação do Supabase.
-- Cada bloco termina com erro se a regra não valer. Rodar (num banco vazio):
--   psql -v ON_ERROR_STOP=1 -f imitacao_supabase.sql -f ../esquema.sql -f seguranca.sql
\set a '''11111111-1111-1111-1111-111111111111'''
\set b '''22222222-2222-2222-2222-222222222222'''
create or replace function pg_temp.como(usuario text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(usuario, ''), false); end $$;

-- Cadastro: o gatilho cria o perfil a partir dos metadados, conferindo tudo,
-- e apaga esses metadados do usuário.
insert into auth.users values (:a, 'a@exemplo.invalid', jsonb_build_object(
  'nome_exibicao', 'Ana', 'vinculo', 'docente', 'curso_area', repeat('x', 300),
  'areas', jsonb_build_array('economia', 'direito'), 'tipos', 'nao-e-lista',
  'quer_newsletter', true, 'termos_versao', 'v1', 'provider_extra', 'fica'));
insert into auth.users values (:b, 'b@exemplo.invalid', jsonb_build_object('vinculo', 'invasor'));
do $$ declare p record; begin
  select * into p from public.perfis where id = '11111111-1111-1111-1111-111111111111';
  if p.nome_exibicao <> 'Ana' or p.vinculo <> 'docente' or char_length(p.curso_area) <> 120
     or p.areas <> array['economia', 'direito'] or p.tipos <> '{}' or not p.quer_newsletter
     or p.newsletter_em is null or p.consentimento_em is null or p.termos_versao <> 'v1' then
    raise exception 'FALHOU: perfil criado errado: %', row_to_json(p);
  end if;
  if (select vinculo from public.perfis where id = '22222222-2222-2222-2222-222222222222') is not null then
    raise exception 'FALHOU: vínculo inválido foi aceito';
  end if;
  if (select raw_user_meta_data from auth.users where id = '11111111-1111-1111-1111-111111111111')
     <> '{"provider_extra": "fica"}'::jsonb then
    raise exception 'FALHOU: metadados do cadastro não foram apagados';
  end if;
  if (select count(*) from public.consentimentos where usuario_id = '11111111-1111-1111-1111-111111111111') <> 2 then
    raise exception 'FALHOU: histórico deveria ter termos + newsletter';
  end if;
end $$;

-- Visitante (anon) não lê nada, mas chama pulso().
select pg_temp.como(null); set role anon;
do $$ begin perform 1 from public.perfis; raise exception 'FALHOU: anon leu perfis';
exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from public.favoritos; raise exception 'FALHOU: anon leu favoritos';
exception when insufficient_privilege then null; end $$;
do $$ begin perform 1 from public.consentimentos; raise exception 'FALHOU: anon leu consentimentos';
exception when insufficient_privilege then null; end $$;
do $$ begin perform public.excluir_minha_conta(); raise exception 'FALHOU: anon executou excluir_minha_conta';
exception when insufficient_privilege then null; end $$;
do $$ begin if public.pulso() <> 1 then raise exception 'FALHOU: pulso'; end if; end $$;
reset role;

-- A altera o próprio perfil; não consegue forjar datas nem tocar em B.
select pg_temp.como(:a); set role authenticated;
update public.perfis set frequencia = 'diario', canais = array['email', 'calendario'],
       consentimento_em = '2000-01-01', criado_em = '2000-01-01' where id = :a;
do $$ begin
  if (select count(*) from public.perfis) <> 1 then raise exception 'FALHOU: A vê outros perfis'; end if;
  if (select consentimento_em < now() - interval '1 minute' or criado_em < now() - interval '1 minute'
      from public.perfis) then raise exception 'FALHOU: datas forjadas foram aceitas'; end if;
  update public.perfis set nome_exibicao = 'invasor' where id = '22222222-2222-2222-2222-222222222222';
end $$;
do $$ begin
  update public.perfis set canais = array['telegram'] where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FALHOU: canal inválido aceito';
exception when check_violation then null; end $$;
do $$ begin
  update public.perfis set frequencia = 'horaria' where id = '11111111-1111-1111-1111-111111111111';
  raise exception 'FALHOU: frequência inválida aceita';
exception when check_violation then null; end $$;

-- Newsletter: retirar zera a data e fica no histórico.
update public.perfis set quer_newsletter = false where id = :a;
do $$ begin
  if (select newsletter_em from public.perfis) is not null then raise exception 'FALHOU: newsletter_em não zerou'; end if;
  if (select count(*) from public.consentimentos where finalidade = 'newsletter') <> 2 then
    raise exception 'FALHOU: retirada não ficou no histórico'; end if;
end $$;

-- Favoritos: A cria e apaga os próprios; não cria para B; id precisa ter formato.
insert into public.favoritos (item_id) values ('c931541578c0f7f4'), ('0123456789abcdef');
delete from public.favoritos where item_id = '0123456789abcdef';
do $$ begin
  insert into public.favoritos (usuario_id, item_id) values ('22222222-2222-2222-2222-222222222222', 'c931541578c0f7f4');
  raise exception 'FALHOU: A criou favorito para B';
exception when insufficient_privilege then null; end $$;
do $$ begin
  insert into public.favoritos (item_id) values ('<script>');
  raise exception 'FALHOU: item_id inválido aceito';
exception when check_violation then null; end $$;
do $$ begin
  insert into public.consentimentos (usuario_id, finalidade, concedido) values (auth.uid(), 'termos', true);
  raise exception 'FALHOU: cliente escreveu no histórico';
exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin
  if exists (select 1 from public.perfis where nome_exibicao = 'invasor') then raise exception 'FALHOU: A alterou B'; end if;
  if (select count(*) from public.favoritos) <> 1 then raise exception 'FALHOU: favoritos de A'; end if;
end $$;

-- B não vê os favoritos de A; limite de 500 favoritos.
select pg_temp.como(:b); set role authenticated;
do $$ begin if (select count(*) from public.favoritos) <> 0 then raise exception 'FALHOU: B vê favoritos de A'; end if; end $$;
insert into public.favoritos (item_id) select lpad(to_hex(g), 16, '0') from generate_series(1, 500) g;
do $$ begin
  insert into public.favoritos (item_id) values ('ffffffffffffffff');
  raise exception 'FALHOU: aceitou o 501º favorito';
exception when check_violation then null; end $$;
reset role;

-- Visão de pesquisa: usuário comum não lê; só aparece quem autorizou.
select pg_temp.como(:a); set role authenticated;
do $$ begin perform 1 from pesquisa.perfis_sem_identificacao; raise exception 'FALHOU: usuário leu a pesquisa';
exception when insufficient_privilege then null; end $$;
update public.perfis set aceita_pesquisa = true where id = :a;
reset role;
do $$ begin
  if (select count(*) from pesquisa.perfis_sem_identificacao) <> 1 then raise exception 'FALHOU: visão de pesquisa'; end if;
end $$;

-- A exclui a própria conta: some tudo de A, na hora; B continua.
select pg_temp.como(:a); set role authenticated;
select public.excluir_minha_conta();
reset role;
do $$ begin
  if exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111')
     or exists (select 1 from public.perfis where id = '11111111-1111-1111-1111-111111111111')
     or exists (select 1 from public.favoritos where usuario_id = '11111111-1111-1111-1111-111111111111')
     or exists (select 1 from public.consentimentos where usuario_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FALHOU: exclusão deixou dados de A';
  end if;
  if (select count(*) from public.favoritos) <> 500 then raise exception 'FALHOU: exclusão de A apagou B'; end if;
end $$;
\echo 'TODOS OS TESTES DE SEGURANCA PASSARAM'
