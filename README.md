# Radar de Oportunidades

Robô que visita diariamente portais públicos (CNPq, CAPES, Finep, FAPEAL, UFAL),
guarda editais, bolsas, seleções, eventos e vagas em um banco SQLite e gera

- um **site com filtros** por área e tipo (`docs/index.html`, publicado no GitHub Pages),
  que também é um **aplicativo instalável no celular** (PWA) e abre sem internet
- os **dados do site** em `docs/dados.json`
- um **rascunho de newsletter** em Markdown (`saida/newsletter-<perfil>.md`)
- um **calendário de prazos** assinável (`docs/prazos.ics`)
- um **aviso no Telegram** com as novidades (opcional)

Cada pessoa escolhe as próprias áreas. No site, pelos filtros, que ficam salvos no
navegador. Na newsletter, por um perfil de `config/areas.yaml` ou pela opção `--areas`.

## Rodar no computador

```bash
pip install -r requirements.txt
python radar.py tudo --perfil valber
python radar.py gerar --areas turismo,economia   # outra combinação de áreas
python radar.py detalhar --limite 200             # só relê as páginas dos editais
python -m unittest discover -s tests              # testes (não acessam a internet)
```

## Abrir no celular

O Radar se instala como aplicativo pelo navegador, sem loja:

- **Android (Chrome):** abra o endereço do site e toque em **Instalar** no convite,
  ou no menu ⋮ → **Instalar app**.
- **iPhone (Safari):** abra o endereço, toque em **Compartilhar** e depois em
  **Adicionar à Tela de Início**.

O ícone vai para a tela inicial, e o app abre em tela cheia, mesmo sem internet.

Cada oportunidade tem uma página própria, com o resumo, orientações antes da
inscrição, o botão para adicionar o prazo à agenda (arquivo `.ics` com lembrete
3 dias antes) e o botão para salvar nos favoritos. Os favoritos ficam no
aparelho, e o filtro "Só as que salvei" mostra apenas eles. Com conta, os
favoritos também ficam guardados nela.

## Cadastro e entrada (opcional)

O site funciona sem cadastro. Quem quiser pode entrar com um código enviado ao
e-mail, sem senha, e guardar os interesses na conta, para usá-los em qualquer
aparelho. O cadastro segue a LGPD:

- coleta mínima e nenhum dado sensível;
- autorização separada e opcional para uso em estudos;
- histórico de aceites;
- a própria pessoa vê, corrige, baixa e exclui os dados no app;
- cada pessoa só acessa o próprio cadastro (regras no banco).

O cadastro vem **desligado**. Para ativar, siga `supabase/LEIAME.md` e preencha
`config/app.yaml`. A política de privacidade (`docs/privacidade.html`) é gerada
a partir de `modelo_privacidade.html`.

## Publicar e automatizar (GitHub)

1. Crie um repositório e envie estes arquivos.
2. Em **Settings > Pages**, escolha a branch `main` e a pasta `/docs`.
3. Em **Settings > Actions > General**, marque *Read and write permissions*.
4. Na aba **Actions**, rode o fluxo "Radar de Oportunidades" uma vez à mão.
   Depois disso ele roda sozinho todos os dias.
5. Telegram (opcional): crie um bot com o @BotFather, adicione-o como
   administrador do canal e cadastre os segredos `TELEGRAM_TOKEN` e
   `TELEGRAM_CHAT` em **Settings > Secrets and variables > Actions**.

Quando uma fonte falha, o fluxo termina com erro e o GitHub avisa por e-mail.
O que foi coletado das outras fontes é salvo normalmente.

## Aplicativo (PWA)

O site é gerado a partir de `modelo_site.html` (HTML, CSS e JavaScript puros, sem
etapa de build). Os arquivos fixos do aplicativo ficam em `docs/` e não são
gerados pelo robô:

- `docs/manifest.webmanifest`: nome, cores e ícones do aplicativo
- `docs/sw.js`: service worker. Página e `dados.json` vêm da rede primeiro, com o
  cache como reserva; manifest e ícones vêm do cache e são atualizados em segundo plano
- `docs/icones/`: ícone em SVG e PNG (192 e 512)

O aplicativo lê `dados.json`. Se não conseguir, usa a cópia dos dados embutida no
`index.html`. Todos os caminhos são relativos, porque o site fica em
`/radar-oportunidades/` no GitHub Pages.

Para testar no computador:

```bash
python radar.py gerar --perfil valber
cd docs && python -m http.server 8000
```

Abra `http://localhost:8000/` e confira, nas ferramentas do navegador (aba
Application), o manifest e o service worker. O selo de prazo fica laranja até 14
dias, azul acima disso e cinza quando o prazo não foi identificado.

## Ajustar

- **Áreas e palavras-chave** em `config/areas.yaml`
- **Fontes** em `config/fontes.yaml`. Para incluir uma, basta nome e endereço da
  página de listagem. Se vier lixo, restrinja com `padrao_link`.

## Limites conhecidos

- Os coletores ainda não foram executados contra os sites reais. A primeira
  execução serve para calibrar `padrao_link` de cada fonte.
- O prazo é estimado e deve ser conferido no edital antes de divulgar. O robô abre
  a página de cada edital e, se ela não trouxer o prazo, lê os PDFs de edital,
  retificação ou prorrogação anexos (na UFAL, pela API do site). Vale a maior
  data ligada a inscrição ou submissão. Em cronogramas, cada data é julgada só
  pelo texto que a antecede: "resultado da análise das inscrições: 19/11" não é
  prazo. Na falta disso, vale uma data após "prazo" ou "até".
- Quando a página não traz prazo, mas já lista um resultado, homologação ou
  comunicado de encerramento, o item é marcado como encerrado e sai do site.
- Itens sem prazo são relidos a cada 7 dias. Ao melhorar a leitura, aumente
  `VERSAO_LEITURA` em `radar.py`: tudo que está aberto será relido.
- Prazos que ficam em sites externos (ex.: chamadas internacionais divulgadas
  pela FAPEAL) não são encontrados e aparecem como "não informado".
- A classificação por área usa palavras-chave e erra em títulos genéricos.
- Páginas que dependem de JavaScript (como o SIGAA) não são lidas por este coletor.
- O LinkedIn não é fonte do robô, pois os termos de uso proíbem coleta
  automatizada. A newsletter é colada e publicada lá manualmente.
