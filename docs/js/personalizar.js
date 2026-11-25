// personalizar.html: áreas, tipos, frequência e canais, com resumo ao lado.
"use strict";
(async () => {
  const RC = window.RC, $ = id => document.getElementById(id), el = RC.el;
  if (!(await RC.carregarSupabase())) return RC.indisponivel($("area"));
  const s = await RC.exigirSessao();
  if (!s) return;
  await RC.montarTopo();
  const painel = $("painel");
  let p, areas = {};
  try {
    p = await RC.perfil(s);
    areas = (await RC.dados()).areas || {};
  } catch (e) {
    return RC.mensagem(painel, RC.traduzErro(e) || "Não foi possível carregar suas preferências.");
  }
  if (!p || p.termos_versao !== RC.config.versaoTermos) return location.replace("conta.html?aba=privacidade&aceitar=1");

  const salvar = el("button", { type: "submit", class: "botao botao-primario", texto: "Salvar preferências" });
  const form = el("form", { class: "form" },
    RC.grupoPilulas("Áreas de interesse", "area", areas, p.areas, "checkbox", RC.I.camadas, "Selecione uma ou mais áreas."),
    RC.grupoPilulas("Tipos de oportunidades", "tipo", RC.TIPOS, p.tipos, "checkbox", RC.I.maleta, "O que você quer acompanhar."),
    RC.grupoPilulas("Frequência dos alertas", "frequencia", RC.FREQUENCIAS, [p.frequencia], "radio", RC.I.sino, "Com que frequência quer receber as novidades."),
    RC.grupoPilulas("Canais", "canal", RC.CANAIS, p.canais, "checkbox", RC.I.aviao, "Por onde quer receber os alertas."),
    el("p", { class: "caixa-info", html: RC.I.info },
       el("span", { texto: "O envio de alertas começa em breve. Por enquanto, guardamos suas escolhas; as áreas e os tipos já valem como filtros da lista." })),
    el("div", { class: "acoes" }, el("a", { class: "botao botao-secundario", href: "./", texto: "Voltar" }), salvar));
  painel.replaceChildren(form);

  function contar() {
    const n = nome => RC.marcados(form, nome);
    const freq = n("frequencia")[0];
    $("contadores").replaceChildren(
      ...[[n("area").length, n("area").length === 1 ? "área de interesse" : "áreas de interesse"],
          [n("tipo").length, n("tipo").length === 1 ? "tipo de oportunidade" : "tipos de oportunidades"],
          [freq ? 1 : 0, freq ? RC.FREQUENCIAS[freq].toLowerCase() : "sem frequência"],
          [n("canal").length, n("canal").length === 1 ? "canal" : "canais"]]
        .map(([num, rot]) => el("div", {}, el("strong", { texto: String(num) }), el("span", { texto: rot }))));
  }
  form.addEventListener("change", contar);
  contar();

  form.addEventListener("submit", ev => {
    ev.preventDefault();
    RC.ocupado(salvar, async () => {
      const { error } = await RC.cliente().from("perfis").update({
        areas: RC.marcados(form, "area"), tipos: RC.marcados(form, "tipo"),
        frequencia: RC.marcados(form, "frequencia")[0] || "semanal", canais: RC.marcados(form, "canal"),
      }).eq("id", s.user.id);
      if (error) return RC.mensagem(painel, RC.traduzErro(error));
      RC.preferenciasMudaram();
      RC.mensagem(painel, "Preferências salvas. A lista de oportunidades já usa suas áreas e tipos.", true);
      const ver = el("a", { class: "botao botao-primario", href: "./", texto: "Ver oportunidades" });
      if (!painel.querySelector(".ver-op")) { ver.classList.add("ver-op"); painel.querySelector(".msg").after(ver); }
    });
  });
})();
