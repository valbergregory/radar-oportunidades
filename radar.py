#!/usr/bin/env python3
"""Radar de Oportunidades.

Coleta editais, seleções, eventos e vagas em fontes públicas, classifica por
área e tipo, guarda em SQLite e gera site, rascunho de newsletter e calendário.

Uso:
    python radar.py coletar
    python radar.py gerar --perfil valber
    python radar.py tudo --perfil valber
"""
import argparse
import datetime as dt
import hashlib
import html
import io
import json
import logging
import os
import re
import sqlite3
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urlparse

import feedparser
import requests
import yaml
from bs4 import BeautifulSoup

try:  # opcional: sem ele, os PDFs dos editais não são lidos
    from pypdf import PdfReader
    logging.getLogger("pypdf").setLevel(logging.ERROR)
except ImportError:
    PdfReader = None

RAIZ = Path(__file__).resolve().parent
DB = RAIZ / "dados" / "radar.db"
DOCS = RAIZ / "docs"
SAIDA = RAIZ / "saida"
UA = {  # alguns portais (gov.br) recusam clientes que não se parecem com navegador
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0 Safari/537.36 RadarOportunidades/0.2",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9",
}
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
# 20/11/2026, 20/11/26, 20.11.2026, 20 de novembro de 2026, 20 de nov. de 2026, 27 de abril 2026
DATA = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})\b|"
                  r"\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b|"
                  r"\b(\d{1,2})o? de (" + "|".join(MESES) + r")[a-z]*\.?,?(?: de)? (\d{4})\b")
HOJE = dt.date.today()
# Uma data só vale como prazo se o trecho entre ela e a data anterior tiver um
# destes termos. Datas de "publicado em" ou "atualizado em" não são prazo.
PRAZO_FORTE = re.compile(r"inscric|submiss|envio d|recebimento d|data[- ]limite")
PRAZO_FRACO = re.compile(r"prazo|\bate\b|encerra|termino")
OUTRA_ETAPA = re.compile(r"resultad|recurso|homolog|divulg|julgament|contrat|vigenc|execu|"
                         r"analise|avaliac|entrevist|matricul|pagament")
# O que liga as duas pontas de um período: "10/11/2026 a 20/11/2026",
# "24 de agosto de 2026 até as 18h do dia 17 de fevereiro de 2027" e, em
# cronogramas em tabela, só o espaço entre as colunas: "13/11/2026 04/12/2026".
CONTINUA = re.compile(r"\s*(?:,?\s*(?:a|ate|e|ao|-)\s+(?:(?:as\s+)?\d{1,2}h\d{0,2}(?:min)?\s+"
                      r"(?:de|do dia)\s+|o dia\s+|do dia\s+)?)?")
SUFIXO = re.compile(r"\s*[-–]\s*(alterac|retificac|errata|prorrogac|republicac)\w*.*$")
NAO_PRAZO = re.compile(r"(publicad|atualizad|divulgad|postad)\w*( em)?[^0-9]{0,25}$")
ANO = re.compile(r"\b(20\d{2})\b")
# Documentos anexos ao edital: os que podem trazer o prazo e os que indicam que
# as inscrições já acabaram (comparados sem acento, em minúsculas).
DOC_EDITAL = re.compile(r"edital|chamada|retifica|prorroga|errata|cronograma|alterac")
DOC_ENCERRADO = re.compile(r"resultado|homologac|encerrament|classificac|convocac|"
                           r"recursos esgotados")
VERSAO_LEITURA = 2  # suba quando a leitura dos editais melhorar: tudo é relido
RELER_APOS_DIAS = 7  # itens sem prazo são relidos (pode surgir prorrogação ou resultado)

# Usado quando a fonte não define "padrao_link": o texto do link precisa
# parecer uma oportunidade.
GERAL = re.compile(
    r"edital|chamada|selecao|processo seletivo|inscric|bolsa|concurso|"
    r"congresso|simposio|seminario|call for papers|mestrado|doutorado|vaga"
)

