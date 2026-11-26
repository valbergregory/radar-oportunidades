// "Acompanhando": favoritos marcados para acompanhar, com contagem regressiva,
// prazo na agenda e o selo "Mudou desde a sua última visita" (alterado_em do
// item, gravado pelo robô, depois do visto_em do favorito). Usado pela lista
// (conta-index.js) e por conta.html?aba=acompanhando. Só existe com conta.
import * as FB from "./firebase.js";
const RC = window.RC, el = RC.el;

export const SELO_MUDOU = "Mudou desde a sua última visita";

export function seloMudou() {
  return el("span", { class: "selo-mudou", texto: SELO_MUDOU });
}

// favs: [{ item_id, criado_em, acompanhar, visto_em }]; itens: dados.json.itens.
// aoMudar(): chamado depois de parar de acompanhar ou remover.
export function listaAcompanhando(uid, itens, favs, aoMudar, aoErro) {
  const porId = new Map(itens.map(i => [i.id, i]));
  const acomp = favs.filter(f => f.acompanhar);
  const comItem = acomp.filter(f => porId.has(f.item_id))
    .sort((a, b) => (porId.get(a.item_id).prazo || "9999").localeCompare(porId.get(b.item_id).prazo || "9999"));
  const sumidos = acomp.filter(f => !porId.has(f.item_id));
  const ul = el("ul", { class: "lista-acompanhando" });
  const acao = (rotulo, classe, fn) => {
    const b = el("button", { type: "button", class: "botao " + classe, html: rotulo });
    b.addEventListener("click", () => RC.ocupado(b, async () => {
      try { await fn(); } catch (e) { return aoErro && aoErro(FB.traduzErro(e)); }
      aoMudar && aoMudar();
    }));
    return b;
  };
  for (const f of comItem) {
    const i = porId.get(f.item_id), dias = RC.diasAte(i.prazo);
    const agenda = el("button", { type: "button", class: "botao botao-secundario", html: RC.I.calendario + "Adicionar à agenda",
                                  disabled: dias === null || dias < 0 });
    agenda.addEventListener("click", () => RC.baixarIcs(i));
    ul.append(el("li", { "data-id": i.id },
      el("div", {},
        el("a", { href: "oportunidade.html?id=" + encodeURIComponent(i.id), texto: i.titulo }),
        el("div", { class: "areas", texto: i.fonte }),
        el("span", { class: "contagem" + (dias !== null && dias > 14 ? " longe" : ""), texto: RC.contagem(i.prazo) }),
        RC.mudouDesde(i, f) ? el("span", {}, " ", seloMudou()) : null),
      el("div", { class: "acoes" }, agenda,
        acao("Parar de acompanhar", "botao-secundario", () => FB.definirAcompanhar(uid, f.item_id, false)))));
  }
  if (sumidos.length) {
    ul.append(el("li", {}, el("span", { texto: sumidos.length === 1
        ? "Uma oportunidade acompanhada saiu da lista (encerrada ou removida)."
        : sumidos.length + " oportunidades acompanhadas saíram da lista (encerradas ou removidas)." }),
      acao("Remover", "botao-secundario", () => Promise.all(sumidos.map(f => FB.desfavoritar(uid, f.item_id))))));
  }
  return { ul, total: acomp.length };
}
