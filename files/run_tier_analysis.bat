@echo off
cd /d "%~dp0"
echo === T5 ===
python albion_crafting.py --city Bridgewatch --tier 5 --top 50 --focus-budget 10000 --out-dir reports 2>nul
echo === T6 ===
python albion_crafting.py --city Bridgewatch --tier 6 --top 50 --focus-budget 10000 --out-dir reports 2>nul
echo === T7 ===
python albion_crafting.py --city Bridgewatch --tier 7 --top 50 --focus-budget 10000 --out-dir reports 2>nul
echo === T8 ===
python albion_crafting.py --city Bridgewatch --tier 8 --top 50 --focus-budget 10000 --out-dir reports 2>nul
echo === HOTOVO ===
pause