TIPOS = [  # a ordem importa, vale o primeiro que casar
    ("evento", r"congresso|simposio|seminario|workshop|call for papers|"
               r"submissao de (trabalhos|artigos)|jornada|\bencontro\b|"
               r"comunicacao oral|poster"),
    ("concurso-vaga", r"concurso|professor substituto|\bvagas?\b|estagio|trainee|"
                      r"remocao|redistribuicao|processo seletivo interno"),
    ("pos-graduacao", r"mestrado|doutorado|pos-graduacao|aluno (regular|especial)"),
    ("bolsa", r"\bbolsas?\b|bolsista|\bmonitor(es|a|as|ia)?\b|\binstrutor|\btutor"),
    ("fomento", r"edital|chamada|fomento|auxilio|subvencao|premio"),
]


def norm(texto):
    """Minúsculas sem acento, para comparar palavras-chave."""
    return unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()


def limpar(texto):
    return " ".join((texto or "").split())


# ----------------------------------------------------------------- coleta

def baixar(url, tentativas=3, aceita=None):
    """Baixa a página. O gov.br às vezes derruba a conexão: tenta de novo."""
    if url.startswith("file:"):  # usado nos testes locais
        return (RAIZ / url[5:]).read_bytes()
    for n in range(tentativas):
        try:
            r = requests.get(url, headers=dict(UA, Accept=aceita) if aceita else UA,
                             timeout=25)
            r.raise_for_status()
            return r.content
        except requests.RequestException:
            if n == tentativas - 1:
                raise
            time.sleep(5 * (n + 1))


def titulo_do_cartao(a):
    """Para links do tipo "Acessar": usa o título (h1 a h5) do cartão em volta."""
    no = a.parent
    for _ in range(6):
        if no is None:
            break
        for h in no.find_all(["h1", "h2", "h3", "h4", "h5"]):
            texto = limpar(h.get_text(" "))
            if len(texto) >= 20:
                return texto
        no = no.parent
    return ""


def coletar_html(fonte):
    sopa = BeautifulSoup(baixar(fonte["url"]), "html.parser")
    padrao = fonte.get("padrao_link")
    candidatos = {}  # link -> (âncora, título)
    for a in sopa.find_all("a", href=True):
        titulo = limpar(a.get_text(" "))
        link = urljoin(fonte["url"], a["href"]).split("#")[0]
        if padrao and len(titulo) < 20 and re.search(padrao, link):
            titulo = titulo_do_cartao(a)
        if len(titulo) < 20 or link in candidatos:
            continue
        if padrao:
            if not re.search(padrao, link):
                continue
        elif not GERAL.search(norm(titulo)):
            continue
        candidatos[link] = (a, titulo)
    ancoras = {id(a) for a, _ in candidatos.values()}
    itens = []
    for link, (a, titulo) in candidatos.items():
        # Contexto: sobe na árvore para pegar a linha de "Inscrições: ... a ...",
        # mas para antes de alcançar um bloco que contenha outra oportunidade.
        contexto, no = titulo, a.parent
        for _ in range(4):
            if no is None:
                break
            bloco = limpar(no.get_text(" "))
            outras = any(id(x) in ancoras and x is not a for x in no.find_all("a", href=True))
            if len(bloco) > 600 or outras:
                break
            contexto, no = bloco, no.parent
        itens.append({"titulo": titulo, "link": link, "contexto": contexto})
    return itens


def coletar_rss(fonte):
    feed = feedparser.parse(baixar(fonte["url"]))
    if feed.bozo and not feed.entries:
        raise RuntimeError(f"feed ilegível: {feed.bozo_exception}")
    itens = []
    for e in feed.entries:
        resumo = BeautifulSoup(e.get("summary", ""), "html.parser").get_text(" ")
        quando = e.get("published_parsed") or e.get("updated_parsed")
        itens.append({"titulo": limpar(e.get("title")), "link": e.get("link"),
                      "contexto": limpar(e.get("title", "") + " " + resumo)[:600],
                      "publicado": time.strftime("%Y-%m-%d", quando) if quando else ""})
    return [i for i in itens if i["titulo"] and i["link"]]


def coletar_plone(fonte):
    """Sites Plone com API aberta (ex.: editais.ufal.br). A url é a da busca
    "++api++/@search", que devolve JSON com título, endereço e data de publicação."""
    dados = json.loads(baixar(fonte["url"], aceita="application/json"))
    itens = []
    for i in dados.get("items", []):
        titulo, descricao = limpar(i.get("title")), limpar(i.get("description"))
        pub = (i.get("effective") or "")[:10]
        partes = [titulo, descricao if descricao != titulo else "",
                  f"Publicado em {pub[8:10]}/{pub[5:7]}/{pub[:4]}" if pub else ""]
        itens.append({"titulo": titulo, "link": i.get("@id"), "publicado": pub,
                      "contexto": " ".join(p for p in partes if p)[:600]})
    return [i for i in itens if len(i["titulo"]) >= 10 and i["link"]]


