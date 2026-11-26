// oportunidade.html?id=<id>: detalhe, "Antes de continuar", portal original,
// favoritar (com conta) e prazo na agenda (.ics). Funciona sem internet.
import * as FB from "./firebase.js";
(async () => {
  const RC = window.RC, el = RC.el, area = document.getElementById("area");
  const id = new URLSearchParams(location.search).get("id") || "";
  const URGENTE_ATE = 14;
  const ICONES = {
    "fomento": RC.I.documento, "bolsa": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>`,
    "pos-graduacao": `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/></svg>`,
    "evento": RC.I.megafone, "concurso-vaga": RC.I.maleta, "competicao": RC.I.trofeu,
    "estagio": RC.I.estagio, "emprego": RC.I.emprego,
  };

  let dados;
  try { dados = await RC.dados(); } catch (e) { dados = null; }
  const item = dados && dados.itens.find(i => i.id === id);
  if (!item) {
    area.replaceChildren(el("section", { class: "painel" },
      el("h1", { tabindex: "-1", texto: dados ? "Oportunidade não encontrada" : "Não foi possível carregar" }),
      el("p", { texto: dados ? "Ela pode ter encerrado ou saído da lista na última atualização."
                             : "Verifique a conexão e tente de novo." }),
      el("a", { class: "botao botao-primario", href: "./", texto: "Ver oportunidades" })));
    area.querySelector("h1").focus();
    return;
  }
  document.title = item.titulo + " · Radar de Oportunidades";
  const nomeArea = a => dados.areas[a] || (a === "geral" ? "Geral (todas as áreas)" : a);
  const areas = (item.areas || []).map(nomeArea);
  const tipo = RC.TIPOS[item.tipo] || item.tipo;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const dPrazo = RC.dataLocal(item.prazo), dias = dPrazo ? Math.round((dPrazo - hoje) / 864e5) : null;
  const prazoTexto = dias === null ? "não informado: confira no edital"
    : "até " + RC.fmtData.format(dPrazo) + " (" + (dias === 0 ? "hoje" : dias === 1 ? "amanhã" : dias < 0 ? "encerrado" : "em " + dias + " dias") + ")";
  const prazoClasse = dias === null ? "prazo-sem" : dias <= URGENTE_ATE ? "prazo-urgente" : "prazo-normal";

  const sanfona = (icone, titulo, aberta, ...miolo) => el("details", { class: "sanfona", open: aberta },
    el("summary", {}, el("span", { class: "ico", html: icone }), el("span", { texto: titulo }), el("span", { html: RC.I.abaixo })),
    el("div", { class: "miolo" }, ...miolo));

  const destaque = el("section", { class: "painel destaque", "aria-labelledby": "op-titulo" },
    el("div", { class: "ico", html: ICONES[item.tipo] || RC.I.documento }),
    el("div", {},
      el("h1", { id: "op-titulo", tabindex: "-1", texto: item.titulo, style: "font-size:1.35rem;margin:0 0 4px" }),
      el("p", { class: "orgao", texto: item.fonte }),
      el("span", { class: "etq", texto: tipo }),
      el("p", { class: "linha-icone", html: RC.I.calendario }, el("strong", { texto: "Prazo de inscrição:" }),
         el("span", { class: "selo-texto " + prazoClasse, texto: prazoTexto }))));

  const resumo = sanfona(RC.I.documento, "Resumo da oportunidade", true,
    el("p", { texto: `${tipo} publicado(a) por ${item.fonte}. Prazo de inscrição ${prazoTexto}.` +
                     (item.coletado_em ? ` Encontrada pelo Radar em ${RC.fmtData.format(RC.dataLocal(item.coletado_em))}.` : "") }),
    el("p", { class: "areas", texto: "Os detalhes (objetivo, valores, público e requisitos) estão no edital original." }));
  const areasSec = sanfona(RC.I.camadas, "Áreas relacionadas", false,
    el("div", { class: "chips" }, ...areas.map(a => el("span", { class: "chip", texto: a }))));
  const ok = t => el("li", { html: RC.I.check }, el("span", { texto: t }));
  const antes = sanfona(RC.I.escudo, "Antes de continuar: o que verificar no edital", true,
    el("ul", { class: "lista-ok" }, ok("Leia o edital completo."), ok("Confira quem pode participar e os critérios de elegibilidade."),
       ok("Verifique os documentos exigidos."), ok("Confirme o prazo final: o daqui é estimado automaticamente.")));

  const aviso = el("p", { class: "caixa-info", html: RC.I.info },
    el("span", {}, "O Radar de Oportunidades ", el("strong", { texto: "organiza e divulga" }),
       " oportunidades. ", el("strong", { texto: "A inscrição oficial é feita no portal original de " + item.fonte + "." }),
       " Nenhum dado seu é enviado a ele."));
  const portal = el("a", { class: "botao botao-primario", href: item.link, target: "_blank", rel: "noopener noreferrer",
                           html: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>Acessar portal original` },
                   el("span", { class: "sr-only", texto: " (abre em nova aba)" }));
  const agenda = el("button", { type: "button", class: "botao botao-secundario", disabled: !dPrazo || dias < 0, html: RC.I.calendario + "Adicionar prazo ao calendário" });
  agenda.addEventListener("click", () => RC.baixarIcs(item));
  const favorito = el("div", { id: "lugar-favorito", class: "acoes" });
  const acoes = el("div", { class: "acoes" }, portal, agenda);

  const item2 = (icone, t, v) => el("div", { class: "item" }, el("span", { html: icone }), el("div", {}, el("dt", { texto: t }), el("dd", { texto: v })));
  const lateral = el("aside", { class: "painel resumo-rapido", "aria-labelledby": "rr" }, el("h2", { id: "rr", texto: "Resumo rápido" }),
    el("dl", {}, item2(RC.I.documento, "Organização responsável", item.fonte), item2(RC.I.maleta, "Tipo", tipo),
       item2(RC.I.camadas, "Áreas", areas.join(", ")), item2(RC.I.calendario, "Prazo de inscrição", prazoTexto),
       item.alcance ? item2(RC.I.aviao, "Alcance", (RC.ALCANCES[item.alcance] || "Local") + (item.uf ? " (" + item.uf + ")" : "")) : null,
       item.idioma ? item2(RC.I.documento, "Idioma", RC.IDIOMAS[item.idioma] || item.idioma) : null,
       item2(RC.I.aviao, "Inscrição", "No portal de " + item.fonte)));

  area.replaceChildren(el("div", { class: "detalhe-grade" },
    el("div", {}, destaque, resumo, areasSec, antes, aviso, acoes, favorito,
       el("p", {}, el("a", { href: "./", class: "link-botao", texto: "← Voltar para oportunidades" }))), lateral));
  document.getElementById("op-titulo").focus();

  // ---- Favoritar (só com contas configuradas)
  if (!FB.configurado) return;
  let u;
  try { u = await FB.montarTopo(); } catch (e) { return; }
  if (!u) {
    favorito.append(el("a", { class: "botao botao-secundario", href: "entrar.html?voltar=" + encodeURIComponent("oportunidade.html?id=" + id),
                              html: RC.I.estrela + "Entre para salvar nos favoritos" }));
    return;
  }
  const botao = el("button", { type: "button", class: "botao botao-secundario" });
  const acompanhar = el("input", { type: "checkbox", class: "interruptor", role: "switch", id: "acompanhar" });
  const linhaAcomp = el("label", { class: "linha-interruptor", for: "acompanhar" }, el("span", { html: RC.I.olhoAberto }),
    el("span", {}, el("strong", { texto: "Acompanhar" }),
       el("span", { class: "desc", texto: "Aparece em \u201cAcompanhando\u201d, com contagem do prazo, e avisa quando o prazo mudar ou sair retificação." })),
    acompanhar);
  let fav = null;
  const desenhar = () => {
    botao.setAttribute("aria-pressed", String(!!fav));
    botao.innerHTML = RC.I.estrela + (fav ? "Salvo nos favoritos" : "Salvar nos favoritos");
    acompanhar.checked = !!(fav && fav.acompanhar);
    acompanhar.setAttribute("aria-checked", String(acompanhar.checked));
  };
  try { fav = (await FB.listarFavoritos(u.uid)).find(f => f.item_id === id) || null; } catch (e) { /* sem rede: começa desmarcado */ }
  // Selo antes de registrar a visita; depois a visita vira a nova referência.
  if (fav && RC.mudouDesde(item, fav)) {
    destaque.querySelector(".etq").after(" ", el("span", { class: "selo-mudou", texto: "Mudou desde a sua última visita" }));
  }
  if (fav) FB.marcarVisto(u.uid, id).catch(() => {});
  desenhar();
  botao.addEventListener("click", () => RC.ocupado(botao, async () => {
    try {
      if (fav) { await FB.desfavoritar(u.uid, id); fav = null; }
      else { await FB.favoritar(u.uid, id, { visto: true }); fav = { item_id: id, acompanhar: false }; }
      desenhar();
    } catch (e) { RC.mensagem(area, FB.traduzErro(e)); }
  }));
  acompanhar.addEventListener("change", async () => {
    const quer = acompanhar.checked;
    acompanhar.disabled = true;
    try {
      if (fav) await FB.definirAcompanhar(u.uid, id, quer);
      else await FB.favoritar(u.uid, id, { visto: true, acompanhar: quer });
      fav = { ...(fav || { item_id: id }), acompanhar: quer };
    } catch (e) { RC.mensagem(area, FB.traduzErro(e)); }
    acompanhar.disabled = false;
    desenhar();
  });
  favorito.append(botao, linhaAcomp);
})();
