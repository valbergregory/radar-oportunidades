# Contas opcionais (Supabase)

As contas vêm **desligadas**. Enquanto `docs/conta-config.js` estiver vazio, o
site funciona como antes: não aparece "Entrar", a biblioteca do Supabase nem é
baixada e nenhum dado pessoal é coletado.

## O que existe

| Arquivo | Para quê |
|---|---|
| `supabase/esquema.sql` | Tabelas `perfis`, `favoritos` e `consentimentos`; RLS; gatilhos; `excluir_minha_conta()`; `pulso()`; privilégios |
| `docs/conta-config.js` | URL do projeto, chave publicável e controlador (você preenche) |
| `docs/entrar.html`, `cadastro.html`, `personalizar.html`, `conta.html` | Telas de conta |
| `docs/oportunidade.html?id=…` | Detalhe da oportunidade, favoritar e prazo na agenda |
| `docs/privacidade.html`, `docs/termos.html` | Política e termos em linguagem simples |
| `docs/vendor/supabase-js-2.118.0.js` | Biblioteca fixada (ver `docs/vendor/LEIAME.md`) |
| `supabase/testes/` | Testes de segurança do banco (PostgreSQL local) |
| `tests/e2e/contas.test.js` | Teste das telas com o Supabase simulado (Playwright) |

## Passo a passo no painel do Supabase

1. **Criar o projeto.** Em <https://supabase.com/dashboard>, use *New project*.
   - Em *Region*, escolha **South America (São Paulo)**: assim os dados ficam no
     Brasil.
   - Guarde a senha do banco num gerenciador de senhas. Ela não vai para o
     repositório.

2. **Criar as tabelas.** Abra *SQL Editor → New query*, cole todo o
   `supabase/esquema.sql` e clique em *Run*. Rode de novo sempre que esse
   arquivo mudar: o script não apaga dados.

3. **Autenticação por e-mail.** Abra *Authentication → Sign In / Providers →
   Email*.
   - Deixe **Email** ligado e **Confirm email** ligado (recomendado).
   - Em *Minimum password length*, use **8** ou mais. Em *Password
     requirements*, escolha **letras e números**.
   - Se quiser exigir a senha atual para trocar de senha, ligue *Secure password
     change*.

4. **Endereços permitidos.** Abra *Authentication → URL Configuration*.
   - *Site URL*: `https://valbergregory.github.io/radar-oportunidades/`
   - *Redirect URLs*: acrescente
     `https://valbergregory.github.io/radar-oportunidades/**`. É para onde
     voltam a confirmação de e-mail (personalizar.html), o link mágico e a
     recuperação de senha (conta.html).

5. **E-mail de envio (obrigatório para uso real).** O envio padrão do Supabase
   só entrega para a equipe do projeto e tem limite baixo. Configure um provedor
   (Brevo, Resend, Amazon SES ou outro) em *Authentication → Emails → SMTP
   Settings*, com um remetente seu. Em *Emails → Templates*, traduza para o
   português os modelos *Confirm signup*, *Magic Link* e *Reset Password*.

6. **Proteção contra abuso.** Em *Authentication → Rate Limits*, mantenha
   limites baixos de envio. Se houver abuso, ligue o CAPTCHA em *Attack
   Protection*.

7. **Copiar a chave pública.** Em *Project Settings → API Keys*, copie a
   **Publishable key** (`sb_publishable_…`). Em *Project Settings → Data API*,
   copie a **Project URL**. Cole as duas em `docs/conta-config.js` e preencha o
   `controlador` (seu nome e um e-mail de contato).
   - **Nunca** use a *Secret key* (`sb_secret_…`) nem a antiga `service_role`.
     O site recusa essas chaves, o fluxo do GitHub falha se encontrar uma e o
     teste `tests/test_site.py` também.
   - Faça commit de `docs/conta-config.js`. A chave publicável é pública por
     natureza: quem protege os dados são as regras do `esquema.sql`.

8. **Projeto ativo.** Com `conta-config.js` preenchido, o fluxo diário do
   GitHub chama `pulso()`, e o projeto gratuito não é pausado por inatividade.

9. **Revisar a política.** Leia `docs/privacidade.html` e `docs/termos.html`. O
   texto é um modelo: revise com quem entende de LGPD antes de divulgar. Se
   houver pesquisa acadêmica com os dados, verifique a necessidade de aprovação
   por um Comitê de Ética em Pesquisa (CEP).
   - Ao mudar esses textos, aumente `versaoTermos` em `conta-config.js`: quem
     já tem conta terá de aceitar a nova versão.

## Rotina recomendada

- **Contas não confirmadas.** O perfil é criado no cadastro. Se alguém nunca
  confirmar o e-mail, apague a conta depois de alguns dias. No SQL Editor:
  ```sql
  delete from auth.users where email_confirmed_at is null and created_at < now() - interval '7 days';
  ```
- **Pedidos por e-mail.** Quase tudo o titular faz sozinho em *Minha conta*. Se
  alguém pedir por e-mail, confirme que o pedido vem do mesmo endereço e use
  *Authentication → Users → Delete user*: perfil, favoritos e histórico são
  apagados junto. Responda em até 15 dias.
- **Estudos.** Use `select * from pesquisa.perfis_sem_identificacao;` (só quem
  autorizou, sem identificação). Publique apenas números agregados, em grupos
  de 5 pessoas ou mais.

## Testes

```bash
# Banco (num PostgreSQL local vazio, nunca no Supabase):
cd supabase/testes
psql -v ON_ERROR_STOP=1 -d banco_vazio -f imitacao_supabase.sql -f ../esquema.sql -f seguranca.sql

# Telas, com o Supabase simulado (precisa de Node e do Playwright com o Chromium):
python radar.py gerar --perfil valber
node tests/e2e/contas.test.js
```
