# Cadastro e entrada no Radar (Supabase)

O cadastro é **opcional** e vem **desligado**. Enquanto `config/app.yaml` estiver
incompleto, o site e o aplicativo não mostram o botão "Entrar" e não coletam
nenhum dado pessoal.

## O que já está pronto

- `schema.sql`: tabelas, regras de acesso (cada pessoa só lê e altera os próprios
  dados), histórico de consentimentos gravado pelo servidor, exclusão da própria
  conta e uma visão sem identificação para os estudos.
- `docs/conta.js`: entrada por código enviado ao e-mail (sem senha), cadastro,
  Minha conta (ver, editar, baixar, retirar autorização, excluir) e sincronização
  dos filtros entre aparelhos.
- `modelo_privacidade.html`: política de privacidade e termos de uso. Vira
  `docs/privacidade.html`, já com o nome e o e-mail do controlador.

## Passo a passo para ativar

1. **Criar o projeto.** Em <https://supabase.com>, crie uma conta e um projeto
   novo. Em *Region*, escolha **South America (São Paulo)**: assim os dados ficam
   no Brasil e não há transferência internacional. Guarde a senha do banco num
   gerenciador de senhas. Ela não vai para o repositório.

2. **Criar as tabelas.** No projeto, abra *SQL Editor*, cole todo o conteúdo de
   `supabase/schema.sql` e clique em *Run*. Pode rodar de novo depois de
   atualizações: o script não apaga dados. **Rode de novo sempre que o arquivo
   mudar** (ex.: a coluna `favoritos` foi acrescentada depois).

3. **Entrada por código.**
   - Em *Authentication → Sign In / Providers → Email*, deixe *Email* habilitado.
   - Em *Authentication → Emails → Templates*, edite **Magic Link** e
     **Confirm signup** para mostrar o código. Exemplo:

     ```html
     <h2>Seu código de acesso ao Radar de Oportunidades</h2>
     <p>Digite este código no aplicativo: <strong>{{ .Token }}</strong></p>
     <p>Ele vale por poucos minutos. Se você não pediu, ignore este e-mail.</p>
     ```

   - Em *Authentication → URL Configuration*, ponha em *Site URL* o endereço do
     site: `https://valbergregory.github.io/radar-oportunidades/`.

4. **E-mail de envio (obrigatório para uso real).** O envio padrão do Supabase só
   entrega para os e-mails da equipe do projeto e tem limite baixo por hora.
   Configure um provedor em *Authentication → Emails → SMTP Settings* (por exemplo
   Brevo, Resend ou Amazon SES). Use um remetente seu, como
   `radar@seudominio.com.br`.

5. **Proteção contra abuso (recomendado).** Em *Authentication → Rate Limits*,
   mantenha limites baixos para envio de e-mail. Se houver abuso, ative o CAPTCHA
   em *Attack Protection*.

6. **Ligar no Radar.** Em *Project Settings → API*, copie a *Project URL* e a
   *anon public key* para `config/app.yaml`, e preencha o `controlador` (seu nome
   e um e-mail de contato para pedidos sobre dados). Depois:

   ```bash
   python radar.py gerar --perfil valber
   ```

   Faça commit de `config/app.yaml` e `docs/`. A chave *anon* é pública por
   natureza: quem protege os dados são as regras do `schema.sql`. **Nunca**
   coloque a chave *service_role* no repositório nem no site.

7. **Revisar a política.** Leia `docs/privacidade.html` gerado. O texto é um
   modelo: revise com quem entende de LGPD antes de divulgar. Se os dados forem
   usados em **pesquisa acadêmica com seres humanos**, verifique também se o
   estudo precisa ser aprovado por um Comitê de Ética em Pesquisa (CEP).

8. **Mudou a política?** Altere o texto em `modelo_privacidade.html`, aumente
   `privacidade.versao` em `config/app.yaml` e gere de novo. Quem já tem conta
   precisará aceitar a nova versão na próxima entrada.

## Para os estudos

Só entram as pessoas que autorizaram, sem nome, e-mail nem identificador. No
*SQL Editor*:

```sql
select * from pesquisa.perfis_sem_identificacao;
-- exemplo de agregado, mostrando só grupos de 5 pessoas ou mais
select vinculo, uf, count(*) from pesquisa.perfis_sem_identificacao
group by vinculo, uf having count(*) >= 5 order by count(*) desc;
```

Use *Export → CSV* para levar a uma planilha. Ao publicar resultados, mostre só
agregados: curso, instituição e município juntos podem identificar alguém num
grupo pequeno.

## Pedidos de titulares por e-mail

Quase tudo a pessoa faz sozinha em *Minha conta*. Se alguém pedir por e-mail,
confirme que o pedido vem do mesmo endereço cadastrado. Para excluir pelo painel,
use *Authentication → Users → Delete user*: perfil e histórico são apagados
junto. Responda em até 15 dias.

## Testes do banco (opcional, num PostgreSQL local)

```bash
cd supabase/testes
psql -v ON_ERROR_STOP=1 -d banco_de_teste -f imitacao_supabase.sql -f ../schema.sql -f seguranca.sql
```

Use um banco vazio, **nunca o do Supabase**. Deve terminar com
`TODOS OS TESTES DE SEGURANCA PASSARAM`.
