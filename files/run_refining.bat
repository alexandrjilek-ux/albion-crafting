@echo off
cd /d "%~dp0"
python refining_report.py --tiers 4,5,6,7,8 --focus-budget 10000 --out-dir reports
pause
