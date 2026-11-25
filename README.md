# Radar de Oportunidades

Robô que visita diariamente portais públicos (CNPq, CAPES, Finep, FAPEAL, UFAL),
guarda editais, bolsas, seleções, eventos e vagas em um banco SQLite e gera

- um **site com filtros** por área e tipo (`docs/index.html`, publicado no GitHub Pages)
- um **rascunho de newsletter** em Markdown (`saida/newsletter-<perfil>.md`)
- um **calendário de prazos** assinável (`docs/prazos.ics`)
- um **aviso no Telegram** com as novidades (opcional)

Cada pessoa escolhe as próprias áreas. No site, pelos filtros, que ficam salvos no
navegador. Na newsletter, por um perfil de `config/areas.yaml` ou pela opção `--areas`.

## Rodar no computador

```bash
pip install -r requirements.txt
python radar.py tudo --perfil valber
python radar.py gerar --areas turismo,economia   # outra combinação de áreas
```

## Publicar e automatizar (GitHub)

1. Crie um repositório e envie estes arquivos.
2. Em **Settings > Pages**, escolha a branch `main` e a pasta `/docs`.
3. Em **Settings > Actions > General**, marque *Read and write permissions*.
4. Na aba **Actions**, rode o fluxo "Radar de Oportunidades" uma vez à mão.
   Depois disso ele roda sozinho todos os dias.
5. Telegram (opcional): crie um bot com o @BotFather, adicione-o como
   administrador do canal e cadastre os segredos `TELEGRAM_TOKEN` e
   `TELEGRAM_CHAT` em **Settings > Secrets and variables > Actions**.

Quando uma fonte falha, o fluxo termina com erro e o GitHub avisa por e-mail.
O que foi coletado das outras fontes é salvo normalmente.

## Ajustar

- **Áreas e palavras-chave** em `config/areas.yaml`
- **Fontes** em `config/fontes.yaml`. Para incluir uma, basta nome e endereço da
  página de listagem. Se vier lixo, restrinja com `padrao_link`.

## Limites conhecidos

- Os coletores ainda não foram executados contra os sites reais. A primeira
  execução serve para calibrar `padrao_link` de cada fonte.
- O prazo é a maior data encontrada perto do título. É uma estimativa e deve ser
  conferida no edital antes de divulgar.
- A classificação por área usa palavras-chave e erra em títulos genéricos.
- Páginas que dependem de JavaScript (como o SIGAA) não são lidas por este coletor.
- O LinkedIn não é fonte do robô, pois os termos de uso proíbem coleta
  automatizada. A newsletter é colada e publicada lá manualmente.
