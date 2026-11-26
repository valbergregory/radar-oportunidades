"""Verificações do site estático (sem rede). Rodar: python -m unittest discover -s tests"""
import json
import re
import unittest
from pathlib import Path

DOCS = Path(__file__).resolve().parent.parent / "docs"


class Site(unittest.TestCase):
    def test_conta_config_sem_segredo(self):
        texto = (DOCS / "conta-config.js").read_text(encoding="utf-8")
        texto = "\n".join(l.split("//")[0] if l.lstrip().startswith("//") else l for l in texto.splitlines())
        for proibido in ("private_key", "client_email", "service_account", "BEGIN PRIVATE KEY"):
            self.assertNotIn(proibido, texto, "conta-config.js não pode ter chave de conta de serviço")
        chave = re.search(r'apiKey:\s*"([^"]*)"', texto).group(1)
        self.assertTrue(chave == "" or re.fullmatch(r"AIza[0-9A-Za-z_-]{35}", chave), "apiKey em formato inesperado")
        self.assertIn('projectId: "radar-oportunidades-88442"', texto)

    def test_dados_tem_id_estavel(self):
        dados = json.loads((DOCS / "dados.json").read_text(encoding="utf-8"))
        ids = [i["id"] for i in dados["itens"]]
        self.assertTrue(all(re.fullmatch(r"[0-9a-f]{16}", i) for i in ids))
        self.assertEqual(len(ids), len(set(ids)))

    def test_index_gerado_sem_marcadores(self):
        pagina = (DOCS / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("/*DADOS*/", pagina)
        self.assertNotIn("vendor/", pagina)  # o SDK só é importado por js/firebase.js, se configurado

    def test_caminhos_relativos(self):
        for html in DOCS.glob("*.html"):
            texto = html.read_text(encoding="utf-8")
            self.assertIsNone(re.search(r'(href|src)="/(?!/)', texto), f"caminho absoluto em {html.name}")

    def test_service_worker_nao_guarda_conta(self):
        sw = (DOCS / "sw.js").read_text(encoding="utf-8")
        app = re.search(r"const APP = \[(.*?)\];", sw, re.S).group(1)
        for pagina in ("entrar", "cadastro", "personalizar", "conta.html", "vendor", "conta-index"):
            self.assertNotIn(pagina, app)


if __name__ == "__main__":
    unittest.main()


class Regras(unittest.TestCase):
    def test_regras_existem_e_negam_listagem(self):
        regras = (DOCS.parent / "firestore.rules").read_text(encoding="utf-8")
        self.assertIn("allow list: if false;", regras)
        self.assertIn("request.auth != null && request.auth.uid == uid", regras)
        self.assertNotIn("allow read, write: if true", regras)
