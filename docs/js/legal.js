// privacidade.html e termos.html: preenche o controlador a partir de conta-config.js.
// Sem controlador preenchido, o contato indicado são as issues do repositório público.
"use strict";
(() => {
  const cfg = window.RADAR_CONTA || {}, c = cfg.controlador || {}, fb = cfg.firebase || {};
  const CONTATO = "https://github.com/valbergregory/radar-oportunidades/issues";
  for (const e of document.querySelectorAll('[data-controlador="nome"]')) {
    e.textContent = c.nome || "o mantenedor do Radar de Oportunidades";
  }
  for (const e of document.querySelectorAll('[data-controlador="email"]')) {
    if (c.email) { e.textContent = c.email; e.href = "mailto:" + c.email; }
    else { e.textContent = "a página de contato do projeto"; e.href = CONTATO; e.rel = "noopener noreferrer"; }
  }
  const ativo = fb.apiKey && fb.projectId && fb.appId && fb.authDomain;
  for (const e of document.querySelectorAll("[data-sem-contas]")) e.hidden = !!ativo;
})();
