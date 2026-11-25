# Bibliotecas de terceiros

## Firebase JS SDK 13.2.0 (modular), só app, auth e firestore

| Arquivo | Origem no pacote npm `firebase@13.2.0` | SHA-256 (já com o ajuste abaixo) |
|---|---|---|
| `firebase-13.2.0/firebase-app.js` | `firebase-app.js` | `55b1168a4116436b26c56a87fec434fdda8f9378afa635362f8847113859baa4` |
| `firebase-13.2.0/firebase-auth.js` | `firebase-auth.js` | `3a5f68e53e9187b80a4c205dc523bfe8507f2a94c4ef6304d9160336f516322c` |
| `firebase-13.2.0/firebase-firestore.js` | `firebase-firestore.js` | `6c49b103476714edb91b825ae412b9a5bcca800c88344b5cfd6b441875a2b438` |

- Publicado em 02/11/2026. Licença **Apache-2.0** (cabeçalho `@license` em cada arquivo).
- São os módulos ES prontos para navegador que o pacote traz. Único ajuste: o
  import `https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js` foi trocado
  por `./firebase-app.js`, para o site não depender de CDN.
- Só são baixados quando `docs/conta-config.js` está preenchido.

Para atualizar:

```bash
npm pack firebase@<versão>
tar xzf firebase-<versão>.tgz
for m in app auth firestore; do
  sed "s#https://www.gstatic.com/firebasejs/<versão>/firebase-app.js#./firebase-app.js#g" \
    package/firebase-$m.js > docs/vendor/firebase-<versão>/firebase-$m.js
done
```

Depois troque a versão em `docs/js/firebase.js` e em `docs/sw.js` e atualize
esta tabela.
