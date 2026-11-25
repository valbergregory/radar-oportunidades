// Service worker do Radar de Oportunidades.
// Caminhos relativos ao próprio arquivo: o site fica em /radar-oportunidades/.
// - Páginas, scripts e dados (index.html, privacidade.html, conta.js,
//   dados.json): rede primeiro, cache como reserva, pois mudam com frequência.
// - Manifest e ícones: cache primeiro, atualizado em segundo plano.
// - prazos.ics e outros domínios (editais, Supabase): sempre pela rede, sem cache.
const VERSAO = "radar-v3";
const APP = ["./", "./index.html", "./dados.json", "./manifest.webmanifest",
             "./privacidade.html", "./conta.js",
             "./icones/icone.svg", "./icones/icone-192.png", "./icones/icone-512.png"];

self.addEventListener("install", evento => {
  evento.waitUntil(caches.open(VERSAO).then(cache =>
    // Um arquivo ausente (ex.: dados.json antes da primeira geração) não impede a instalação.
    Promise.all(APP.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => {})))
  ).then(() => self.skipWaiting()));
});

self.addEventListener("activate", evento => {
  evento.waitUntil(caches.keys()
    .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

function redePrimeiro(pedido, reserva) {
  return fetch(pedido).then(resposta => {
    if (resposta.ok) {
      const copia = resposta.clone();
      caches.open(VERSAO).then(cache => cache.put(pedido, copia));
    }
    return resposta;
  }).catch(() => caches.match(pedido, { ignoreSearch: true })
    .then(r => r || (reserva && caches.match(reserva)))
    .then(r => r || Response.error()));
}

function cachePrimeiro(pedido) {
  return caches.match(pedido).then(guardada => {
    const daRede = fetch(pedido).then(resposta => {
      if (resposta.ok) {
        const copia = resposta.clone();
        caches.open(VERSAO).then(cache => cache.put(pedido, copia));
      }
      return resposta;
    }).catch(() => guardada || Response.error());
    return guardada || daRede;
  });
}

self.addEventListener("fetch", evento => {
  const pedido = evento.request;
  const url = new URL(pedido.url);
  if (pedido.method !== "GET" || url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(new URL("./", self.location).pathname)) return;
  if (url.pathname.endsWith(".ics")) return;
  if (pedido.mode === "navigate") {
    evento.respondWith(redePrimeiro(pedido, "./index.html"));
  } else if (/\/(dados\.json|[^/]+\.(js|html))$/.test(url.pathname)) {
    evento.respondWith(redePrimeiro(pedido));
  } else {
    evento.respondWith(cachePrimeiro(pedido));
  }
});
