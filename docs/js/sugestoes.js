// Radar de Oportunidades: sugestão automática de filtros pelo perfil (um ou mais vínculos).
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
  const versao = "2";

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

  // Mais de um vínculo (ex.: estudante de pós e docente): junta as sugestões de
  // cada um. Sem vínculo conhecido, vale o padrão. Sem estado informado não há
  // como saber o que é "estadual" ou "regional": a sugestão troca esses dois por
  // "nacional".
  const ORDEM = padrao.tipos.concat(["estadual", "regional", "nacional", "internacional", "pt", "en", "es", "outro"]);
  const ordenar = l => [...new Set(l)].sort((a, b) => ORDEM.indexOf(a) - ORDEM.indexOf(b));
  function calcular(vinculos, uf) {
    const lista = (Array.isArray(vinculos) ? vinculos : [vinculos]).map(v => porVinculo[v]).filter(Boolean);
    const bases = lista.length ? lista : [padrao];
    const juntar = campo => ordenar(bases.flatMap(b => b[campo]));
    let alcances = juntar("alcances");
    if (!uf || uf === "nao-informado") {
      alcances = alcances.filter(a => a !== "estadual" && a !== "regional");
      if (!alcances.includes("nacional")) alcances = ordenar(alcances.concat("nacional"));
    }
    return { tipos: juntar("tipos"), alcances, idiomas: juntar("idiomas"), versao };
  }

  return { versao, porVinculo, padrao, calcular };
})();
