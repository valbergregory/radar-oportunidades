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
import json
import os
import re
import sqlite3
import sys
import unicodedata
from pathlib import Path
from urllib.parse import urljoin

import feedparser
import requests
import yaml
from bs4 import BeautifulSoup

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
DATA = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
HOJE = dt.date.today()
# Uma data só vale como prazo se vier logo depois de um destes termos. Datas de
# "publicado em" ou "atualizado em" não são prazo.
TERMO_PRAZO = re.compile(
    r"inscric|submiss|prazo|\bate\b|encerra|data[- ]limite|termino|"
    r"recebimento d|envio d|vigencia|periodo")
NAO_PRAZO = re.compile(r"(publicad|atualizad|divulgad|postad)\w*( em)?[^0-9]{0,25}$")
ANO = re.compile(r"\b(20\d{2})\b")

# Usado quando a fonte não define "padrao_link": o texto do link precisa
# parecer uma oportunidade.
GERAL = re.compile(
    r"edital|chamada|selecao|processo seletivo|inscric|bolsa|concurso|"
    r"congresso|simposio|seminario|call for papers|mestrado|doutorado|vaga"
)

TIPOS = [  # a ordem importa, vale o primeiro que casar
    ("evento", r"congresso|simposio|seminario|workshop|call for papers|"
               r"submissao de (trabalhos|artigos)|jornada|\bencontro\b"),
    ("concurso-vaga", r"concurso|professor substituto|\bvagas?\b|estagio|trainee"),
    ("pos-graduacao", r"mestrado|doutorado|pos-graduacao|aluno (regular|especial)"),
    ("bolsa", r"\bbolsas?\b"),
    ("fomento", r"edital|chamada|fomento|auxilio|subvencao|premio"),
]


def norm(texto):
    """Minúsculas sem acento, para comparar palavras-chave."""
    return unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode().lower()


def limpar(texto):
    return " ".join((texto or "").split())


# ----------------------------------------------------------------- coleta

def baixar(url):
    if url.startswith("file:"):  # usado nos testes locais
        return (RAIZ / url[5:]).read_bytes()
    r = requests.get(url, headers=UA, timeout=40)
    r.raise_for_status()
    return r.content


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
        itens.append({"titulo": limpar(e.get("title")), "link": e.get("link"),
                      "contexto": limpar(e.get("title", "") + " " + resumo)[:600]})
    return [i for i in itens if i["titulo"] and i["link"]]


def extrair_prazo(contexto):
    """Maior data que venha depois de um termo de prazo ("inscrições até",
    "submissão", "prazo"...). É uma estimativa: confira no edital."""
    texto, datas = norm(contexto), []
    for achado in DATA.finditer(texto):
        antes = texto[max(0, achado.start() - 90):achado.start()]
        if NAO_PRAZO.search(antes) or not TERMO_PRAZO.search(antes):
            continue
        d, m, a = achado.groups()
        try:
            datas.append(dt.date(int(a), int(m), int(d)))
        except ValueError:
            pass
    return max(datas).isoformat() if datas else None


def antigo(titulo, prazo):
    """Sem prazo conhecido e com ano anterior no título (ex.: "Edital 02/2023")."""
    anos = [int(x) for x in ANO.findall(titulo or "")]
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
    return con


def coletar(cfg_fontes, areas):
    con, novos, falhas = abrir_db(), [], []
    for fonte in cfg_fontes:
        if not fonte.get("ativa", True):
            continue
        try:
            itens = coletar_rss(fonte) if fonte.get("formato") == "rss" else coletar_html(fonte)
            if not itens:
                raise RuntimeError("nenhum item encontrado (o layout pode ter mudado)")
        except Exception as erro:  # uma fonte fora do ar não derruba as outras
            falhas.append(f"{fonte['nome']}: {erro}")
            continue
        for item in itens:
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
            if antigo(reg["titulo"], reg["prazo"]):
                continue
            cur = con.execute(
                "INSERT OR IGNORE INTO oportunidades VALUES "
                "(:id,:fonte,:titulo,:link,:contexto,:tipo,:areas,:prazo,:coletado_em)", reg)
            if cur.rowcount:
                novos.append(reg)
        print(f"ok   {fonte['nome']}: {len(itens)} itens")
    con.commit()
    for f in falhas:
        print(f"FALHA {f}", file=sys.stderr)
    SAIDA.mkdir(exist_ok=True)
    (SAIDA / "falhas.txt").write_text("\n".join(falhas), encoding="utf-8")
    print(f"{len(novos)} oportunidades novas, {len(falhas)} fontes com falha")
    return novos, falhas


def abertas(con):
    """Tudo que não tem prazo conhecido ou cujo prazo ainda não venceu."""
    linhas = con.execute(
        "SELECT * FROM oportunidades WHERE prazo IS NULL OR prazo >= ? "
        "ORDER BY prazo IS NULL, prazo, coletado_em DESC", (HOJE.isoformat(),))
    return [dict(l, areas=json.loads(l["areas"])) for l in linhas
            if not antigo(l["titulo"], l["prazo"])]


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


def gerar_site(itens, areas):
    DOCS.mkdir(exist_ok=True)
    dados = json.dumps({
        "atualizado": HOJE.strftime("%d/%m/%Y"),
        "areas": {s: a["nome"] for s, a in areas.items()},
        "itens": [{k: i[k] for k in ("titulo", "link", "fonte", "tipo", "areas", "prazo")}
                  for i in itens],
    }, ensure_ascii=False).replace("</", "<\\/")
    modelo = (RAIZ / "modelo_site.html").read_text(encoding="utf-8")
    (DOCS / "index.html").write_text(modelo.replace("/*DADOS*/null", dados), encoding="utf-8")
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
    ap.add_argument("comando", choices=["coletar", "gerar", "tudo"])
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
    if args.comando in ("coletar", "tudo"):
        fontes = yaml.safe_load((RAIZ / args.fontes).read_text(encoding="utf-8"))["fontes"]
        novos, falhas = coletar(fontes, areas)
        avisar_telegram(novos)
    if args.comando in ("gerar", "tudo"):
        itens = abertas(abrir_db())
        gerar_site(itens, areas)
        gerar_newsletter(itens, areas, args.perfil, escolhidas)
    sys.exit(1 if falhas else 0)  # falha visível no GitHub Actions, que avisa por e-mail


if __name__ == "__main__":
    main()
