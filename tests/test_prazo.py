"""Testes da leitura de prazos. Os trechos vêm de editais reais (CNPq, CAPES,
FAPEAL e UFAL, novembro de 2026), já sem acento e em minúsculas como o robô os vê.
Rodar com:  python -m unittest discover -s tests
"""
import datetime as dt
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import radar  # noqa: E402


class ExtrairPrazo(unittest.TestCase):
    def confere(self, texto, esperado):
        self.assertEqual(radar.extrair_prazo(texto), esperado, texto)

    def test_periodo_de_inscricoes_do_cnpq(self):
        self.confere("Publicado em 14/10/2026 07h50 Atualizado em 14/10/2026 10h48 "
                     "Chamada Inscrições: 14/10/2026 a 04/12/2026 FAQ", "2026-12-04")

    def test_cronograma_ignora_resultado_que_cita_inscricao(self):
        self.confere("cronograma da selecao atividade data periodo de inscricoes. 09/11/2026 a "
                     "13/11/2026 divulgacao do resultado preliminar da analise de curriculo e "
                     "inscricao. 19/11/2026 periodo de recebimento de recursos da analise de "
                     "curriculo. 23/11/2026", "2026-11-13")

    def test_periodo_com_horario(self):
        self.confere("as inscricoes poderao ser realizadas no periodo entre 14h de 09/11/2026 "
                     "e 12h de 13/11/2026.", "2026-11-13")
        self.confere("a submissao devera ser feita no periodo de 24 de agosto de 2026 ate as "
                     "18h do dia 17 de fevereiro de 2027 .", "2027-02-17")

    def test_cronograma_em_tabela_sem_conector(self):
        self.confere("divulgacao do resultado final das ideias inovadoras selecionadas na fase 1 "
                     "12/11/2026 fase 2 - submissao dos projetos de fomento 13/11/2026 04/12/2026 "
                     "avaliacao e selecao dos projetos", "2026-12-04")

    def test_analise_das_inscricoes_nao_e_prazo(self):
        self.confere("cronograma etapa periodo publicacao da chamada 17/11/2026 inscricoes 17 a "
                     "30/11/2026 analise das inscricoes 01 a 03/12/2026 resultado final",
                     "2026-11-30")

    def test_formatos_de_data(self):
        self.confere("inscricoes ate 20.12.2026", "2026-12-20")
        self.confere("inscricoes ate 20/12/26", "2026-12-20")
        self.confere("inscricoes ate 5 de dez. de 2026", "2026-12-05")
        self.confere("inscricoes ate 1o de marco de 2027", "2027-03-01")

    def test_datas_que_nao_sao_prazo(self):
        self.confere("Publicado em 11/11/2026 09h41 Atualizado em 11/11/2026 09h45", None)
        self.confere("lista atualizada - 27 de abril 2026 lista atualizada - 15 de marco de 2026",
                     None)
        self.confere("prazo final para interposicao de recurso administrativo 25/03/2027", None)

    def test_termo_fraco_so_sem_termo_forte(self):
        self.confere("O edital aceita propostas até terça-feira, 20/02/2024", "2024-02-20")
        self.confere("inscricoes ate 10/12/2026. prazo para assinatura 30/01/2027", "2026-12-10")

    def test_data_invalida_nao_quebra(self):
        self.confere("inscricoes ate 31/02/2026", None)


class Enriquecer(unittest.TestCase):
    """Sem rede: a leitura da página e dos anexos é simulada."""

    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        self.db_original, radar.DB = radar.DB, Path(self.pasta.name) / "teste.db"
        self.detalhar, self.ler, self.sleep = radar.detalhar, radar.ler_documentos, radar.time.sleep
        self.con = radar.abrir_db()

    def tearDown(self):
        radar.DB, radar.detalhar, radar.ler_documentos = self.db_original, self.detalhar, self.ler
        radar.time.sleep = self.sleep
        self.con.close()
        self.pasta.cleanup()

    def inserir(self, id_, titulo):
        self.con.execute("INSERT INTO oportunidades (id, fonte, titulo, link, contexto, tipo, "
                         "areas, prazo, coletado_em) VALUES (?, 'Teste', ?, ?, ?, 'fomento', "
                         "'[\"geral\"]', NULL, ?)",
                         (id_, titulo, "https://exemplo.invalid/" + id_, titulo,
                          radar.HOJE.isoformat()))

    def test_prazo_no_pdf_e_encerrado_por_resultado(self):
        futuro = (radar.HOJE + dt.timedelta(days=20)).strftime("%d/%m/%Y")
        self.inserir("aberto", "Edital com prazo no PDF")
        self.inserir("fechado", "Edital que já tem resultado")
        self.inserir("sem_nada", "Edital de fluxo contínuo")
        paginas = {
            "aberto": {"texto": "", "documentos": [("Edital", "u1")]},
            "fechado": {"texto": "", "documentos": [("Edital", "u2"), ("Resultado Final", "u3")]},
            "sem_nada": {"texto": "", "documentos": [("Lista atualizada", "u4")]},
        }
        radar.detalhar = lambda link, plone=False: paginas[link.rsplit("/", 1)[1]]
        radar.ler_documentos = lambda docs: ("inscricoes ate " + futuro
                                             if docs[0][1] == "u1" else "")
        radar.time.sleep = lambda s: None
        radar.enriquecer(self.con, {})
        abertas = {i["id"]: i for i in radar.abertas(self.con)}
        self.assertEqual(set(abertas), {"aberto", "sem_nada"})
        self.assertIsNotNone(abertas["aberto"]["prazo"])
        self.assertIsNone(abertas["sem_nada"]["prazo"])
        linha = self.con.execute("SELECT detalhe, lido_em FROM oportunidades "
                                 "WHERE id='sem_nada'").fetchone()
        self.assertEqual(tuple(linha), (radar.VERSAO_LEITURA, radar.HOJE.isoformat()))


if __name__ == "__main__":
    unittest.main()
