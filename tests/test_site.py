"""Verificações do site estático (sem rede). Rodar: python -m unittest discover -s tests"""
import json
import re
import unittest
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"


class Site(unittest.TestCase):
    def test_conta_config_nunca_tem_chave_secreta(self):
        texto = (DOCS / "conta-config.js").read_text(encoding="utf-8")
        chave = re.search(r'chavePublicavel:\s*"([^"]*)"', texto).group(1)
        self.assertFalse(chave.startswith("sb_secret_"), "chave SECRETA em conta-config.js")
        self.assertNotIn("service_role", chave)
        url = re.search(r'^\s*url:\s*"([^"]*)"', texto, re.M).group(1)
        self.assertTrue(url == "" or url.startswith("https://"), "url precisa ser https")

    def test_dados_tem_id_estavel(self):
        dados = json.loads((DOCS / "dados.json").read_text(encoding="utf-8"))
        ids = [i["id"] for i in dados["itens"]]
        self.assertTrue(all(re.fullmatch(r"[0-9a-f]{16}", i) for i in ids))
        self.assertEqual(len(ids), len(set(ids)))

    def test_index_gerado_sem_marcadores(self):
        pagina = (DOCS / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("/*DADOS*/", pagina)
        self.assertNotIn("vendor/supabase", pagina.split("conta-config.js")[0])  # biblioteca só depois da config

    def test_caminhos_relativos(self):
        for html in DOCS.glob("*.html"):
            texto = html.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r'(href|src)="/(?!/)', texto), f"caminho absoluto em {html.name}")

    def test_service_worker_nao_guarda_conta(self):
        sw = (DOCS / "sw.js").read_text(encoding="utf-8")
        app = re.search(r"const APP = \[(.*?)\];", sw, re.S).group(1)
        for pagina in ("entrar", "cadastro", "personalizar", "conta.html", "vendor"):
            self.assertNotIn(pagina, app)


if __name__ == "__main__":
    unittest.main()
