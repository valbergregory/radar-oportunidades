// Radar de Oportunidades: sugestão automática de filtros pelo perfil.
// EDITE À VONTADE: cada vínculo sugere tipos, alcances e idiomas. Ao mudar as
// tabelas, aumente "versao": o site registra no perfil qual versão foi usada
// (sugestao_aplicada), mas nunca troca escolhas que a pessoa já fez.
//
// Valores válidos (os mesmos de firestore.rules):
//   tipos:     fomento, bolsa, pos-graduacao, evento, concurso-vaga, estagio, emprego, competicao
//   alcances:  estadual, regional, nacional, internacional
//   idiomas:   pt, en, es, outro
"use strict";
window.RADAR_SUGESTOES = (() => {
  const versao = "1";

  const porVinculo = {
    "estudante-graduacao": {
      tipos: ["bolsa", "estagio", "evento", "pos-graduacao", "competicao"],
      alcances: ["estadual", "regional", "nacional"],
      idiomas: ["pt"],
    },
    "estudante-pos": {
      tipos: ["bolsa", "evento", "pos-graduacao", "fomento", "competicao"],
      alcances: ["estadual", "regional", "nacional", "internacional"],
      idiomas: ["pt", "en"],
    },
    "estudante-medio-tecnico": {
      tipos: ["bolsa", "estagio", "competicao", "evento"],
      alcances: ["estadual", "regional"],
      idiomas: ["pt"],
    },
    "docente": {
      tipos: ["fomento", "bolsa", "evento"],
      alcances: ["estadual", "regional", "nacional", "internacional"],
      idiomas: ["pt", "en"],
    },
    "pesquisador": {
      tipos: ["fomento", "bolsa", "evento"],
      alcances: ["estadual", "regional", "nacional", "internacional"],
      idiomas: ["pt", "en"],
    },
    "tecnico-administrativo": {
      tipos: ["pos-graduacao", "evento", "concurso-vaga", "bolsa"],
      alcances: ["estadual", "regional", "nacional"],
      idiomas: ["pt"],
    },
    "egresso": {
      tipos: ["pos-graduacao", "concurso-vaga", "emprego", "estagio"],
      alcances: ["estadual", "regional", "nacional"],
      idiomas: ["pt"],
    },
    "comunidade": {
      tipos: ["evento", "concurso-vaga", "emprego", "competicao"],
      alcances: ["estadual", "regional"],
      idiomas: ["pt"],
    },
  };

  // Para "outro", "prefiro não informar" ou vínculo vazio.
  const padrao = {
    tipos: ["fomento", "bolsa", "pos-graduacao", "evento", "concurso-vaga", "estagio", "emprego", "competicao"],
    alcances: ["estadual", "regional", "nacional"],
    idiomas: ["pt"],
  };

  // Sem estado informado não há como saber o que é "estadual" ou "regional":
  // a sugestão troca esses dois por "nacional".
  function calcular(vinculo, uf) {
    const base = porVinculo[vinculo] || padrao;
    let alcances = base.alcances.slice();
    if (!uf || uf === "nao-informado") {
      alcances = alcances.filter(a => a !== "estadual" && a !== "regional");
      if (!alcances.includes("nacional")) alcances.unshift("nacional");
    }
    return { tipos: base.tipos.slice(), alcances, idiomas: base.idiomas.slice(), versao };
  }

  return { versao, porVinculo, padrao, calcular };
})();
