// Service worker do Radar de Oportunidades.
// Caminhos relativos ao próprio arquivo: o site fica em /radar-oportunidades/.
// - Páginas públicas, scripts e dados: rede primeiro, cache como reserva.
// - Ícones, manifest e estilos: cache primeiro, atualizados em segundo plano.
// - Páginas e scripts de CONTA (entrar, cadastro, personalizar, conta) e o
//   SDK do Firebase (vendor/): sempre pela rede e NUNCA guardados no cache.
//   Sem internet, essas páginas mostram um aviso.
// - Chamadas ao Firebase (googleapis.com e afins), editais e prazos.ics: outros
//   domínios ou arquivos não interceptados, logo nunca vão para o cache.
const VERSAO = "radar-v5";
const APP = ["./", "./index.html", "./dados.json", "./manifest.webmanifest", "./estilo.css",
             "./oportunidade.html", "./privacidade.html", "./termos.html", "./conta-config.js",
             "./js/comum.js", "./js/firebase.js", "./js/oportunidade.js", "./js/legal.js",
             "./icones/icone.svg", "./icones/icone-192.png", "./icones/icone-512.png"];
const SO_REDE = /\/(entrar|cadastro|personalizar|conta)\.html$|\/js\/(entrar|cadastro|personalizar|conta|conta-index)\.js$|\/vendor\//;

self.addEventListener("install", evento => {
  evento.waitUntil(caches.open(VERSAO).then(cache =>
    // Um arquivo ausente não impede a instalação.
    Promise.all(APP.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => {})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener("activate", evento => {
  evento.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

function guardar(pedido, resposta) {
  if (resposta.ok && resposta.type === "basic") {
    const copia = resposta.clone();
    caches.open(VERSAO).then(cache => cache.put(pedido, copia));
  }
  return resposta;
}

function redePrimeiro(pedido, reserva) {
  return fetch(pedido).then(r => guardar(pedido, r))
    .catch(() => caches.match(pedido, { ignoreSearch: true })
      .then(r => r || (reserva && caches.match(reserva)))
      .then(r => r || Response.error()));
}

function cachePrimeiro(pedido) {
  return caches.match(pedido).then(guardada => {
    const daRede = fetch(pedido).then(r => guardar(pedido, r)).catch(() => guardada || Response.error());
    return guardada || daRede;
  });
}

const SEM_REDE = `<!DOCTYPE html><html lang="pt-BR"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Sem conexão · Radar de Oportunidades</title>
<link rel="stylesheet" href="estilo.css"><main class="vista"><section class="painel"><h1>Sem conexão</h1>
<p>A sua conta precisa de internet. As oportunidades continuam disponíveis sem conexão.</p>
<a class="botao botao-primario" href="./">Ver oportunidades</a></section></main></html>`;

self.addEventListener("fetch", evento => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (pedido.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return;
  if (url.pathname.endsWith(".ics")) return;
  if (SO_REDE.test(url.pathname)) {
    if (pedido.mode === "navigate") {
      evento.respondWith(fetch(pedido).catch(() =>
        new Response(SEM_REDE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
    }
    return;  // scripts e biblioteca: rede direta, sem cache
  }
  if (pedido.mode === "navigate") {
    evento.respondWith(redePrimeiro(pedido, "./index.html"));
  } else if (/\/(dados\.json|conta-config\.js|js\/[^/]+\.js)$/.test(url.pathname)) {
    evento.respondWith(redePrimeiro(pedido));
  } else {
    evento.respondWith(cachePrimeiro(pedido));
  }
});