_aviso_pdf = []


def texto_pdf(bruto, paginas=30):
    """Texto das primeiras páginas de um PDF; vazio se não der para ler."""
    if PdfReader is None:
        if not _aviso_pdf:
            print("aviso: pypdf não instalado, PDFs dos editais não serão lidos "
                  "(pip install -r requirements.txt)", file=sys.stderr)
            _aviso_pdf.append(1)
        return ""
    try:
        leitor = PdfReader(io.BytesIO(bruto))
        return limpar(" ".join(p.extract_text() or "" for p in leitor.pages[:paginas]))
    except Exception:  # PDF corrompido, protegido ou só com imagem
        return ""


def detalhar(link, plone=False):
    """Lê a página do edital. Devolve {"texto", "documentos": [(título, endereço)]},
    em que documentos são os arquivos anexos; None se a página não abrir."""
    if plone:
        return detalhar_plone(link)
    vazio = {"texto": "", "documentos": []}
    if re.search(r"\.(docx?|xlsx?|odt|zip)$", link.split("?")[0], re.I):
        return vazio
    try:
        bruto = baixar(link, tentativas=1)
    except Exception:
        return None
    if bruto[:5] == b"%PDF-":
        return {"texto": texto_pdf(bruto), "documentos": []}
    sopa = BeautifulSoup(bruto, "html.parser")
    for lixo in sopa(["script", "style", "nav", "header", "footer", "aside", "form"]):
        lixo.decompose()
    no = next((n for n in map(sopa.select_one, ("main article", "article", "#content", "main"))
               if n and len(n.get_text(" ", strip=True)) > 200), None)
    if no is None:
        no = sopa.select_one("main") or sopa.select_one("article") or sopa
        texto = ""
    else:
        texto = limpar(no.get_text(" "))[:20000]
    documentos = [(limpar(a.get_text(" ")), urljoin(link, a["href"]))
                  for a in no.find_all("a", href=True)
                  if re.search(r"\.pdf\b|display-file|@@download", a["href"], re.I)]
    return {"texto": texto, "documentos": documentos}


def detalhar_plone(link):
    """Editais em sites Plone (ex.: editais.ufal.br) pela API: a página é montada
    por JavaScript, mas a API traz descrição e a lista de arquivos (edital,
    retificações, resultados), cada um com título e descrição."""
    api = re.sub(r"^(https?://[^/]+)/", r"\1/++api++/", link)
    try:
        dados = json.loads(baixar(api, tentativas=1, aceita="application/json"))
    except Exception:
        return None
    partes, documentos = [dados.get("title"), dados.get("description")], []
    for item in dados.get("items", []):
        partes += [item.get("title"), item.get("description")]
        documentos.append((limpar(item.get("title")), item["@id"] + "/@@download/file"))
    # ". " separa as partes: a data de um arquivo não se mistura com o título do próximo
    return {"texto": ". ".join(limpar(p) for p in partes if p), "documentos": documentos}


def ler_documentos(documentos, maximo=3):
    """Texto dos PDFs de edital, retificação ou prorrogação anexos à página. Se
    nenhum título parece edital (na UFAL o arquivo costuma ter o nome da seleção),
    lê o primeiro anexo que não seja resultado."""
    escolhidos = [d for d in documentos if DOC_EDITAL.search(norm(d[0]))][:maximo]
    if not escolhidos:
        escolhidos = [d for d in documentos if not DOC_ENCERRADO.search(norm(d[0]))][:1]
    textos = []
    for titulo, url in escolhidos:
        try:
            bruto = baixar(url, tentativas=1)
        except Exception:
            continue
        if bruto[:5] == b"%PDF-":
            textos.append(texto_pdf(bruto))
    return ". ".join(t for t in textos if t)


def montar_data(grupos):
    d, m, a, d2, m2, a2, d3, mes, a3 = grupos
    try:
        if d:
            return dt.date(int(a) + (2000 if len(a) == 2 else 0), int(m), int(d))
        if d2:
            return dt.date(int(a2), int(m2), int(d2))
        return dt.date(int(a3), MESES.index(mes) + 1, int(d3))
    except ValueError:
        return None


