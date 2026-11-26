// Radar de Oportunidades: funções de interface comuns às páginas de conta, à
// página da oportunidade e ao complemento do index. O acesso ao Firebase fica
// em js/firebase.js.
"use strict";
window.RC = (() => {
  const cfg = window.RADAR_CONTA || {};
  const controlador = cfg.controlador || {};
  // Os mesmos rótulos estão no modelo do index (modelo_site.html) e em radar.py.
  const TIPOS = { "fomento": "Fomento e editais", "bolsa": "Bolsas", "pos-graduacao": "Mestrado e doutorado",
                  "evento": "Congressos e eventos", "concurso-vaga": "Concursos", "estagio": "Estágios",
                  "emprego": "Empregos", "competicao": "Competições e prêmios" };
  const VINCULOS = {
    "estudante-graduacao": "Estudante de graduação", "estudante-pos": "Estudante de pós-graduação",
    "estudante-medio-tecnico": "Estudante de ensino médio ou técnico", "docente": "Docente",
    "tecnico-administrativo": "Técnico(a)-administrativo(a)", "pesquisador": "Pesquisador(a)",
    "egresso": "Egresso(a)", "comunidade": "Comunidade externa", "outro": "Outro",
    "nao-informado": "Prefiro não informar",
  };
  // Estados por região (para o alcance "Regional").
  const REGIOES = {
    "Norte": ["AC", "AP", "AM", "PA", "RO", "RR", "TO"],
    "Nordeste": ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"],
    "Centro-Oeste": ["DF", "GO", "MT", "MS"],
    "Sudeste": ["ES", "MG", "RJ", "SP"],
    "Sul": ["PR", "RS", "SC"],
  };
  const UFS = Object.values(REGIOES).flat().sort();
  const regiaoDe = uf => Object.keys(REGIOES).find(r => REGIOES[r].includes(uf)) || null;
  const ALCANCES = { "estadual": "Estadual", "regional": "Regional", "nacional": "Nacional", "internacional": "Internacional" };
  const IDIOMAS = { "pt": "Português", "en": "Inglês", "es": "Espanhol", "outro": "Outros" };

  // Alcance do item em relação ao estado da pessoa:
  //   internacional/nacional: como o item; local ou estadual: "estadual" se for
  //   o estado da pessoa, "regional" se for da mesma região, "fora" se não.
  //   Sem estado da pessoa (ou item sem UF), fica o alcance bruto do item.
  function relacaoAlcance(item, ufPessoa) {
    const a = item.alcance || "nacional";
    if (a === "internacional" || a === "nacional" || !item.uf) return a === "internacional" ? a : "nacional";
    if (!ufPessoa || !REGIOES[regiaoDe(ufPessoa)]) return "estadual";
    if (item.uf === ufPessoa) return "estadual";
    return regiaoDe(item.uf) === regiaoDe(ufPessoa) ? "regional" : "fora";
  }
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
    estagio: `<svg ${P}><path d="M4 20V8l8-5 8 5v12"/><path d="M9 20v-6h6v6M9 10h6"/></svg>`,
    emprego: `<svg ${P}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.5"/><path d="M5.5 17c.7-1.8 2-2.8 3.5-2.8s2.8 1 3.5 2.8M15 10h3M15 13h3"/></svg>`,
    olhoAberto: `<svg ${P}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`,
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

  // Uma única leitura por página: as abas e a lista reaproveitam a mesma (só leitura).
  let dadosPendente = null;
  function dados() {
    if (!dadosPendente) {
      dadosPendente = fetch("dados.json", { cache: "no-cache" }).then(r => {
        if (!r.ok) throw new Error("dados.json: HTTP " + r.status);
        return r.json();
      });
      dadosPendente.catch(() => { dadosPendente = null; });  // falhou: a próxima chamada tenta de novo
    }
    return dadosPendente;
  }

  // O index aplica as preferências da conta aos filtros quando elas mudam.
  function preferenciasMudaram() { try { localStorage.removeItem("radar-perfil-aplicado"); } catch (e) { /* ok */ } }

  // Grupo de opções em pílulas (checkbox ou radio).
  // emBreve: valores ainda sem itens (ficam marcáveis, com o selo "em breve").
  function grupoPilulas(legenda, nome, opcoes, marcadas, tipo = "checkbox", icone, descricao, emBreve = new Set()) {
    return el("fieldset", { class: "chips-escolha" },
      el("legend", {}, el("span", { class: "secao-titulo" }, icone ? el("span", { class: "ico", html: icone }) : null,
         el("span", {}, el("span", { texto: legenda, style: "display:block" }),
            descricao ? el("span", { class: "areas", texto: descricao, style: "display:block;font-weight:400" }) : null))),
      ...Object.entries(opcoes).map(([v, r]) => el("label", { class: "chip-check" },
        el("input", { type: tipo, name: nome, value: v, checked: marcadas.includes(v) }), r,
        emBreve.has(v) ? el("span", { class: "selo-em-breve", texto: "em breve" }) : null)));
  }
  // Tipos sem nenhuma oportunidade nos dados (ex.: estágio e emprego, ainda sem fonte).
  function tiposEmBreve(dados) {
    const com = new Set(((dados && dados.itens) || []).map(i => i.tipo));
    return dados && dados.itens ? new Set(Object.keys(TIPOS).filter(t => !com.has(t))) : new Set();
  }
  function marcados(form, nome) { return [...form.querySelectorAll(`input[name="${nome}"]:checked`)].map(c => c.value); }

  // ---- Vínculos (mais de um) e dados acadêmicos e profissionais (opcionais)
  const TITULACOES = { "ensino-medio": "Ensino médio", "tecnico": "Técnico", "graduacao": "Graduação",
    "especializacao": "Especialização", "mestrado": "Mestrado", "doutorado": "Doutorado",
    "pos-doutorado": "Pós-doutorado", "livre-docencia": "Livre-docência", "nao-informado": "Prefiro não informar" };

  // "Você é": várias opções; "Prefiro não informar" exclui as demais. obrigatorio:
  // pelo menos uma (o aviso aparece abaixo do grupo, pela validação acessível).
  function grupoVinculos(marcadas, obrigatorio) {
    const g = grupoPilulas("Você é", "vinculos", VINCULOS, marcadas, "checkbox", I.pessoa,
      "Marque todas as que se aplicam (por exemplo, estudante de pós e docente).");
    g.id = "grupo-vinculos";
    if (obrigatorio) g.querySelector("legend .secao-titulo > span:last-child > span").append(" ", el("span", { class: "obrigatorio", "aria-hidden": "true", texto: "*" }));
    const caixas = [...g.querySelectorAll("input")], nao = caixas.find(c => c.value === "nao-informado");
    const conferir = () => caixas[0].setCustomValidity(obrigatorio && !caixas.some(c => c.checked)
      ? "Escolha ao menos uma opção (ou \u201cPrefiro não informar\u201d)." : "");
    g.addEventListener("change", ev => {
      if (ev.target === nao && nao.checked) caixas.forEach(c => { if (c !== nao) c.checked = false; });
      else if (ev.target !== nao && ev.target.checked) nao.checked = false;
      conferir();
      if (!caixas[0].validationMessage) caixas[0].dispatchEvent(new Event("input", { bubbles: true }));
    });
    conferir();
    return g;
  }

  // ORCID: 0000-0000-0000-000X com dígito verificador (ISO 7064 11,2).
  function normalizarOrcid(t) {
    const m = String(t || "").toUpperCase().match(/(\d{4})-?(\d{4})-?(\d{4})-?(\d{3}[\dX])/);
    if (!m) return null;
    const d = m.slice(1).join("");
    let total = 0;
    for (const c of d.slice(0, 15)) total = (total + Number(c)) * 2;
    const r = (12 - total % 11) % 11, verif = r === 10 ? "X" : String(r);
    return verif === d[15] ? m.slice(1).join("-") : null;
  }
  // Lattes: o número de 16 dígitos (de "http://lattes.cnpq.br/1234567890123456" ou só o número).
  function normalizarLattes(t) {
    const m = String(t || "").match(/(?:^|lattes\.cnpq\.br\/|\D)(\d{16})(?!\d)/);
    return m ? m[1] : null;
  }
  // LinkedIn: o identificador do perfil (de "linkedin.com/in/fulano" ou só "fulano").
  function normalizarLinkedin(t) {
    const s = String(t || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
    const m = s.match(/linkedin\.com\/in\/([^/\s]+)$/i) || (!/[/\s.]/.test(s) && s.match(/^@?(.+)$/));
    const id = m && m[1];
    return id && /^[A-Za-z0-9_%-]{3,100}$/.test(id) ? id : null;
  }
  const PERFIS_EXTERNOS = {
    orcid: { rotulo: "ORCID", dica: "Ex.: 0000-0002-1825-0097 ou https://orcid.org/…", normalizar: normalizarOrcid,
             erro: "ORCID inválido. Confira os 16 caracteres (o último pode ser X).", url: v => "https://orcid.org/" + v },
    lattes: { rotulo: "Currículo Lattes", dica: "Endereço do currículo, ex.: http://lattes.cnpq.br/1234567890123456",
              normalizar: normalizarLattes, erro: "Use o endereço do currículo (com os 16 números) ou só os números.",
              url: v => "http://lattes.cnpq.br/" + v },
    linkedin: { rotulo: "LinkedIn", dica: "Endereço do perfil, ex.: https://www.linkedin.com/in/seu-nome",
                normalizar: normalizarLinkedin, erro: "Use o endereço do perfil (linkedin.com/in/…).",
                url: v => "https://www.linkedin.com/in/" + v },
  };

  // Titulação, instituição, ORCID, Lattes e LinkedIn (todos opcionais).
  function camposAcademicos(p = {}) {
    const opc = t => el("span", {}, t + " ", el("span", { class: "opcional", texto: "Opcional" }));
    const tit = el("select", { name: "titulacao", id: "titulacao" }, el("option", { value: "", texto: "Selecione" }),
      ...Object.entries(TITULACOES).map(([v, r]) => el("option", { value: v, texto: r, selected: p.titulacao === v })));
    const externos = Object.entries(PERFIS_EXTERNOS).map(([nome, c]) => {
      const atual = p[nome] ? c.url(p[nome]) : "";
      const campo = el("input", { name: nome, id: "campo-" + nome, value: atual, maxlength: "200", inputmode: "url",
                                  autocomplete: "off", spellcheck: "false", "aria-describedby": "dica-" + nome });
      campo.addEventListener("input", () => campo.setCustomValidity(campo.value.trim() && !c.normalizar(campo.value) ? c.erro : ""));
      return el("label", { class: "campo" }, opc(c.rotulo), campo,
        el("span", { class: "areas", id: "dica-" + nome }, c.dica,
           atual ? el("span", {}, " · ", el("a", { href: atual, target: "_blank", rel: "noopener noreferrer", texto: "abrir" })) : null));
    });
    return el("fieldset", { class: "form academicos" },
      el("legend", {}, el("span", { class: "secao-titulo" }, el("span", { class: "ico", html: I.documento }),
        el("span", {}, el("span", { texto: "Formação e perfis acadêmicos", style: "display:block" }),
          el("span", { class: "areas", style: "display:block;font-weight:400",
                       texto: "Opcionais. Ajudam a entender quem usa o Radar e a sugerir oportunidades melhores." })))),
      el("div", { class: "grade-campos" },
        el("label", { class: "campo" }, opc("Maior titulação"), tit),
        el("label", { class: "campo" }, opc("Instituição de vínculo"),
           el("input", { name: "instituicao", value: p.instituicao || "", maxlength: "120", autocomplete: "organization",
                         placeholder: "Ex.: Universidade Federal de Alagoas" }))),
      el("div", { class: "grade-campos" }, ...externos));
  }
  // Lê os campos acima já normalizados (vazio = null).
  function lerAcademicos(form) {
    const t = n => (form.elements[n] && form.elements[n].value || "").trim();
    const r = { titulacao: t("titulacao") || null, instituicao: t("instituicao") || null };
    for (const [nome, c] of Object.entries(PERFIS_EXTERNOS)) r[nome] = t(nome) ? c.normalizar(t(nome)) : null;
    return r;
  }
  // Vínculos marcados; "vinculo" (campo antigo) guarda o primeiro, para perfis e telas antigas.
  function lerVinculos(form) {
    const v = marcados(form, "vinculos");
    return { vinculos: v, vinculo: v[0] || null };
  }
  const vinculosDoPerfil = p => (p && Array.isArray(p.vinculos) && p.vinculos.length) ? p.vinculos : (p && p.vinculo ? [p.vinculo] : []);

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
  function diasAte(iso) {
    const d = dataLocal(iso);
    if (!d) return null;
    const h = new Date(); h.setHours(0, 0, 0, 0);
    return Math.round((d - h) / 864e5);
  }
  // "Faltam 9 dias", "Termina hoje", "Encerrado", "Prazo não informado"
  function contagem(iso) {
    const n = diasAte(iso);
    if (n === null) return "Prazo não informado";
    if (n < 0) return "Encerrado";
    if (n === 0) return "Termina hoje";
    if (n === 1) return "Termina amanhã";
    return "Faltam " + n + " dias";
  }

  // Prazo de um item como evento de agenda (.ics), com lembrete 3 dias antes.
  function baixarIcs(item) {
    const dPrazo = dataLocal(item.prazo);
    if (!dPrazo) return;
    const esc = t => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const dobrar = l => { const p = []; for (let i = 0; i < l.length; i += 60) p.push((i ? " " : "") + l.slice(i, i + 60)); return p.join("\r\n"); };
    const fim = new Date(dPrazo); fim.setDate(fim.getDate() + 1);
    const ymd = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radar de Oportunidades//PT-BR", "BEGIN:VEVENT",
      "UID:" + item.id + "@radar-oportunidades", "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
      "DTSTART;VALUE=DATE:" + ymd(dPrazo), "DTEND;VALUE=DATE:" + ymd(fim), "SUMMARY:" + esc("Prazo: " + item.titulo),
      "DESCRIPTION:" + esc("Prazo estimado pelo Radar de Oportunidades. Confira no edital: " + item.link), "URL:" + item.link,
      "BEGIN:VALARM", "TRIGGER:-P3D", "ACTION:DISPLAY", "DESCRIPTION:" + esc("Faltam 3 dias: " + item.titulo), "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"];
    const url = URL.createObjectURL(new Blob([linhas.map(dobrar).join("\r\n") + "\r\n"], { type: "text/calendar" }));
    const a = el("a", { href: url, download: "prazo-" + item.id + ".ics" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // "Mudou desde a sua última visita": alterado_em (ISO, do robô) depois de
  // visto_em (ou criado_em) do favorito (Timestamp do Firestore).
  function mudouDesde(item, favorito) {
    if (!item || !item.alterado_em || !favorito) return false;
    const ref = favorito.visto_em || favorito.criado_em;
    const ms = ref && typeof ref.toMillis === "function" ? ref.toMillis() : null;
    return ms !== null && Date.parse(item.alterado_em) > ms;
  }

  return { config: cfg, controlador, TIPOS, VINCULOS, tiposEmBreve, TITULACOES, PERFIS_EXTERNOS, grupoVinculos, camposAcademicos,
           lerAcademicos, lerVinculos, vinculosDoPerfil, normalizarOrcid, normalizarLattes, normalizarLinkedin, FREQUENCIAS, CANAIS, REGIOES, UFS, regiaoDe, ALCANCES, IDIOMAS,
           relacaoAlcance, I, el, voltarPara, destinoSeguro, mensagem, ocupado, dados, preferenciasMudaram, grupoPilulas,
           marcados, indisponivel, fmtData, dataLocal, diasAte, contagem, baixarIcs, mudouDesde };
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

// Interruptores (role="switch"): alguns leitores de tela só leem aria-checked.
document.addEventListener("change", ev => {
  const c = ev.target;
  if (c && c.getAttribute && c.getAttribute("role") === "switch") c.setAttribute("aria-checked", String(c.checked));
}, true);

// Validação acessível: em vez do balão do navegador (que some e não é lido por
// todos os leitores de tela), mostra a mensagem fixa abaixo do campo, liga-a ao
// campo (aria-describedby, aria-invalid) e põe o foco no primeiro campo com erro.
(() => {
  let focado = null;
  function mensagemDoCampo(c) {
    const v = c.validity;
    if (v.valueMissing) return c.type === "checkbox" ? "Marque esta opção para continuar." : "Preencha este campo.";
    if (v.typeMismatch && c.type === "email") return "Digite um e-mail válido, como nome@exemplo.com.";
    if (v.tooShort) return `Use pelo menos ${c.minLength} caracteres.`;
    if (v.patternMismatch) return "Confira o formato do que foi digitado.";
    return c.validationMessage || "Confira este campo.";
  }
  function lugarDaMensagem(c) {
    return c.closest(".senha") || (c.type === "checkbox" ? (c.closest("#grupo-vinculos") || c.closest("label")) : c);
  }
  function limpar(c) {
    c.removeAttribute("aria-invalid");
    const id = c.dataset.erroId, m = id && document.getElementById(id);
    if (m) m.remove();
    if (id) {
      c.setAttribute("aria-describedby", (c.getAttribute("aria-describedby") || "").replace(id, "").trim());
      if (!c.getAttribute("aria-describedby")) c.removeAttribute("aria-describedby");
      delete c.dataset.erroId;
    }
  }
  document.addEventListener("invalid", ev => {
    const c = ev.target;
    if (!(c instanceof HTMLElement) || !c.closest("form")) return;
    ev.preventDefault();  // sem o balão nativo
    limpar(c);
    const id = "erro-" + Math.random().toString(36).slice(2, 9);
    const m = document.createElement("p");
    m.className = "erro-campo"; m.id = id; m.textContent = mensagemDoCampo(c);
    lugarDaMensagem(c).after(m);
    c.setAttribute("aria-invalid", "true");
    c.dataset.erroId = id;
    c.setAttribute("aria-describedby", ((c.getAttribute("aria-describedby") || "") + " " + id).trim());
    if (!focado) { focado = c; c.focus(); setTimeout(() => { focado = null; }, 0); }
  }, true);
  // Reconfere logo depois de cada tecla, quando as regras da página (ex.: "as
  // senhas não conferem") já foram atualizadas: a mensagem some enquanto a pessoa
  // digita. Esperar o "change" (ao sair do campo) faria a página pular no meio do
  // clique seguinte, que cairia no lugar errado.
  const reconferir = c => setTimeout(() => { if (c.dataset && c.dataset.erroId && c.checkValidity()) limpar(c); }, 0);
  document.addEventListener("input", ev => reconferir(ev.target), true);
  document.addEventListener("change", ev => {
    if (/^(checkbox|radio|select-one|select-multiple)$/.test(ev.target.type)) reconferir(ev.target);
  }, true);
})();
