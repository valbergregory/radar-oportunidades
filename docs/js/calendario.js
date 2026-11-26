// calendario.html: assinar prazos.ics (Google, Apple, outras agendas) e lista dos próximos prazos.
import * as FB from "./firebase.js";
const RC = window.RC, el = RC.el, $ = id => document.getElementById(id);

const ics = new URL("prazos.ics", location.href);
const webcal = "webcal://" + ics.host + ics.pathname;
$("google").href = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal);
$("webcal").href = webcal;
$("endereco").textContent = "Endereço do calendário: " + ics.href;
$("copiar").addEventListener("click", async () => {
  let ok = false;
  try { await navigator.clipboard.writeText(ics.href); ok = true; } catch (e) { /* sem permissão */ }
  const m = $("copiado");
  m.textContent = ok ? "Endereço copiado. Cole na opção “assinar calendário por URL” da sua agenda."
                     : "Não deu para copiar automaticamente. Selecione o endereço acima e copie.";
  m.hidden = false;
});

(async () => {
  const destino = $("lista-prazos");
  let dados;
  try { dados = await RC.dados(); } catch (e) {
    destino.replaceChildren(el("p", { class: "areas", texto: "Não foi possível carregar os prazos. Verifique a conexão." }));
    return;
  }
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const itens = dados.itens.filter(i => i.prazo && RC.dataLocal(i.prazo) >= hoje)
    .sort((a, b) => a.prazo.localeCompare(b.prazo));
  if (!itens.length) {
    destino.replaceChildren(el("p", { class: "areas", texto: "Nenhum prazo identificado no momento." }));
  } else {
    const mes = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
    const grupos = new Map();
    for (const i of itens) {
      const chave = mes.format(RC.dataLocal(i.prazo));
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(i);
    }
    destino.replaceChildren(...[...grupos].flatMap(([nome, lista]) => [
      el("h3", { texto: nome.charAt(0).toUpperCase() + nome.slice(1) }),
      el("ul", { class: "lista-ok" }, ...lista.map(i => {
        const dias = Math.round((RC.dataLocal(i.prazo) - hoje) / 864e5);
        const quando = dias === 0 ? "hoje" : dias === 1 ? "amanhã" : "em " + dias + " dias";
        return el("li", { html: RC.I.calendario },
          el("span", {}, el("strong", { texto: RC.fmtData.format(RC.dataLocal(i.prazo)) + " (" + quando + "): " }),
             el("a", { href: "oportunidade.html?id=" + encodeURIComponent(i.id), texto: i.titulo }),
             el("span", { class: "areas", texto: " · " + i.fonte })));
      }))]));
  }
  await FB.montarTopo().catch(() => null);
})();
