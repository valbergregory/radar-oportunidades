// privacidade.html e termos.html: preenche o controlador a partir de conta-config.js.
"use strict";
(() => {
  const c = (window.RADAR_CONTA || {}).controlador || {};
  const cfg = window.RADAR_CONTA || {};
  for (const e of document.querySelectorAll('[data-controlador="nome"]')) if (c.nome) e.textContent = c.nome;
  for (const e of document.querySelectorAll('[data-controlador="email"]')) {
    if (c.email) { e.textContent = c.email; e.href = "mailto:" + c.email; }
    else e.removeAttribute("href");
  }
  const ativo = cfg.url && cfg.chavePublicavel && c.nome && c.email;
  for (const e of document.querySelectorAll("[data-sem-contas]")) e.hidden = !!ativo;
})();