def rotulo_do_trecho(trecho):
    """"forte", "fraco" ou None para o texto que antecede uma data. Olha só a
    última oração: em "resultado da análise de currículo e inscrição. 19/11" a
    data é de resultado, não de inscrição."""
    if NAO_PRAZO.search(trecho):
        return None
    oracao = re.split(r"[.;]\s", trecho.rstrip(" .:;-"))[-1]
    if OUTRA_ETAPA.search(oracao):
        return None
    if PRAZO_FORTE.search(oracao):
        return "forte"
    if PRAZO_FRACO.search(oracao):
        return "fraco"
    return None


def extrair_prazo(contexto):
    """Maior data ligada a inscrição ou submissão; na falta, a "prazo" ou "até".
    Datas de publicação não contam. É uma estimativa: confira no edital."""
    texto, achadas = norm(contexto), {"forte": [], "fraco": []}
    fim_anterior, rotulo_anterior = None, None
    for achado in DATA.finditer(texto):
        data = montar_data(achado.groups())
        if fim_anterior is not None and CONTINUA.fullmatch(texto[fim_anterior:achado.start()]):
            rotulo = rotulo_anterior  # segunda ponta de um período
        else:
            inicio = achado.start() - 90
            if fim_anterior is not None:
                inicio = max(inicio, fim_anterior)
            rotulo = rotulo_do_trecho(texto[max(0, inicio):achado.start()])
        if data and rotulo:
            achadas[rotulo].append(data)
        fim_anterior, rotulo_anterior = achado.end(), rotulo
    datas = achadas["forte"] or achadas["fraco"]
    return max(datas).isoformat() if datas else None


def antigo(titulo, prazo, link=""):
    """Sem prazo conhecido e com ano anterior no título (ex.: "Edital 02/2023")
    ou no endereço (ex.: ".../2024/02/...")."""
    anos = [int(x) for x in ANO.findall(titulo or "")]
    anos += [int(x) for x in re.findall(r"/(20\d{2})/\d{2}/", link or "")]
    return not prazo and bool(anos) and max(anos) < HOJE.year


def classificar_tipo(texto, padrao_fonte=None):
    for tipo, regex in TIPOS:
        if re.search(regex, texto):
            return tipo
    return padrao_fonte or "fomento"


def classificar_areas(texto, areas):
    achadas = [slug for slug, a in areas.items()
               if any(re.search(r"\b" + re.escape(norm(t)) + r"\b", texto) for t in a["termos"])]
    return achadas or ["geral"]  # sem área específica = interessa a todos


# ------------------------------------------------------------------ banco

def abrir_db():
    DB.parent.mkdir(exist_ok=True)
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    con.execute("""CREATE TABLE IF NOT EXISTS oportunidades (
        id TEXT PRIMARY KEY, fonte TEXT, titulo TEXT, link TEXT, contexto TEXT,
        tipo TEXT, areas TEXT, prazo TEXT, coletado_em TEXT)""")
    colunas = [c[1] for c in con.execute("PRAGMA table_info(oportunidades)")]
    # detalhe: versão da leitura da página do edital (ver enriquecer);
    # encerrado: 1 quando a página já traz resultado ou encerramento e não há prazo;
    # lido_em: data da última leitura da página.
    for nome, tipo in [("detalhe", "INTEGER"), ("encerrado", "INTEGER"), ("lido_em", "TEXT")]:
        if nome not in colunas:
            con.execute(f"ALTER TABLE oportunidades ADD COLUMN {nome} {tipo}")
    con.execute("CREATE TABLE IF NOT EXISTS fontes (nome TEXT PRIMARY KEY, falhas INTEGER)")
    return con


def registrar(con, nome, deu_certo):
    """Conta as falhas seguidas de cada fonte. Devolve o total atual."""
    atual = con.execute("SELECT falhas FROM fontes WHERE nome=?", (nome,)).fetchone()
    falhas = 0 if deu_certo else (atual["falhas"] if atual else 0) + 1
    con.execute("INSERT OR REPLACE INTO fontes VALUES (?, ?)", (nome, falhas))
    return falhas


