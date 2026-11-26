"""Alcance, idioma, tipos novos, migração do banco e alterado_em (sem rede).
Rodar com: python -m unittest discover -s tests"""
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import radar  # noqa: E402

CLASSIF = radar.carregar_classificacao()
NACIONAL = {"nome": "CNPq", "uf": "", "alcance": "nacional", "idioma": "pt"}
ESTADUAL = {"nome": "FAPEAL", "uf": "AL", "alcance": "estadual", "idioma": "pt"}


class Alcance(unittest.TestCase):
    def alc(self, titulo, fonte=NACIONAL):
        return radar.alcance_do_item(radar.norm(titulo), fonte, CLASSIF)

    def test_internacional_por_pais_agencia_ou_palavra(self):
        for t in ["Chamada CNPq Cooperação Brasil-Suécia", "Chamada Pública MCTI/CNPq/ANR Nº 32/2026",
                  "Bolsas para doutorandos na Alemanha DAAD/Confap", "Doutorado-sanduíche no exterior",
                  "Cooperação bilateral com a França", "Programa de bolsas estrangeiras"]:
            self.assertEqual(self.alc(t), "internacional", t)

    def test_fonte_estadual_tambem_vira_internacional(self):
        self.assertEqual(self.alc("Chamada transnacional conjunta", ESTADUAL), "internacional")

    def test_sem_termo_fica_o_alcance_da_fonte(self):
        self.assertEqual(self.alc("Bolsas de Produtividade do CNPq"), "nacional")
        self.assertEqual(self.alc("Edital Centelha 3 Alagoas", ESTADUAL), "estadual")
        # palavra dentro de outra não conta ("eua" em "museuana", "india" em "indiano" conta só como início)
        self.assertEqual(self.alc("Museu de arte e cultura"), "nacional")


class Idioma(unittest.TestCase):
    def test_ingles_espanhol_e_padrao(self):
        en = "Call for applications: the research fellowship program is open to researchers from the region and the deadline for submissions"
        es = "Convocatoria de becas para la investigación: las inscripciones del programa con el plazo de la convocatoria por los"
        pt = "Chamada para inscrições do programa de bolsas da fundação com os prazos e as regras para os candidatos"
        self.assertEqual(radar.detectar_idioma(radar.norm(en), "pt", CLASSIF), "en")
        self.assertEqual(radar.detectar_idioma(radar.norm(es), "pt", CLASSIF), "es")
        self.assertEqual(radar.detectar_idioma(radar.norm(pt), "en", CLASSIF), "pt")

    def test_pouco_texto_fica_o_padrao_da_fonte(self):
        self.assertEqual(radar.detectar_idioma(radar.norm("Call for papers"), "pt", CLASSIF), "pt")
        self.assertEqual(radar.detectar_idioma("", "es", CLASSIF), "es")
        self.assertEqual(radar.detectar_idioma("", "xx", CLASSIF), "pt")


class Tipos(unittest.TestCase):
    def confere(self, titulo, tipo):
        self.assertEqual(radar.classificar_tipo(radar.norm(titulo)), tipo, titulo)

    def test_estagio_emprego_e_concurso(self):
        self.confere("Seleção de estagiários em TI", "estagio")
        self.confere("Programa Trainee 2027", "estagio")
        self.confere("Jovem Aprendiz - inscrições abertas", "estagio")
        self.confere("Vaga para analista de dados (CLT)", "emprego")
        self.confere("Contratação de desenvolvedor", "emprego")
        self.confere("Concurso público para professor", "concurso-vaga")
        self.confere("Processo Seletivo Simplificado – Professor Substituto", "concurso-vaga")
        self.confere("Vagas para mestrado em economia", "pos-graduacao")
        self.confere("Edital com vagas de bolsa de iniciação científica", "bolsa")


