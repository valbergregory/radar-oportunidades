// Radar de Oportunidades: faixa "Versão de testes" e formulário "Dar sugestão",
// em todas as páginas. A sugestão é ANÔNIMA: vai para a coleção "sugestoes" do
// Firestore (só escrita; ninguém lê pelo site, só pelo console do Firebase),
// sem conta, e-mail ou identificador da pessoa. Ver firestore.rules.
//
// Para tirar a faixa quando a fase de testes acabar: FAIXA_TESTES = false.
"use strict";
(() => {
  const FAIXA_TESTES = true;
  const MODULO_FIREBASE = new URL("firebase.js", document.currentScript.src).href;
  const TIPOS = { ideia: "Ideia", problema: "Problema", elogio: "Elogio", outro: "Outro" };
  if (!FAIXA_TESTES) return;

  // Lido na hora do clique: no index, conta-config.js é carregado depois deste arquivo.
  function podeEnviar() {
    const fb = (window.RADAR_CONTA || {}).firebase || {};
    return !!(fb.apiKey && fb.projectId && fb.appId && fb.authDomain);
  }

  function criar(tag, atributos = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(atributos)) {
      if (v == null || v === false) continue;
      if (k === "texto") e.textContent = v; else e.setAttribute(k, v === true ? "" : v);
    }
    e.append(...filhos.filter(f => f != null && f !== false));
    return e;
  }

  // ---- faixa no topo
  const abrir = criar("button", { type: "button", class: "faixa-botao", "aria-haspopup": "dialog", texto: "Dar sugestão" });
  const faixa = criar("div", { class: "faixa-testes", role: "region", "aria-label": "Versão de testes" },
    criar("span", { texto: "Versão de testes (nome provisório). Novas fontes toda semana. Sua opinião ajuda a melhorar o Radar." }), abrir);
  document.body.prepend(faixa);

  // ---- formulário (diálogo)
  const opcoes = (nome, valores, obrigatorio) => Object.entries(valores).map(([v, r], n) =>
    criar("label", { class: "chip-check" }, criar("input", { type: "radio", name: nome, value: v, required: obrigatorio && n === 0 }), r));
  const texto = criar("textarea", { name: "texto", id: "sugestao-texto", required: true, minlength: "3", maxlength: "2000", rows: "5",
    placeholder: "O que você achou? O que faltou? Encontrou algum problema?" });
  const contador = criar("span", { class: "areas", "aria-live": "polite", texto: "0/2000" });
  const enviar = criar("button", { type: "submit", class: "botao botao-primario", texto: "Enviar sugestão" });
  const fechar = criar("button", { type: "button", class: "botao botao-secundario", texto: "Fechar" });
  const status = criar("p", { class: "sugestao-status", role: "status", hidden: true });
  const form = criar("form", { class: "form", method: "dialog", novalidate: false },
    criar("h2", { id: "sugestao-titulo", texto: "Sua opinião sobre o Radar" }),
    criar("p", { class: "areas", texto: "É anônimo: não guardamos sua conta, e-mail nem outro dado seu. Por isso, não escreva nome, telefone ou e-mail no texto." }),
    criar("fieldset", { class: "chips-escolha" }, criar("legend", { texto: "É sobre" }), ...opcoes("tipo", TIPOS, true)),
    criar("fieldset", { class: "chips-escolha" }, criar("legend", { texto: "Que nota você dá ao Radar? (opcional)" }),
      ...opcoes("nota", { 1: "1", 2: "2", 3: "3", 4: "4", 5: "5" }, false)),
    criar("label", { class: "campo", for: "sugestao-texto" }, "Conte para a gente", texto, contador),
    status,
    criar("div", { class: "acoes" }, enviar, fechar));
  const dialogo = criar("dialog", { class: "dialogo-sugestao", "aria-labelledby": "sugestao-titulo" }, form);
  document.body.append(dialogo);

  texto.addEventListener("input", () => { contador.textContent = texto.value.length + "/2000"; });
  abrir.addEventListener("click", () => {
    const pode = podeEnviar();
    status.hidden = true; enviar.disabled = !pode;
    if (!pode) mostrar("O envio de sugestões ainda não está disponível.", false);
    dialogo.showModal();
    form.querySelector("input[name=tipo]").focus();
  });
  fechar.addEventListener("click", () => dialogo.close());

  function mostrar(msg, ok) {
    status.textContent = msg;
    status.className = "sugestao-status msg" + (ok ? " ok" : "");
    status.hidden = false;
  }

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (!form.reportValidity()) return;
    const d = new FormData(form);
    const instalado = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const campos = {
      tipo: d.get("tipo"),
      texto: texto.value.trim(),
      nota: d.get("nota") ? Number(d.get("nota")) : null,
      pagina: location.pathname.split("/").pop() || "index.html",
      dispositivo: matchMedia("(max-width: 899px)").matches ? "celular" : "computador",
      instalado,
    };
    if (campos.texto.length < 3) { texto.focus(); return; }
    enviar.disabled = true; enviar.textContent = "Enviando…";
    try {
      const FB = await import(MODULO_FIREBASE);
      await FB.enviarSugestao(campos);
      form.reset(); contador.textContent = "0/2000";
      mostrar("Obrigado! Sua sugestão foi enviada.", true);
    } catch (e) {
      mostrar(navigator.onLine === false ? "Sem conexão. Tente de novo quando estiver on-line."
                                         : "Não foi possível enviar agora. Tente de novo em instantes.", false);
    } finally {
      enviar.disabled = false; enviar.textContent = "Enviar sugestão";
    }
  });
})();
