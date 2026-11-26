# Contas opcionais (Firebase)

O site é aberto a todos. As contas usam **Firebase Authentication** (e-mail e
senha, ou link por e-mail) e **Cloud Firestore** (perfil e favoritos), no plano
gratuito (Spark), sem Analytics, Hosting nem Cloud Functions.

As contas estão **ligadas**. Elas ficam desligadas sempre que a `apiKey` de
`docs/conta-config.js` estiver vazia (ou se o arquivo não existir): nesse caso
não aparece "Entrar", o SDK do Firebase nem é baixado e nenhum dado pessoal é
coletado.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `docs/conta-config.js` | `firebaseConfig` do app da Web, controlador (LGPD) e versão dos termos |
| `firestore.rules` | Regras do Firestore (revisar e publicar pelo console) |
| `firebase.json` | Só para os emuladores locais e o caminho das regras |
| `docs/entrar.html`, `cadastro.html`, `personalizar.html`, `conta.html` | Telas de conta |
| `docs/oportunidade.html?id=…` | Detalhe, favoritar e prazo na agenda |
| `docs/privacidade.html`, `docs/termos.html` | Política e termos |
| `docs/js/firebase.js` | Todo o acesso ao Firebase |
| `docs/js/sugestoes.js` | Tabelas da sugestão de filtros por vínculo (editável; aumente `versao` ao mudar) |
| `docs/js/acompanhar.js` | Lista "Acompanhando" e selo "Mudou desde a sua última visita" |
| `docs/vendor/firebase-13.2.0/` | SDK modular fixado (app, auth e firestore) |
| `tests/firestore/regras.test.mjs` | Testes das regras no emulador |
| `tests/e2e/contas.test.js` | Telas com Playwright contra os emuladores |

## Dados no Firestore

- `perfis/{uid}`: `nome_exibicao`, `vinculos` (lista: pode ser mais de um, ex.
  estudante de pós e docente), `vinculo` (o primeiro da lista, para perfis
  antigos; inclui `nao-informado`), `titulacao`, `instituicao` e os
  identificadores `orcid` (0000-0000-0000-000X), `lattes` (16 dígitos) e
  `linkedin` (o que vem depois de linkedin.com/in/), todos opcionais; `uf`
  (sigla, `nao-informado` ou nulo), `curso_area`, `areas`, `tipos`, `alcances`
  (estadual, regional, nacional, internacional), `idiomas` (pt, en, es, outro),
  `sugestao_aplicada` (versão de `sugestoes.js` usada, ou nula),
  `frequencia`, `canais`, `quer_newsletter`, `newsletter_em` (data da
  autorização da newsletter, nula sem ela), `termos_versao`,
  `consentimento_em` (data do aceite) e `atualizado_em`. As datas são sempre
  do servidor: as regras recusam datas enviadas pelo navegador.
- `perfis/{uid}/favoritos/{itemId}`: `criado_em`, `acompanhar` (opcional, sim/não)
  e `visto_em` (opcional, data do servidor da última visita); `itemId` é o id do
  Radar (16 caracteres hexadecimais, o mesmo de `dados.json`). Depois de criado,
  só `acompanhar` e `visto_em` podem mudar. Perfis e favoritos antigos, sem os
  campos novos, continuam válidos.
- A sugestão de filtros só pré-marca campos que a pessoa ainda não escolheu;
  "Restaurar sugestão" é sempre manual.
- O **e-mail não é gravado no Firestore**: ele fica só no Authentication.

## Estado da configuração (projeto `radar-oportunidades-88442`, novembro de 2026)

