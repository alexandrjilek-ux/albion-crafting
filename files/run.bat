@echo off
REM Albion Crafting Analyzer v10 - Windows launcher
REM
REM Pri prvnim spusteni stahne recepty + item names (~1-2 minuty).
REM Dalsi spusteni uz jsou rychle diky cache.
REM
REM Alex: momentalne T4 only. Az vylevelujes T5 Expert, zmen --tier 4 na --tier 4,5

cd /d "%~dp0"

python -c "import requests" 2>nul || (
    echo Instaluji requests...
    pip install requests
)

echo.
echo === Albion Crafting Analyzer v10 (T4 Bridgewatch) ===
echo.
python albion_crafting.py --city Bridgewatch --tier 4 --top 20 --focus-budget 10000 --min-volume 25 --spec-level 4 --station-fee 1.5 --history-days 14 --out-dir reports

echo.
echo ==========================================
echo Hotovo! Reporty ve slozce reports\
echo - craft_report_*.html = vizualni dashboard
echo - craft_report_*.csv  = plny dataset pro Excel
echo.
echo TIPY:
echo - Kliknuti na mesto v tabulce prepocita profit nahore
echo - Barevne tecky u cen = stari dat (zelena=cerstva, cervena=stara)
echo ==========================================
pause