def enriquecer(con, areas, hosts_plone=(), limite=60):
    """Abre a página de cada edital para achar prazo, área e se já encerrou. Se a
    página não traz o prazo, lê os PDFs de edital e retificação anexos.
    Coluna detalhe: VERSAO_LEITURA = lida pela versão atual; valores menores
    (inclusive 0 a -4, falhas) são lidos de novo. Itens abertos sem prazo são
    relidos a cada RELER_APOS_DIAS dias."""
    reler = (HOJE - dt.timedelta(days=RELER_APOS_DIAS)).isoformat()
    linhas = con.execute(
        "SELECT * FROM oportunidades WHERE (encerrado IS NULL OR encerrado = 0) "
        "AND (prazo IS NULL OR prazo >= ?) "
        "AND (detalhe IS NULL OR detalhe BETWEEN -4 AND ? "
        "     OR (prazo IS NULL AND (lido_em IS NULL OR lido_em <= ?))) "
        "ORDER BY detalhe IS NOT NULL, coletado_em DESC LIMIT ?",
        (HOJE.isoformat(), VERSAO_LEITURA - 1, reler, limite)).fetchall()
    lidas, com_prazo, encerradas, fora = 0, 0, 0, {}  # fora: falhas seguidas por site
    for l in linhas:
        site = urlparse(l["link"]).netloc
        if fora.get(site, 0) >= 2:  # site recusando conexão: fica para a próxima
            continue
        pagina = detalhar(l["link"], plone=site in hosts_plone)
        if pagina is None:
            fora[site] = fora.get(site, 0) + 1
            con.execute("UPDATE oportunidades SET detalhe=? WHERE id=?",
                        (min(l["detalhe"] or 0, 0) - 1, l["id"]))
            continue
        fora[site], lidas = 0, lidas + 1
        texto = l["contexto"] + ". " + pagina["texto"]
        prazo = extrair_prazo(texto)
        if not prazo:
            prazo = extrair_prazo(texto + ". " + ler_documentos(pagina["documentos"]))
        encerrado = int(not prazo and any(DOC_ENCERRADO.search(norm(t))
                                          for t, _ in pagina["documentos"]))
        com_prazo, encerradas = com_prazo + bool(prazo), encerradas + encerrado
        resumo = norm(l["titulo"] + " " + l["contexto"] + " " + pagina["texto"][:800])
        con.execute(
            "UPDATE oportunidades SET prazo=?, areas=?, tipo=?, detalhe=?, encerrado=?, "
            "lido_em=? WHERE id=?",
            (prazo, json.dumps(classificar_areas(resumo, areas)),
             classificar_tipo(norm(l["titulo"]), l["tipo"]), VERSAO_LEITURA, encerrado,
             HOJE.isoformat(), l["id"]))
        con.commit()  # uma página por vez: uma interrupção não perde o que já foi lido
        time.sleep(0.5)
    print(f"detalhes: {lidas} páginas lidas de {len(linhas)} pendentes "
          f"({com_prazo} com prazo, {encerradas} já encerradas)")


def hosts_plone(cfg_fontes):
    return {urlparse(f["url"]).netloc for f in cfg_fontes if f.get("formato") == "plone"}


