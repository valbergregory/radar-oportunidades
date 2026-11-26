// personalizar.html: áreas, tipos, alcance, idioma, frequência e canais, com resumo ao lado.
// Tipos, alcance e idioma vêm pré-marcados pela sugestão do perfil (js/sugestoes.js)
// só quando a pessoa ainda não escolheu; escolhas já feitas nunca são trocadas.
import * as FB from "./firebase.js";
const RC = window.RC, $ = id => document.getElementById(id), el = RC.el;

async function principal() {
  const u = await FB.exigirLogin();
  if (!u) return;
  await FB.montarTopo();
  const painel = $("painel");
  let p, areas = {}, emBreve = new Set();
  try {
    p = await FB.lerPerfil(u.uid);
    const d = await RC.dados();
    areas = d.areas || {}; emBreve = RC.tiposEmBreve(d);
  } catch (e) {
    return RC.mensagem(painel, FB.traduzErro(e));
  }
  if (!p || p.termos_versao !== FB.VERSAO_TERMOS) return location.replace("conta.html?aba=privacidade&aceitar=1");

  const S = window.RADAR_SUGESTOES, sugestao = S.calcular(RC.vinculosDoPerfil(p), p.uf);
  // Um campo "já foi escolhido" quando tem itens ou quando a sugestão já foi aplicada
  // antes (aí vazio é escolha da pessoa: "todos").
  const escolhido = campo => (Array.isArray(p[campo]) && p[campo].length > 0) || !!p.sugestao_aplicada;
  const sugeridos = ["tipos", "alcances", "idiomas"].filter(c => !escolhido(c));
  const inicial = c => sugeridos.includes(c) ? sugestao[c] : (p[c] || []);
  const semUf = !p.uf || p.uf === "nao-informado";

  const aviso = el("p", { class: "caixa-info sugestao", id: "aviso-sugestao", html: RC.I.info },
    el("span", { texto: "Sugerimos estas opções pelo seu perfil. Altere o que quiser." }));
  if (!sugeridos.length) aviso.hidden = true;
  const restaurar = el("button", { type: "button", class: "botao botao-secundario", id: "restaurar-sugestao", texto: "Restaurar sugestão" });
  restaurar.addEventListener("click", () => {
    for (const [nome, campo] of [["tipo", "tipos"], ["alcance", "alcances"], ["idioma", "idiomas"]]) {
      for (const c of form.querySelectorAll(`input[name="${nome}"]`)) c.checked = sugestao[campo].includes(c.value);
    }
    aplicouSugestao = true;
    aviso.hidden = false;
    contar();
  });
  let aplicouSugestao = sugeridos.length > 0;

  const salvar = el("button", { type: "submit", class: "botao botao-primario", texto: "Salvar preferências" });
  const form = el("form", { class: "form" },
    RC.grupoPilulas("Áreas de interesse", "area", areas, p.areas, "checkbox", RC.I.camadas, "Selecione uma ou mais áreas."),
    aviso,
    RC.grupoPilulas("Tipos de oportunidades", "tipo", RC.TIPOS, inicial("tipos"), "checkbox", RC.I.maleta, "O que você quer acompanhar.", emBreve),
    RC.grupoPilulas("Alcance", "alcance", RC.ALCANCES, inicial("alcances"), "checkbox", RC.I.camadas,
      semUf ? "Sem estado no perfil, Estadual e Regional não se aplicam. Informe seu estado em Minha conta › Perfil."
            : `Em relação ao seu estado (${p.uf}): Estadual = ${p.uf}; Regional = mesma região.`),
    RC.grupoPilulas("Idioma", "idioma", RC.IDIOMAS, inicial("idiomas"), "checkbox", RC.I.info, "Idioma do edital ou da página."),
    el("div", { class: "acoes" }, restaurar),
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
          [n("alcance").length, n("alcance").length === 1 ? "alcance" : "alcances"],
          [n("idioma").length, n("idioma").length === 1 ? "idioma" : "idiomas"],
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
          alcances: RC.marcados(form, "alcance"), idiomas: RC.marcados(form, "idioma"),
          sugestao_aplicada: aplicouSugestao ? S.versao : (p.sugestao_aplicada || null),
        }, p);
        p = await FB.lerPerfil(u.uid);
      } catch (e) { return RC.mensagem(painel, FB.traduzErro(e)); }
      RC.preferenciasMudaram();
      RC.mensagem(painel, "Preferências salvas. A lista de oportunidades já usa suas áreas, tipos, alcance e idioma.", true);
      if (!painel.querySelector(".ver-op")) {
        painel.querySelector(".msg").after(el("a", { class: "botao botao-primario ver-op", href: "./", texto: "Ver oportunidades" }));
      }
    });
  });
}

if (!FB.configurado) RC.indisponivel($("area"));
else principal();
