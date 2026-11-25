@echo off
rem Radar de Oportunidades - coleta feita neste computador.
rem O gov.br recusa os servidores do GitHub; daqui, de um endereco brasileiro, ele responde.
rem Use pelo Agendador de Tarefas do Windows ou com dois cliques.
cd /d "%~dp0"
echo ==== %date% %time% ==== >> radar-local.log
git pull --rebase --autostash >> radar-local.log 2>&1
python -m pip install -q -r requirements.txt >> radar-local.log 2>&1
python radar.py tudo --perfil valber >> radar-local.log 2>&1
git add -A dados docs saida >> radar-local.log 2>&1
git diff --cached --quiet || git commit -m "Radar: coleta local" >> radar-local.log 2>&1
git push >> radar-local.log 2>&1
