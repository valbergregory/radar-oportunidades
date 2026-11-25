// personalizar.html: áreas, tipos, frequência e canais, com resumo ao lado.
import * as FB from "./firebase.js";
const RC = window.RC, $ = id => document.getElementById(id), el = RC.el;

async function principal() {
  const u = await FB.exigirLogin();
  if (!u) return;
  await FB.montarTopo();
  const painel = $("painel");
  let p, areas = {};
  try {
    p = await FB.lerPerfil(u.uid);
    areas = (await RC.dados()).areas || {};
  } catch (e) {
    return RC.mensagem(painel, FB.traduzErro(e));
  }
  if (!p || p.termos_versao !== FB.VERSAO_TERMOS) return location.replace("conta.html?aba=privacidade&aceitar=1");

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
  if (new URLSearchParams(location.search).get("nova") === "1") {
    RC.mensagem(painel, "Conta criada! Enviamos um e-mail para confirmar seu endereço. Agora escolha suas preferências.", true);
  }

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
      try {
        await FB.alterarPerfil(u.uid, {
          areas: RC.marcados(form, "area"), tipos: RC.marcados(form, "tipo"),
          frequencia: RC.marcados(form, "frequencia")[0] || "semanal", canais: RC.marcados(form, "canal"),
        }, p);
      } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
      RC.preferenciasMudaram();
      RC.mensagem(painel, "Preferências salvas. A lista de oportunidades já usa suas áreas e tipos.", true);
      if (!painel.querySelector(".ver-op")) {
        painel.querySelector(".msg").after(el("a", { class: "botao botao-primario ver-op", href: "./", texto: "Ver oportunidades" }));
      }
    });
  });
}

if (!FB.configurado) RC.indisponivel($("area"));
else principal();