def coletar(cfg_fontes, areas):
    con, novos, falhas, persistentes = abrir_db(), [], [], []
    for fonte in cfg_fontes:
        if not fonte.get("ativa", True):
            continue
        try:
            coletor = {"rss": coletar_rss, "plone": coletar_plone}.get(
                fonte.get("formato"), coletar_html)
            itens = coletor(fonte)
            if not itens:
                raise RuntimeError("nenhum item encontrado (o layout pode ter mudado)")
        except Exception as erro:  # uma fonte fora do ar não derruba as outras
            seguidas = registrar(con, fonte["nome"], False)
            falhas.append(f"{fonte['nome']} ({seguidas}ª falha seguida): {erro}")
            if seguidas >= 3:
                persistentes.append(fonte["nome"])
            continue
        registrar(con, fonte["nome"], True)
        ignorar = fonte.get("ignorar")  # regex de títulos a descartar (sem acento)
        corte = (HOJE - dt.timedelta(days=fonte.get("dias_max", 180))).isoformat()
        for item in itens:
            if ignorar and re.search(ignorar, norm(item["titulo"])):
                continue
            if item.get("publicado") and item["publicado"] < corte:
                continue  # publicado há mais de "dias_max" dias
            texto = norm(item["titulo"] + " " + item["contexto"])
            reg = {
                "id": hashlib.sha1(item["link"].encode()).hexdigest()[:16],
                "fonte": fonte["nome"], "titulo": item["titulo"], "link": item["link"],
                "contexto": item["contexto"],
                "tipo": classificar_tipo(norm(item["titulo"]), fonte.get("tipo_padrao")),
                "areas": json.dumps(classificar_areas(texto, areas)),
                "prazo": extrair_prazo(item["contexto"]),
                "coletado_em": HOJE.isoformat(),
            }
            if antigo(reg["titulo"], reg["prazo"], reg["link"]):
                continue
            cur = con.execute(
                "INSERT OR IGNORE INTO oportunidades "
                "(id,fonte,titulo,link,contexto,tipo,areas,prazo,coletado_em) VALUES "
                "(:id,:fonte,:titulo,:link,:contexto,:tipo,:areas,:prazo,:coletado_em)", reg)
            if cur.rowcount:
                novos.append(reg)
        print(f"ok   {fonte['nome']}: {len(itens)} itens")
    con.commit()
    enriquecer(con, areas, hosts_plone(cfg_fontes))
    for f in falhas:
        print(f"FALHA {f}", file=sys.stderr)
    SAIDA.mkdir(exist_ok=True)
    (SAIDA / "falhas.txt").write_text("\n".join(falhas), encoding="utf-8")
    print(f"{len(novos)} oportunidades novas, {len(falhas)} fontes com falha "
          f"({len(persistentes)} há 3 execuções ou mais)")
    return novos, persistentes


def abertas(con):
    """Tudo que não tem prazo conhecido ou cujo prazo ainda não venceu, menos o
    que a página do edital já mostra como encerrado."""
    linhas = con.execute(
        "SELECT * FROM oportunidades WHERE (prazo IS NULL OR prazo >= ?) "
        "AND (encerrado IS NULL OR encerrado = 0) "
        "ORDER BY prazo IS NULL, prazo, coletado_em DESC", (HOJE.isoformat(),))
    unicos = {}  # retificações ("... - Alteração") contam como o mesmo edital
    for l in linhas:
        if antigo(l["titulo"], l["prazo"], l["link"]):
            continue
        chave = (l["fonte"], SUFIXO.sub("", norm(l["titulo"])).strip())
        if chave not in unicos or len(l["titulo"]) < len(unicos[chave]["titulo"]):
            unicos[chave] = l
    return [dict(l, areas=json.loads(l["areas"])) for l in unicos.values()]


# ----------------------------------------------------------------- saídas

def br(iso):
    return dt.date.fromisoformat(iso).strftime("%d/%m/%Y") if iso else "prazo não identificado"


def gerar_newsletter(itens, areas, perfil, escolhidas, dias_novo=7, dias_prazo=21):
    quer = set(escolhidas) | {"geral"}
    meus = [i for i in itens if quer & set(i["areas"])]
    corte = (HOJE - dt.timedelta(days=dias_novo)).isoformat()
    limite = (HOJE + dt.timedelta(days=dias_prazo)).isoformat()
    novos = [i for i in meus if i["coletado_em"] >= corte]
    urgentes = [i for i in meus if i["prazo"] and i["prazo"] <= limite]
    nomes = ", ".join(areas[a]["nome"] for a in escolhidas if a in areas)

    def linha(i):
        return f"- **{i['titulo']}** ({i['fonte']}, {br(i['prazo'])})  \n  {i['link']}"

    partes = [f"# Radar de Oportunidades, edição de {HOJE.strftime('%d/%m/%Y')}", "",
              f"Áreas desta edição: {nomes}.", "",
              "> Rascunho gerado automaticamente. Os prazos são estimados a partir da",
              "> página de origem e devem ser conferidos no edital antes de publicar.", "",
              f"## Prazos que vencem em até {dias_prazo} dias", ""]
    partes += [linha(i) for i in urgentes] or ["Nenhum prazo próximo identificado."]
    for tipo, titulo in [("fomento", "Fomento e editais"), ("bolsa", "Bolsas"),
                         ("pos-graduacao", "Mestrado e doutorado"),
                         ("evento", "Congressos e eventos"),
                         ("concurso-vaga", "Concursos e vagas")]:
        grupo = [i for i in novos if i["tipo"] == tipo]
        if grupo:
            partes += ["", f"## {titulo} (novidades)", ""] + [linha(i) for i in grupo]
    SAIDA.mkdir(exist_ok=True)
    destino = SAIDA / f"newsletter-{perfil}.md"
    destino.write_text("\n".join(partes) + "\n", encoding="utf-8")
    print(f"newsletter: {destino} ({len(novos)} novidades, {len(urgentes)} prazos próximos)")


