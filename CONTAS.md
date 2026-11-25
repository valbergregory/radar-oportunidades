# Contas opcionais (Firebase)

O site é aberto a todos. As contas usam **Firebase Authentication** (e-mail e
senha, ou link por e-mail) e **Cloud Firestore** (perfil e favoritos), no plano
gratuito (Spark), sem Analytics, Hosting nem Cloud Functions.

As contas ficam **desligadas enquanto a `apiKey` de `docs/conta-config.js`
estiver vazia** (ou se o arquivo não existir). Nesse caso não aparece
"Entrar", o SDK do Firebase nem é baixado e nenhum dado pessoal é coletado.

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
| `docs/vendor/firebase-13.2.0/` | SDK modular fixado (app, auth e firestore) |
| `tests/firestore/regras.test.mjs` | Testes das regras no emulador |
| `tests/e2e/contas.test.js` | Telas com Playwright contra os emuladores |

## Dados no Firestore

- `perfis/{uid}`: `nome_exibicao`, `vinculo`, `curso_area`, `areas`, `tipos`,
  `frequencia`, `canais`, `quer_newsletter`, `newsletter_em` (data da
  autorização da newsletter, nula sem ela), `termos_versao`,
  `consentimento_em` (data do aceite) e `atualizado_em`. As datas são sempre
  do servidor: as regras recusam datas enviadas pelo navegador.
- `perfis/{uid}/favoritos/{itemId}`: só `criado_em`.
- O **e-mail não é gravado no Firestore**: ele fica só no Authentication.

## Passos no console do Firebase

1. **Regras** (depois de revisar `firestore.rules`): *Firestore Database →
   Regras*. Cole todo o conteúdo do arquivo e clique em **Publicar**. Antes
   disso o banco nega tudo, e as contas não conseguem gravar o perfil.
2. **Ligar as contas no site:** cole a `apiKey` na **linha 11** de
   `docs/conta-config.js` e preencha `controlador` (seu nome e um e-mail de
   contato, que aparecem na política). Faça commit.
3. **Modelos de e-mail:** em *Authentication → Templates*, ajuste o idioma para
   português e revise o texto de *Verificação de endereço de e-mail*,
   *Redefinição de senha* e *Login por link de e-mail*, se essa opção aparecer.
   O remetente padrão é `noreply@radar-oportunidades-88442.firebaseapp.com`.
4. **Política de senha:** em *Authentication → Configurações → Política de
   senha*, exija no mínimo **8 caracteres** com letras e números (o site já
   confere isso, e o servidor passa a conferir também).
5. **Proteção contra enumeração de e-mail:** em *Authentication →
   Configurações → Ações do usuário*, deixe ligada. O site já dá a mesma
   resposta para e-mails com e sem conta no link e na recuperação de senha.
6. **Domínios autorizados:** confira em *Authentication → Configurações →
   Domínios autorizados* que `valbergregory.github.io` está na lista.
7. **Restringir a chave da API (recomendado):** no Google Cloud Console, em
   *APIs e serviços → Credenciais → Browser key*, limite os referenciadores
   HTTP a `https://valbergregory.github.io/*`. A chave da Web é pública por
   natureza, mas isso evita uso dela fora do site.
8. **Revisar a política:** leia `docs/privacidade.html` e `docs/termos.html`.
   O texto é um modelo: revise com quem entende de LGPD antes de divulgar. Ao
   mudar esses textos, aumente `versaoTermos` em `conta-config.js`: quem já tem
   conta terá de aceitar a nova versão.

Nunca coloque no repositório chaves de conta de serviço (arquivos JSON com
`private_key`). O site não precisa delas, e o teste `tests/test_site.py`
falha se encontrar uma em `conta-config.js`.

## Rotina

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
