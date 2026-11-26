// Radar de Oportunidades: como o site "adequa" uma ideia do mural em melhoria.
// Tudo roda no navegador, sem servidor e sem enviar o texto a terceiros:
//   - classificar(texto): sugere a categoria pelas palavras-chave abaixo;
//   - parecidas(texto, ideias): acha ideias já registradas com palavras em comum;
//   - resumo(campos): escreve a ideia no formato "Como <quem>, quero <o quê>, porque <problema>".
// EDITE À VONTADE as palavras-chave (sem acento, em minúsculas). Os valores das
// categorias e dos status são os mesmos de firestore.rules.
"use strict";
window.RADAR_IDEIAS = (() => {
  const CATEGORIAS = {
    fonte: { rotulo: "Nova fonte", dica: "Incluir site, instituição, associação ou programa",
             palavras: ["fonte", "site", "incluir", "adicionar", "acrescentar", "colocar", "associacao", "sociedade", "programa",
                        "universidade", "instituto", "fundacao", "prefeitura", "secretaria", "nova fonte", "outra fonte", "cnpq",
                        "capes", "fapeal", "finep", "ufal", "sbc", "anpec", "pos-graduacao", "mestrado", "doutorado"] },
    filtro: { rotulo: "Busca e filtros", dica: "Encontrar, filtrar, ordenar",
              palavras: ["filtro", "filtrar", "busca", "buscar", "pesquisa", "pesquisar", "procurar", "ordenar", "ordem",
                         "categoria", "area", "curso", "cursos", "campus", "separar", "encontrar", "achar", "so os", "so as"] },
    alerta: { rotulo: "Alertas e prazos", dica: "Avisos, notificações, calendário",
              palavras: ["alerta", "aviso", "avisar", "notificacao", "notificar", "lembrete", "lembrar", "email", "e-mail",
                         "whatsapp", "telegram", "calendario", "agenda", "prazo acabando", "vencer", "push"] },
    aparencia: { rotulo: "Aparência e uso", dica: "Telas, cores, textos, facilidade de uso",
                 palavras: ["cor", "cores", "tela", "layout", "visual", "design", "bonito", "feio", "tamanho", "letra", "botao",
                            "menu", "escuro", "modo noturno", "confuso", "dificil", "facil", "acessibilidade", "icone"] },
    erro: { rotulo: "Erro", dica: "Algo que não funciona como deveria",
            palavras: ["erro", "bug", "nao funciona", "nao abre", "nao carrega", "travou", "trava", "falha", "quebrado",
                       "problema ao", "nao consigo", "nao aparece", "sumiu", "lento", "demora"] },
    conta: { rotulo: "Conta e cadastro", dica: "Cadastro, login, perfil, privacidade",
             palavras: ["conta", "cadastro", "cadastrar", "login", "entrar", "senha", "perfil", "dados", "privacidade",
                        "excluir conta", "favorito", "acompanhar"] },
    conteudo: { rotulo: "Informação das oportunidades", dica: "Prazo, resumo, área ou tipo errados ou faltando",
                palavras: ["prazo errado", "data errada", "informacao", "resumo", "descricao", "detalhe", "valor", "requisito",
                           "encerrado", "aberto", "desatualizado", "classificacao", "tipo errado", "area errada"] },
    outro: { rotulo: "Outro", dica: "Qualquer outra ideia", palavras: [] },
  };
  const STATUS = {
    "recebida": "Recebida", "em-analise": "Em análise", "planejada": "Planejada", "feita": "Feita",
    "nao-sera-feita": "Não será feita", "duplicada": "Repetida",
  };
  // Palavras comuns que não ajudam a comparar ideias.
  const VAZIAS = new Set(("a o as os um uma uns umas de da do das dos em no na nos nas por para pra com sem que e ou " +
    "se ao aos como mais menos muito muita ter tem ser seria fosse poderia pode podia deveria deve quero queria gostaria " +
    "radar site app aplicativo isso esse essa este esta ele ela eu voce nao sim ja so tambem quando onde qual quais").split(" "));

  const norm = t => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const palavras = t => norm(t).match(/[a-z0-9]{3,}/g)?.filter(p => !VAZIAS.has(p)) || [];
  // Raiz aproximada para comparar ("filtrar"/"filtro" -> "filtr", "cursos"/"curso" -> "curso").
  const raizes = t => palavras(t).map(p => p.replace(/(es|s)$/, "").slice(0, 5));

  // Categoria com mais pontos de palavras-chave no texto; "erro" ganha empate (é o mais urgente).
  function classificar(texto) {
    const t = " " + norm(texto).replace(/[^a-z0-9-]+/g, " ") + " ";
    let melhor = "outro", pontos = 0;
    for (const [cat, c] of Object.entries(CATEGORIAS)) {
      // Expressões ("prazo errado") valem mais que palavras soltas ("capes").
      const n = c.palavras.filter(p => t.includes(" " + p + " ") || (p.length > 5 && t.includes(" " + p)))
        .reduce((soma, p) => soma + (p.includes(" ") ? 2 : 1), 0);
      if (n > pontos || (n === pontos && n > 0 && cat === "erro")) { melhor = cat; pontos = n; }
    }
    return melhor;
  }

  // Semelhança simples: proporção de palavras em comum (0 a 1).
  function semelhanca(a, b) {
    const A = new Set(raizes(a)), B = new Set(raizes(b));
    if (!A.size || !B.size) return 0;
    let comum = 0;
    for (const p of A) if (B.has(p)) comum++;
    return comum / Math.min(A.size, B.size);
  }
  function parecidas(texto, ideias, limite = 3) {
    if (palavras(texto).length < 2) return [];
    return ideias.map(i => ({ ideia: i, nota: semelhanca(texto, i.titulo + " " + i.problema + " " + (i.como_deveria || "")) }))
      .filter(x => x.nota >= 0.34)
      .sort((x, y) => y.nota - x.nota)
      .slice(0, limite)
      .map(x => x.ideia);
  }

  // "Como estudante de graduação, quero <como deveria>, porque <problema>."
  // Sem "como deveria": "Como …, preciso de uma solução para isto: <problema>."
  function resumo({ para_quem, problema, como_deveria }, rotulosQuem = {}) {
    const quem = para_quem === "todos" || !para_quem ? "pessoa que usa o Radar" : (rotulosQuem[para_quem] || para_quem).toLowerCase();
    const limpar = t => String(t || "").trim().replace(/\s+/g, " ").replace(/[.!;]+$/, "");
    const minuscula = t => t ? t.charAt(0).toLowerCase() + t.slice(1) : t;
    // "Quero/queria/gostaria de …" no começo do texto não se repete na frase.
    const semQuero = t => t.replace(/^(eu\s+)?(quero|queria|gostaria\s+de|gostaria\s+que|preciso\s+de|precisava\s+de)\s+/i, "");
    const como = semQuero(limpar(como_deveria)), prob = limpar(problema);
    // Sem "como deveria funcionar", a frase fala da necessidade (sem "quero que isso seja resolvido").
    // Se o próprio problema já é um pedido ("Quero ver só…"), ele vira o "quero".
    const pedido = !como && semQuero(prob) !== prob ? semQuero(prob) : "";
    const texto = como ? `Como ${quem}, quero ${minuscula(como)}, porque ${minuscula(prob)}.`
      : pedido ? `Como ${quem}, quero ${minuscula(pedido)}.`
      : `Como ${quem}, preciso de uma solução para isto: ${minuscula(prob)}.`;
    return texto.length > 600 ? texto.slice(0, 597) + "…" : texto;
  }

  return { CATEGORIAS, STATUS, classificar, parecidas, resumo, norm };
})();
