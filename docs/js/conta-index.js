// Complemento do index quando há contas: Entrar/Minha conta, estrela de
// favorito nos cartões, filtro "Meus favoritos", seção "Acompanhando" no topo,
// selo "Mudou desde a sua última visita" e preferências da conta nos filtros.
import * as FB from "./firebase.js";
import { listaAcompanhando, seloMudou } from "./acompanhar.js";
const RC = window.RC, radar = window.radar, $ = id => document.getElementById(id);

async function principal() {
  const u = await FB.montarTopo();
  if (!u) return;
  const favoritos = new Map();  // item_id -> { criado_em, acompanhar, visto_em }
  let perfil = null;
  const carregarFavoritos = async () => {
    favoritos.clear();
    for (const f of await FB.listarFavoritos(u.uid)) favoritos.set(f.item_id, f);
  };
  try {
    const [, p] = await Promise.all([carregarFavoritos(), FB.lerPerfil(u.uid)]);
    perfil = p;
  } catch (e) { aviso(FB.traduzErro(e), false); }

  // Seção "Acompanhando" no topo da lista
  const secao = $("acompanhando");
  async function desenharAcompanhando() {
    const dados = radar.dados();
    if (!dados) return setTimeout(desenharAcompanhando, 500);  // dados ainda carregando
    const { ul, total } = listaAcompanhando(u.uid, dados.itens, [...favoritos.values()],
      async () => { await carregarFavoritos().catch(() => {}); desenharAcompanhando(); radar.redesenhar(); },
      t => aviso(t, false));
    secao.replaceChildren(RC.el("h2", { id: "titulo-acompanhando", html: RC.I.olhoAberto }, "Acompanhando"), ul);
    secao.hidden = total === 0;
  }

  // Filtro "Meus favoritos"
  const caixa = $("so-favoritos");
  const rotulo = () => { $("so-favoritos-rotulo").textContent = "Só os meus favoritos (" + favoritos.size + ")"; };
  $("campo-favoritos").hidden = false; rotulo();
  if (new URLSearchParams(location.search).get("favoritos") === "1") {
    caixa.checked = true;
    document.querySelector(".abas a[aria-current]")?.removeAttribute("aria-current");
    $("aba-salvos")?.setAttribute("aria-current", "page");
  }
  caixa.addEventListener("change", () => radar.redesenhar());
  radar.ganchos.filtro.push(i => !caixa.checked || favoritos.has(i.id));

  // Estrela em cada cartão (acima do link que cobre o cartão)
  radar.ganchos.cartao.push((li, i) => {
    if (!i.id) return;
    const marcado = favoritos.has(i.id);
    const b = RC.el("button", { type: "button", class: "estrela", "aria-pressed": String(marcado),
      "aria-label": (marcado ? "Remover dos favoritos: " : "Salvar nos favoritos: ") + i.titulo, html: RC.I.estrela },
      marcado ? "Salvo" : "Salvar");
    b.addEventListener("click", ev => {
      ev.preventDefault();
      RC.ocupado(b, async () => {
        const tinha = favoritos.has(i.id);
        try { if (tinha) await FB.desfavoritar(u.uid, i.id); else await FB.favoritar(u.uid, i.id); }
        catch (e) { return aviso(FB.traduzErro(e), false); }
        await carregarFavoritos().catch(() => {});
        rotulo(); radar.redesenhar(); desenharAcompanhando();
        document.querySelector(`.cartao[data-id="${CSS.escape(i.id)}"] .estrela`)?.focus();
      });
    });
    li.querySelector(".etq").after(b);
    if (marcado && RC.mudouDesde(i, favoritos.get(i.id))) b.after(seloMudou());
  });

  // Preferências da conta → filtros (só quando mudam, para não desfazer ajustes do dia a dia).
  if (perfil) {
    if (perfil.termos_versao !== FB.VERSAO_TERMOS) {
      aviso("Atualizamos os termos.", false, RC.el("a", { href: "conta.html?aba=privacidade&aceitar=1", texto: "Revise e aceite" }));
    }
    const marca = perfil.atualizado_em && perfil.atualizado_em.toMillis ? String(perfil.atualizado_em.toMillis()) : "";
    let aplicado = null;
    try { aplicado = localStorage.getItem("radar-perfil-aplicado"); } catch (e) { /* ok */ }
    const temUf = typeof perfil.uf === "string";
    if ((perfil.areas.length || perfil.tipos.length || (perfil.alcances || []).length || (perfil.idiomas || []).length || temUf)
        && aplicado !== marca) {
      const uf = perfil.uf === "nao-informado" ? "" : (perfil.uf || undefined);
      const aplicar = () => radar.aplicarInteresses(perfil.areas, perfil.tipos, perfil.alcances || [], perfil.idiomas || [], uf);
      if (aplicar() === false) setTimeout(aplicar, 800);  // dados ainda carregando
      try { localStorage.setItem("radar-perfil-aplicado", marca); } catch (e) { /* ok */ }
      aviso("Filtros ajustados às suas preferências.", true, RC.el("a", { href: "personalizar.html", texto: "Mudar preferências" }));
    }
  } else {
    aviso("Falta aceitar os termos para usar sua conta.", false, RC.el("a", { href: "conta.html?aba=privacidade&aceitar=1", texto: "Concluir" }));
  }
  radar.redesenhar();
  desenharAcompanhando();
}

function aviso(texto, ok = true, link) {
  const p = $("aviso-conta");
  p.className = "msg" + (ok ? " ok" : "");
  p.replaceChildren(texto, link ? " " : "", link || "");
  p.hidden = false;
}

if (FB.configurado && radar) principal();
