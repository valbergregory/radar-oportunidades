// Radar de Oportunidades: funções de interface comuns às páginas de conta, à
// página da oportunidade e ao complemento do index. O acesso ao Firebase fica
// em js/firebase.js.
"use strict";
window.RC = (() => {
  const cfg = window.RADAR_CONTA || {};
  const controlador = cfg.controlador || {};
  const TIPOS = { "fomento": "Fomento e editais", "bolsa": "Bolsas", "pos-graduacao": "Mestrado e doutorado",
                  "evento": "Congressos e eventos", "concurso-vaga": "Concursos e vagas",
                  "competicao": "Competições e prêmios" };
  const VINCULOS = {
    "estudante-graduacao": "Estudante de graduação", "estudante-pos": "Estudante de pós-graduação",
    "estudante-medio-tecnico": "Estudante de ensino médio ou técnico", "docente": "Docente",
    "tecnico-administrativo": "Técnico(a)-administrativo(a)", "pesquisador": "Pesquisador(a)",
    "egresso": "Egresso(a)", "comunidade": "Comunidade externa", "outro": "Outro",
  };
  const FREQUENCIAS = { "diario": "Resumo diário", "semanal": "Resumo semanal", "urgentes": "Só prazos urgentes" };
  const CANAIS = { "email": "E-mail", "calendario": "Calendário" };

  const P = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const I = {
    pessoa: `<svg ${P}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>`,
    alvo: `<svg ${P}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>`,
    sino: `<svg ${P}><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>`,
    escudo: `<svg ${P}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
    cadeado: `<svg ${P}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
    email: `<svg ${P}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>`,
    calendario: `<svg ${P}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>`,
    megafone: `<svg ${P}><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12"/></svg>`,
    baixar: `<svg ${P}><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></svg>`,
    lixeira: `<svg ${P}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
    documento: `<svg ${P}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>`,
    sair: `<svg ${P}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>`,
    seta: `<svg ${P}><path d="M9 6l6 6-6 6"/></svg>`,
    abaixo: `<svg ${P}><path d="M6 9l6 6 6-6"/></svg>`,
    check: `<svg ${P}><path d="M5 12l5 5 9-10"/></svg>`,
    info: `<svg ${P}><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>`,
    olho: `<svg ${P}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
    olhoFechado: `<svg ${P}><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.8M6.6 6.6C3.7 8.4 2 12 2 12s4 7 10 7a9.8 9.8 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>`,
    estrela: `<svg ${P}><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>`,
    camadas: `<svg ${P}><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>`,
    maleta: `<svg ${P}><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/></svg>`,
    aviao: `<svg ${P}><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>`,
    trofeu: `<svg ${P}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>`,
    grafico: `<svg ${P}><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>`,
  };

  function el(tag, atributos = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(atributos)) {
      if (v === false || v == null) continue;
      if (k === "texto") e.textContent = v;
      else if (k === "html") e.innerHTML = v;  // só para os ícones fixos deste arquivo
      else if (k in e && typeof v !== "string") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    e.append(...filhos.filter(f => f != null && f !== false));
    return e;
  }

  // Só volta para páginas deste site (evita redirecionar para fora).
  function destinoSeguro(valor, padrao = "./") {
    return /^(\.\/|[a-z-]+\.html)(\?[\w=&%.-]*)?$/.test(valor || "") ? valor : padrao;
  }
  function voltarPara() { return destinoSeguro(new URLSearchParams(location.search).get("voltar")); }
  function paginaAtual() { return location.pathname.split("/").pop() + location.search; }

  function mensagem(onde, texto, ok = false) {
    const antigo = onde.querySelector(":scope > .msg");
    if (antigo) antigo.remove();
    if (!texto) return;
    const m = el("p", { class: "msg" + (ok ? " ok" : ""), role: ok ? "status" : "alert", tabindex: "-1", texto });
    onde.prepend(m);
    m.focus({ preventScroll: false });
  }

  async function ocupado(botao, tarefa) {
    botao.disabled = true;
    try { return await tarefa(); } finally { botao.disabled = false; }
  }

  async function dados() {
    const r = await fetch("dados.json", { cache: "no-cache" });
    if (!r.ok) throw new Error("dados.json: HTTP " + r.status);
    return r.json();
  }

  // O index aplica as preferências da conta aos filtros quando elas mudam.
  function preferenciasMudaram() { try { localStorage.removeItem("radar-perfil-aplicado"); } catch (e) { /* ok */ } }

  // Grupo de opções em pílulas (checkbox ou radio).
  function grupoPilulas(legenda, nome, opcoes, marcadas, tipo = "checkbox", icone, descricao) {
    return el("fieldset", { class: "chips-escolha" },
      el("legend", {}, el("span", { class: "secao-titulo" }, icone ? el("span", { class: "ico", html: icone }) : null,
         el("span", {}, el("span", { texto: legenda, style: "display:block" }),
            descricao ? el("span", { class: "areas", texto: descricao, style: "display:block;font-weight:400" }) : null))),
      ...Object.entries(opcoes).map(([v, r]) => el("label", { class: "chip-check" },
        el("input", { type: tipo, name: nome, value: v, checked: marcadas.includes(v) }), r)));
  }
  function marcados(form, nome) { return [...form.querySelectorAll(`input[name="${nome}"]:checked`)].map(c => c.value); }

  // Página de conta aberta sem contas configuradas: explica e oferece voltar.
  function indisponivel(onde) {
    onde.replaceChildren(el("section", { class: "painel" },
      el("h1", { texto: "Contas ainda não disponíveis" }),
      el("p", { texto: "O Radar funciona sem cadastro. As contas serão ativadas em breve." }),
      el("a", { class: "botao botao-primario", href: "./", texto: "Ver oportunidades" })));
  }

  const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });
  function dataLocal(iso) {
    const [a, m, d] = (iso || "").split("-").map(Number);
    return a && m && d ? new Date(a, m - 1, d) : null;
  }

  return { config: cfg, controlador, TIPOS, VINCULOS, FREQUENCIAS, CANAIS, I, el, voltarPara, destinoSeguro,
           mensagem, ocupado, dados, preferenciasMudaram, grupoPilulas, marcados, indisponivel, fmtData, dataLocal };
})();

// Botões "mostrar senha" (olho) de qualquer página.
document.addEventListener("click", ev => {
  const b = ev.target.closest(".mostrar-senha");
  if (!b) return;
  const campo = b.parentElement.querySelector("input");
  const mostrar = campo.type === "password";
  campo.type = mostrar ? "text" : "password";
  b.setAttribute("aria-pressed", String(mostrar));
  b.setAttribute("aria-label", mostrar ? "Esconder senha" : "Mostrar senha");
  b.innerHTML = mostrar ? window.RC.I.olhoFechado : window.RC.I.olho;
});
