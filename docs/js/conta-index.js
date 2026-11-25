// Complemento do index quando há contas: botão Entrar/Minha conta, estrela de
// favorito nos cartões, filtro "Meus favoritos" e preferências da conta nos filtros.
"use strict";
(async () => {
  const RC = window.RC, radar = window.radar, $ = id => document.getElementById(id);
  if (!RC || !RC.ativo || !radar) return;
  const s = await RC.montarTopo();
  if (!s) return;
  const db = RC.cliente();
  const favoritos = new Set();
  const [fav, perfil] = await Promise.all([db.from("favoritos").select("item_id"), RC.perfil(s).catch(() => null)]);
  for (const f of fav.data || []) favoritos.add(f.item_id);

  // Filtro "Meus favoritos"
  const campo = $("campo-favoritos"), caixa = $("so-favoritos");
  const rotulo = () => { $("so-favoritos-rotulo").textContent = "Só os meus favoritos (" + favoritos.size + ")"; };
  campo.hidden = false; rotulo();
  if (new URLSearchParams(location.search).get("favoritos") === "1") {
    caixa.checked = true;
    const aba = $("aba-salvos");
    if (aba) { document.querySelector('.abas a[aria-current]')?.removeAttribute("aria-current"); aba.setAttribute("aria-current", "page"); }
  }
  caixa.addEventListener("change", () => radar.redesenhar());
  radar.ganchos.filtro.push(i => !caixa.checked || favoritos.has(i.id));

  // Estrela em cada cartão (acima do link que cobre o cartão)
  radar.ganchos.cartao.push((li, i) => {
    if (!i.id) return;
    const marcado = favoritos.has(i.id);
    const b = RC.el("button", { type: "button", class: "estrela", "aria-pressed": String(marcado),
      "aria-label": (marcado ? "Remover dos favoritos: " : "Salvar nos favoritos: ") + i.titulo,
      html: RC.I.estrela }, marcado ? "Salvo" : "Salvar");
    b.addEventListener("click", ev => {
      ev.preventDefault();
      RC.ocupado(b, async () => {
        const tinha = favoritos.has(i.id);
        const { error } = tinha ? await db.from("favoritos").delete().eq("item_id", i.id)
                                : await db.from("favoritos").insert({ item_id: i.id });
        if (error) { aviso(RC.traduzErro(error), false); return; }
        if (tinha) favoritos.delete(i.id); else favoritos.add(i.id);
        rotulo(); radar.redesenhar();
        const novo = document.querySelector(`.cartao[data-id="${CSS.escape(i.id)}"] .estrela`);
        if (novo) novo.focus();
      });
    });
    li.querySelector(".etq").after(b);
  });

  function aviso(texto, ok = true, link) {
    const p = $("aviso-conta");
    p.className = "msg" + (ok ? " ok" : "");
    p.replaceChildren(texto, link ? " " : "", link || "");
    p.hidden = false;
  }

  // Preferências da conta → filtros (só quando mudam, para não desfazer ajustes do dia a dia).
  if (perfil) {
    if (perfil.termos_versao !== RC.config.versaoTermos) {
      aviso("Atualizamos os termos.", false, RC.el("a", { href: "conta.html?aba=privacidade&aceitar=1", texto: "Revise e aceite" }));
    }
    let aplicado = null;
    try { aplicado = localStorage.getItem("radar-perfil-aplicado"); } catch (e) { /* ok */ }
    if ((perfil.areas.length || perfil.tipos.length) && aplicado !== perfil.atualizado_em) {
      const aplicar = () => radar.aplicarInteresses(perfil.areas, perfil.tipos);
      if (aplicar() === false) setTimeout(aplicar, 800);  // dados ainda carregando
      try { localStorage.setItem("radar-perfil-aplicado", perfil.atualizado_em); } catch (e) { /* ok */ }
      aviso("Filtros ajustados às suas preferências.", true, RC.el("a", { href: "personalizar.html", texto: "Mudar preferências" }));
    }
  }
  radar.redesenhar();
})();