class Banco(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        self.db_original, radar.DB = radar.DB, Path(self.pasta.name) / "radar.db"
        self.detalhar, self.sleep = radar.detalhar, radar.time.sleep
        radar.time.sleep = lambda s: None

    def tearDown(self):
        radar.DB, radar.detalhar, radar.time.sleep = self.db_original, self.detalhar, self.sleep
        self.pasta.cleanup()

    def test_migra_banco_antigo_sem_perder_dados(self):
        con = sqlite3.connect(radar.DB)
        con.execute("CREATE TABLE oportunidades (id TEXT PRIMARY KEY, fonte TEXT, titulo TEXT, link TEXT, "
                    "contexto TEXT, tipo TEXT, areas TEXT, prazo TEXT, coletado_em TEXT)")
        con.execute("INSERT INTO oportunidades VALUES ('a1b2c3d4e5f60718','FAPEAL','Bolsas DAAD na Alemanha',"
                    "'https://x.invalid','', 'bolsa','[\"geral\"]', NULL, '2026-11-01')")
        con.commit(); con.close()
        con = radar.abrir_db()
        self.assertEqual(radar.atualizar_metadados(con, [ESTADUAL]), 1)
        l = con.execute("SELECT * FROM oportunidades").fetchone()
        self.assertEqual((l["titulo"], l["uf"], l["alcance"], l["idioma"]), ("Bolsas DAAD na Alemanha", "AL", "internacional", "pt"))
        self.assertEqual(radar.atualizar_metadados(con, [ESTADUAL]), 0)  # nada a mudar na segunda vez

    def inserir(self, con, id_, titulo, prazo=None, detalhe=None, lido_em=None):
        con.execute("INSERT INTO oportunidades (id,fonte,titulo,link,contexto,tipo,areas,prazo,coletado_em,detalhe,lido_em,uf,alcance,idioma) "
                    "VALUES (?, 'CNPq', ?, ?, '', 'fomento', '[\"geral\"]', ?, ?, ?, ?, NULL, 'nacional', 'pt')",
                    (id_, titulo, "https://x.invalid/" + id_, prazo, radar.HOJE.isoformat(), detalhe, lido_em))

    def test_retificacao_marca_o_grupo_como_alterado(self):
        con = radar.abrir_db()
        self.inserir(con, "1111111111111111", "Chamada CNPq 10/2026")
        self.inserir(con, "2222222222222222", "Chamada CNPq 10/2026 - Retificação")
        radar.marcar_retificacao(con, {"fonte": "CNPq", "titulo": "Chamada CNPq 10/2026 - Retificação"})
        itens = radar.abertas(con)
        self.assertEqual(len(itens), 1)
        self.assertTrue(itens[0]["alterado_em"])

    def test_prazo_alterado_na_releitura_marca_alterado_em(self):
        con = radar.abrir_db()
        futuro = (radar.HOJE.replace(year=radar.HOJE.year + 1)).isoformat()
        novo = (radar.HOJE.replace(year=radar.HOJE.year + 1, day=1)).strftime("%d/%m/%Y")
        # lido pela versão atual, sem prazo, há mais de 7 dias: será relido
        self.inserir(con, "3333333333333333", "Chamada A", None, radar.VERSAO_LEITURA, "2000-01-01")
        # lido por versão antiga: a releitura NÃO marca mudança
        self.inserir(con, "4444444444444444", "Chamada B", futuro, radar.VERSAO_LEITURA - 1, "2000-01-01")
        con.commit()
        radar.detalhar = lambda link, plone=False: {"texto": "inscrições até " + novo, "documentos": []}
        radar.enriquecer(con, {}, [NACIONAL])
        a = con.execute("SELECT * FROM oportunidades WHERE id='3333333333333333'").fetchone()
        b = con.execute("SELECT * FROM oportunidades WHERE id='4444444444444444'").fetchone()
        self.assertTrue(a["prazo"] and a["alterado_em"], "prazo apareceu numa releitura: alterado")
        self.assertIsNone(b["alterado_em"], "versão nova do leitor não conta como mudança")

    def test_dados_json_tem_os_campos_novos(self):
        con = radar.abrir_db()
        self.inserir(con, "5555555555555555", "Chamada C")
        con.commit()
        docs = Path(self.pasta.name) / "docs"
        originais = radar.DOCS, radar.RAIZ
        radar.DOCS = docs
        try:
            radar.gerar_site(radar.abertas(con), {})
        finally:
            radar.DOCS = originais[0]
        item = json.loads((docs / "dados.json").read_text(encoding="utf-8"))["itens"][0]
        for campo in ("uf", "alcance", "idioma", "alterado_em"):
            self.assertIn(campo, item)


if __name__ == "__main__":
    unittest.main()
