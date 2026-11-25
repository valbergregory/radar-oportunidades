"""Testes da configuração do cadastro (config/app.yaml) e da política de
privacidade gerada. Sem rede. Rodar com: python -m unittest discover -s tests"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import radar  # noqa: E402

COMPLETO = """
controlador: {nome: "Fulana <de Tal>", email: "contato@exemplo.invalid"}
supabase: {url: "https://abc.supabase.co/", chave_publica: "chave-anon"}
privacidade: {versao: "v2", regiao_supabase: "sa-east-1"}
"""


class Cadastro(unittest.TestCase):
    def setUp(self):
        self.pasta = tempfile.TemporaryDirectory()
        raiz = Path(self.pasta.name)
        (raiz / "config").mkdir()
        (raiz / "docs").mkdir()
        for nome in ("modelo_site.html", "modelo_privacidade.html"):
            (raiz / nome).write_text((radar.RAIZ / nome).read_text(encoding="utf-8"), encoding="utf-8")
        self.originais = radar.RAIZ, radar.DOCS
        radar.RAIZ, radar.DOCS = raiz, raiz / "docs"
        self.raiz = raiz

    def tearDown(self):
        radar.RAIZ, radar.DOCS = self.originais
        self.pasta.cleanup()

    def configurar(self, texto):
        (self.raiz / "config" / "app.yaml").write_text(texto, encoding="utf-8")

    def gerar(self):
        radar.gerar_site([], {"economia": {"nome": "Economia"}})
        pagina = (self.raiz / "docs" / "index.html").read_text(encoding="utf-8")
        config = json.loads(pagina.split("const CONFIG = ", 1)[1].split(";\n", 1)[0])
        return config, (self.raiz / "docs" / "privacidade.html").read_text(encoding="utf-8")

    def test_sem_arquivo_cadastro_desligado(self):
        config, politica = self.gerar()
        self.assertEqual(config, {"cadastro": False, "versao": "1", "supabase": None})
        self.assertIn("O cadastro ainda não está disponível", politica)
        self.assertNotIn("Cadastro: o que coletamos", politica)

    def test_incompleto_fica_desligado(self):
        self.configurar('controlador: {nome: "Fulana", email: ""}\n'
                        'supabase: {url: "https://abc.supabase.co", chave_publica: "x"}\n')
        config, _ = self.gerar()
        self.assertFalse(config["cadastro"])
        self.assertIsNone(config["supabase"])

    def test_completo_liga_e_escapa_html(self):
        self.configurar(COMPLETO)
        config, politica = self.gerar()
        self.assertTrue(config["cadastro"])
        self.assertEqual(config["supabase"], {"url": "https://abc.supabase.co", "chave_publica": "chave-anon"})
        self.assertEqual(config["versao"], "v2")
        self.assertIn("Fulana &lt;de Tal&gt;", politica)
        self.assertIn("ficam armazenados no Brasil", politica)
        self.assertNotIn("{{", politica)
        self.assertNotIn("<!--SE_", politica)
        self.assertNotIn("ainda não está disponível", politica)

    def test_regiao_fora_do_brasil_avisa(self):
        self.configurar(COMPLETO.replace("sa-east-1", "us-east-1"))
        _, politica = self.gerar()
        self.assertIn("fora do Brasil", politica)
        self.assertIn("art. 33", politica)

    def test_url_sem_https_e_recusada(self):
        self.configurar(COMPLETO.replace("https://abc", "http://abc"))
        with self.assertRaises(SystemExit):
            self.gerar()

    def test_nenhum_segredo_vai_para_a_pagina(self):
        self.configurar(COMPLETO + "\nsupabase_service_role: segredo\n")
        _, _ = self.gerar()
        pagina = (self.raiz / "docs" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("segredo", pagina)


if __name__ == "__main__":
    unittest.main()
