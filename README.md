# Radar de Oportunidades

Robô que visita diariamente portais públicos (CNPq, CAPES, FAPEAL, UFAL) e de
associações científicas (ANPEC, SOBER, SBG),
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

Cada oportunidade tem uma página própria (`oportunidade.html?id=…`), com resumo,
orientações antes da inscrição, o link para o portal original e um botão para
adicionar o prazo à agenda (arquivo `.ics` com lembrete 3 dias antes). No
celular, uma barra inferior leva a Início, Buscar, Calendário e, com contas
ativas, Salvos e Perfil.

## Contas (opcional)

O site é aberto a todos. Quem quiser pode criar uma conta (Firebase
Authentication, com e-mail e senha ou link por e-mail) para:
- salvar oportunidades nos favoritos (estrela nos cartões e filtro "Meus favoritos");
- guardar áreas e tipos de interesse, que passam a ser os filtros da lista;
- escolher a frequência e os canais de alerta. O envio de alertas ainda não
  existe: por enquanto a preferência só fica guardada.

Só o e-mail é obrigatório, e ele não é copiado para o banco. A newsletter tem
consentimento separado e datado. A pessoa baixa os próprios dados (JSON) e
exclui a conta sozinha, na hora. Perfis e favoritos ficam no Cloud Firestore,
em São Paulo, protegidos por `firestore.rules`.

As contas vêm **desligadas** enquanto a `apiKey` de `docs/conta-config.js`
estiver vazia. O passo a passo para ativar está em `CONTAS.md`. As páginas de
conta, `docs/privacidade.html` e `docs/termos.html` são estáticas; só
`index.html`, `dados.json` e `prazos.ics` são gerados pelo `radar.py`.

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
- `docs/estilo.css`: estilos de todas as páginas
- `docs/sw.js`: service worker. Páginas públicas e `dados.json` vêm da rede
  primeiro, com o cache como reserva; ícones e estilos vêm do cache. Páginas de
  conta, o SDK do Firebase e as chamadas ao Firebase nunca vão para o cache.
- `docs/icones/`: ícone em SVG e PNG (192 e 512)
- `docs/js/`, `docs/vendor/`: scripts das páginas de conta e da oportunidade

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