| Item | Onde | Estado |
|---|---|---|
| Regras do Firestore | *Firestore Database → Regras* | **Publicadas**, iguais a `firestore.rules` |
| Contas no site | `docs/conta-config.js` | **Ligadas**: `apiKey` e `controlador` preenchidos |
| Modelos de e-mail | *Authentication → Templates* | **Em português** (verificação, redefinição de senha e login por link) |
| Política de senha | *Authentication → Configurações → Política de senha* | Mínimo de **8 caracteres** e **número obrigatório**, em modo **aplicação exigida** (ver nota abaixo) |
| Proteção contra enumeração de e-mail | *Authentication → Configurações → Ações do usuário* | **Ligada** |
| Domínios autorizados | *Authentication → Configurações → Domínios autorizados* | Inclui `valbergregory.github.io` |
| Restrição da chave da Web | Google Cloud Console → *APIs e serviços → Credenciais* → chave do navegador | Referenciadores HTTP: `https://valbergregory.github.io/*` e `https://radar-oportunidades-88442.firebaseapp.com/*` |

**Nota sobre a senha:** o console não permite exigir "qualquer letra" (só
maiúsculas ou minúsculas separadamente). Por isso a regra "letras e números"
fica dividida:
- o **servidor** (Firebase) exige 8 caracteres e pelo menos um número, e
  recusa senhas fora disso mesmo que alguém pule o site;
- o **site** (`cadastro.html` e a troca de senha em `conta.html`) exige também
  pelo menos uma letra. Uma senha só com números passaria pelo servidor se
  alguém chamasse a API diretamente, sem o site.

**Por que dois referenciadores na chave:** `valbergregory.github.io` é o site.
`radar-oportunidades-88442.firebaseapp.com` é o domínio de autenticação do
Firebase (`authDomain`), que hospeda as páginas de ação dos e-mails
(verificação, redefinição de senha e login por link) e usa a mesma chave.
Sem ele, esses links deixam de funcionar.

### Se precisar refazer ou mudar algo

- **Regras:** altere `firestore.rules` por pull request, rode
  `npm run regras` (abaixo) e só depois cole o arquivo em *Firestore Database →
  Regras → Publicar*. O console não lê o repositório: publicar é sempre manual.
- **Desligar as contas** (por exemplo, numa emergência): deixe `apiKey: ""`
  na linha 11 de `docs/conta-config.js` e faça commit. O site volta a funcionar
  sem contas; os dados já gravados continuam no Firebase.
- **Novo domínio para o site:** acrescente-o em *Domínios autorizados* e nos
  referenciadores da chave.
- **Textos legais:** ao mudar `docs/privacidade.html` ou `docs/termos.html`,
  aumente `versaoTermos` em `conta-config.js`: quem já tem conta terá de aceitar
  a nova versão. O texto é um modelo; revise com quem entende de LGPD.

Nunca coloque no repositório chaves de conta de serviço (arquivos JSON com
`private_key`). O site não precisa delas, e o teste `tests/test_site.py`
falha se encontrar uma em `conta-config.js`.

## Rotina

- **Coleta local (`rodar-local.bat`):** só regrava `docs/index.html`,
  `docs/dados.json` e `docs/prazos.ics` (além de `dados/` e `saida/`). Os
  arquivos das contas (`conta-config.js`, páginas de conta, `js/`, `vendor/`,
  `sw.js`) não são tocados. Atenção: o `.bat` faz `git add -A docs`, então
  qualquer edição local que você tenha feito em `docs/` também vai no commit
  "Radar: coleta local".

- **Pedidos por e-mail:** quase tudo o titular faz sozinho em *Minha conta*
  (baixar dados, corrigir, retirar a newsletter, excluir). Se alguém pedir por
  e-mail, confirme que o pedido vem do mesmo endereço. Para excluir pelo
  console, apague o documento `perfis/{uid}` e a subcoleção `favoritos` em
  *Firestore Database* e o usuário em *Authentication → Usuários*.
- **Limites do plano gratuito:** o Authentication envia um número limitado de
  e-mails por dia. Em caso de muitos cadastros, os e-mails podem atrasar.

## Testes (precisam de Node e de Java, para o emulador do Firestore)

```bash
cd tests
npm install
npx playwright install chromium
npm run regras   # firestore.rules no emulador: casos permitidos e negados
npm run e2e      # telas contra os emuladores de Auth e Firestore
```

Os emuladores usam o projeto de demonstração `demo-radar`, que nunca toca no
projeto real.