def gerar_ics(itens):
    linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Radar de Oportunidades//PT-BR",
              "X-WR-CALNAME:Radar de Oportunidades (prazos)"]
    for i in itens:
        if not i["prazo"]:
            continue
        dia = i["prazo"].replace("-", "")
        fim = (dt.date.fromisoformat(i["prazo"]) + dt.timedelta(days=1)).strftime("%Y%m%d")
        titulo = i["titulo"].replace("\\", "").replace(",", "\\,").replace(";", "\\;")[:180]
        linhas += ["BEGIN:VEVENT", f"UID:{i['id']}@radar-oportunidades",
                   f"DTSTAMP:{HOJE.strftime('%Y%m%d')}T000000Z",
                   f"DTSTART;VALUE=DATE:{dia}", f"DTEND;VALUE=DATE:{fim}",
                   f"SUMMARY:Prazo: {titulo}", f"URL:{i['link']}", "END:VEVENT"]
    linhas.append("END:VCALENDAR")
    (DOCS / "prazos.ics").write_text("\r\n".join(linhas) + "\r\n", encoding="utf-8")


def config_app():
    """config/app.yaml: cadastro opcional. "cadastro" só vale True com controlador
    e Supabase preenchidos; sem isso, o app não mostra "Entrar"."""
    arquivo = RAIZ / "config" / "app.yaml"
    cfg = yaml.safe_load(arquivo.read_text(encoding="utf-8")) if arquivo.exists() else {}
    cfg = cfg or {}
    controlador = {k: str((cfg.get("controlador") or {}).get(k) or "").strip()
                   for k in ("nome", "email")}
    supabase = {k: str((cfg.get("supabase") or {}).get(k) or "").strip().rstrip("/")
                for k in ("url", "chave_publica")}
    priv = cfg.get("privacidade") or {}
    versao = str(priv.get("versao") or "1")
    regiao = str(priv.get("regiao_supabase") or "").strip()
    preenchidos = [*controlador.values(), *supabase.values()]
    if any(preenchidos) and not all(preenchidos):
        print("aviso: config/app.yaml incompleto; o cadastro fica desligado até "
              "controlador e Supabase estarem preenchidos", file=sys.stderr)
    if supabase["url"] and not supabase["url"].startswith("https://"):
        sys.exit("config/app.yaml: supabase.url precisa começar com https://")
    return {"cadastro": all(preenchidos), "controlador": controlador,
            "supabase": supabase, "versao": versao, "regiao": regiao}


def gerar_privacidade(app):
    """docs/privacidade.html a partir de modelo_privacidade.html e config/app.yaml."""
    texto = (RAIZ / "modelo_privacidade.html").read_text(encoding="utf-8")
    manter, remover = ("CADASTRO", "SEM_CADASTRO") if app["cadastro"] else ("SEM_CADASTRO", "CADASTRO")
    texto = re.sub(rf"\s*<!--SE_{remover}-->.*?<!--FIM_SE_{remover}-->", "", texto, flags=re.S)
    texto = re.sub(rf"\s*<!--(FIM_)?SE_{manter}-->", "", texto)
    if app["regiao"] == "sa-east-1":
        regiao = "Os dados ficam armazenados no Brasil (região de São Paulo do provedor)."
    else:
        regiao = ("Os dados ficam armazenados em servidores do provedor fora do Brasil "
                  f"(região {app['regiao'] or 'não informada'}). A transferência internacional "
                  "segue o art. 33 da LGPD, com as garantias contratuais do provedor.")
    for chave, valor in {"VERSAO": app["versao"], "TEXTO_REGIAO": regiao,
                         "CONTROLADOR_NOME": app["controlador"]["nome"],
                         "CONTROLADOR_EMAIL": app["controlador"]["email"]}.items():
        texto = texto.replace("{{" + chave + "}}", html.escape(valor))
    (DOCS / "privacidade.html").write_text(texto, encoding="utf-8")


def gerar_site(itens, areas):
    DOCS.mkdir(exist_ok=True)
    app = config_app()
    campos = ("titulo", "link", "fonte", "tipo", "areas", "prazo", "coletado_em")
    dados = json.dumps({
        "atualizado": HOJE.strftime("%d/%m/%Y"),
        "areas": {s: a["nome"] for s, a in areas.items()},
        "itens": [{k: i[k] for k in campos} for i in itens],
    }, ensure_ascii=False)
    # O aplicativo lê dados.json (atualizável pelo service worker); a cópia
    # embutida no HTML é a reserva quando o arquivo não pode ser lido.
    (DOCS / "dados.json").write_text(dados, encoding="utf-8")
    modelo = (RAIZ / "modelo_site.html").read_text(encoding="utf-8")
    embutido = dados.replace("</", "<\\/")
    config = json.dumps({  # só o que o navegador precisa; nada aqui é segredo
        "cadastro": app["cadastro"], "versao": app["versao"],
        "supabase": app["supabase"] if app["cadastro"] else None,
    }, ensure_ascii=False).replace("</", "<\\/")
    pagina = modelo.replace("/*DADOS*/null", embutido).replace("/*CONFIG*/null", config)
    (DOCS / "index.html").write_text(pagina, encoding="utf-8")
    gerar_privacidade(app)
    gerar_ics(itens)
    print(f"site: {DOCS / 'index.html'} ({len(itens)} oportunidades abertas)")


def avisar_telegram(novos):
    """Opcional: só envia se TELEGRAM_TOKEN e TELEGRAM_CHAT estiverem definidos."""
    token, chat = os.environ.get("TELEGRAM_TOKEN"), os.environ.get("TELEGRAM_CHAT")
    if not (token and chat and novos):
        return
    corpo = "\n\n".join(f"{n['titulo']}\n{br(n['prazo'])}\n{n['link']}" for n in novos[:10])
    if len(novos) > 10:
        corpo += f"\n\n… e mais {len(novos) - 10} no site."
    requests.post(f"https://api.telegram.org/bot{token}/sendMessage", timeout=30,
                  data={"chat_id": chat, "text": "Novas oportunidades\n\n" + corpo,
                        "disable_web_page_preview": "true"})


# ------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(description="Radar de Oportunidades")
    ap.add_argument("comando", choices=["coletar", "detalhar", "gerar", "tudo"],
                    help="detalhar: só relê as páginas dos editais pendentes")
    ap.add_argument("--limite", type=int, default=60,
                    help="máximo de páginas de edital lidas por execução")
    ap.add_argument("--perfil", default="valber", help="perfil definido em config/areas.yaml")
    ap.add_argument("--areas", help="áreas separadas por vírgula (substitui o perfil)")
    ap.add_argument("--fontes", default="config/fontes.yaml")
    args = ap.parse_args()

    cfg = yaml.safe_load((RAIZ / "config" / "areas.yaml").read_text(encoding="utf-8"))
    areas = cfg["areas"]
    escolhidas = args.areas.split(",") if args.areas else cfg["perfis"][args.perfil]
    desconhecidas = [a for a in escolhidas if a not in areas]
    if desconhecidas:
        sys.exit(f"Áreas não cadastradas em config/areas.yaml: {desconhecidas}")

    falhas = []
    if args.comando == "detalhar":
        fontes = yaml.safe_load((RAIZ / args.fontes).read_text(encoding="utf-8"))["fontes"]
        enriquecer(abrir_db(), areas, hosts_plone(fontes), args.limite)
    if args.comando in ("coletar", "tudo"):
        fontes = yaml.safe_load((RAIZ / args.fontes).read_text(encoding="utf-8"))["fontes"]
        novos, falhas = coletar(fontes, areas)
        avisar_telegram(novos)
    if args.comando in ("gerar", "tudo"):
        itens = abertas(abrir_db())
        gerar_site(itens, areas)
        gerar_newsletter(itens, areas, args.perfil, escolhidas)
    # Falha passageira não gera aviso. Só termina com erro (e o GitHub avisa por
    # e-mail) quando uma fonte falha em 3 execuções seguidas. Ver saida/falhas.txt.
    sys.exit(1 if falhas else 0)


if __name__ == "__main__":
    main()
