"""
Albion Leveling Cost Analyzer
==============================
Pro crafting začátečníky: vypočítá, kolik silver ztratíš (a fame získáš)
při levelování z T2 do T4 pro každou kategorii itemů.

Zohledňuje:
- Nominal craft cost (suroviny z AODP)
- Sell price (kolik dostaneš zpět)
- Journal absorbci (pokud máš journal)
- Return rate bez focus (15.2% default / 36.2% s city bonusem)

Cíl: najít CESTU s nejnižší silver-loss-per-fame ratio.
"""

import argparse
import csv
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

AODP_BASE = "https://europe.albion-online-data.com/api/v2/stats"

# Crafting fame per item (zjednodušeně, skutečnost je složitější)
# Fame škáluje s tierem. Values jsou item fame, ne resource fame.
FAME_PER_CRAFT = {
    2: 13.8,
    3: 27.5,
    4: 59.5,
    5: 119,
    6: 238,
    7: 476,
    8: 952,
}

# Fame requirements pro unlock dalšího tieru (Destiny Board)
# Pro kompletni T4 Expert (ziskovy tier) potrebujes:
# T2 unlock -> T3 unlock -> T4 unlock -> T4 Expert unlock
FAME_TO_UNLOCK = {
    "T2->T3": 480,
    "T3->T4": 1800,
    "T4_base->T4_expert": 14440,  # tohle je dalsi unlock po T4 base
    "T5->T6 (Master)": 57760,
    "T6->T7 (Grandmaster)": 231040,
    "T7->T8 (Elder)": 924160,
}

# Return rate bez focus
RR_NO_FOCUS_BASE = 0.152
RR_NO_FOCUS_BONUS = 0.362

MARKET_TAX = 0.04
JOURNAL_FAME_RECOVERY_RATE = 0.70  # kolik % fame-to-silver hodnoty dostaneš zpět z plného journalu

# Bridgewatch bonus kategorie (= mají city bonus return rate)
BRIDGEWATCH_BONUS = ["PLATE_ARMOR", "CROSSBOW", "DAGGER", "HAMMER", "CLOTH_SANDALS"]

# Levelovací itemy - priorita pro Bridgewatch
# POZN: suroviny a focus_cost se nyní stahují z Gameinfo API (přesné hodnoty)
LEVELING_ITEMS = {
    # Plate (bonus v Bridgewatch)
    "ARMOR_PLATE_SET1": {"category": "PLATE_ARMOR",   "slot": "chest"},
    "HEAD_PLATE_SET1":  {"category": "PLATE_ARMOR",   "slot": "helm"},
    "SHOES_PLATE_SET1": {"category": "PLATE_ARMOR",   "slot": "boots"},
    # Bridgewatch zbraně (bonus)
    "MAIN_HAMMER":      {"category": "HAMMER",        "slot": "hammer"},
    "MAIN_DAGGER":      {"category": "DAGGER",        "slot": "dagger"},
    "2H_CROSSBOW":      {"category": "CROSSBOW",      "slot": "crossbow"},
    "SHOES_CLOTH_SET1": {"category": "CLOTH_SANDALS", "slot": "sandals"},
    # Jiné kategorie pro srovnání (bez bonusu)
    "MAIN_SWORD":       {"category": "SWORD",         "slot": "sword"},
    "ARMOR_LEATHER_SET1": {"category": "LEATHER_ARMOR", "slot": "leather_chest"},
}


def fetch_prices(item_ids, locations, quality=1):
    """Stáhne ceny z AODP. Batch po 50."""
    BATCH_SIZE = 50
    prices = {}
    for i in range(0, len(item_ids), BATCH_SIZE):
        batch = item_ids[i:i + BATCH_SIZE]
        url = f"{AODP_BASE}/prices/{','.join(batch)}.json?locations={','.join(locations)}&qualities={quality}"
        try:
            resp = requests.get(url, headers={"Accept-Encoding": "gzip"}, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except requests.RequestException as e:
            print(f"  [!] Chyba: {e}", file=sys.stderr)
            continue
        for row in data:
            prices[(row["item_id"], row["city"])] = {
                "sell_min": row.get("sell_price_min", 0) or 0,
                "buy_max": row.get("buy_price_max", 0) or 0,
                "sell_updated": row.get("sell_price_min_date", ""),
            }
        time.sleep(0.3)
    return prices


def calculate_leveling_path(item_key, item_info, prices, city, recipes, use_journal=False):
    """
    Pro jeden item spočítá kompletní cestu T2 → T3 → T4 base → T4 Expert.
    T4 Expert je klíčový, protože tam teprve crafting začíná být ziskový
    (return rate 62.9% s city bonusem + focus).

    Suroviny a focus_cost bere z reálných receptů z Gameinfo API.
    """
    has_bonus = item_info["category"] in BRIDGEWATCH_BONUSES_LOCAL(city)
    rr = RR_NO_FOCUS_BONUS if has_bonus else RR_NO_FOCUS_BASE

    path_steps = []
    total_loss = 0
    total_fame = 0

    # Fáze levelování:
    # T2 items -> unlock T3 (480 fame)
    # T3 items -> unlock T4 (1800 fame)
    # T4 items -> unlock T4 Expert (14440 fame) <- KLÍČOVÝ KROK pro Alexe
    tiers_to_level = [
        (2, "T2->T3", 480, "Unlock T3"),
        (3, "T3->T4", 1800, "Unlock T4 base"),
        (4, "T4_base->T4_expert", 14440, "Unlock T4 Expert (ziskový tier!)"),
    ]

    for tier, fame_key, required_fame, unlock_desc in tiers_to_level:
        item_id = f"T{tier}_{item_key}"

        # Získej PŘESNÝ recept z loaderu
        recipe = recipes.get(item_id)
        if recipe is None:
            return None  # recept pro tento tier/item není dostupný

        resources_needed = {res["id"]: res["count"] for res in recipe["resources"]}

        # Náklad
        nominal_cost = 0
        missing = False
        for res_id, qty in resources_needed.items():
            key = (res_id, city)
            if key not in prices or prices[key]["sell_min"] == 0:
                missing = True
                break
            nominal_cost += prices[key]["sell_min"] * qty

        if missing:
            return None

        effective_cost = nominal_cost * (1 - rr)

        # Výnos z prodeje
        sell_key = (item_id, city)
        if sell_key not in prices or prices[sell_key]["sell_min"] == 0:
            return None
        sell_price = prices[sell_key]["sell_min"]
        net_revenue = sell_price * (1 - MARKET_TAX)

        # Fame
        fame_per_item = FAME_PER_CRAFT[tier]
        items_to_craft = int(required_fame / fame_per_item) + 1
        loss_per_item = effective_cost - net_revenue  # záporné = zisk, kladné = ztráta

        # Journal absorbuje fame a vrací silver
        journal_recovery = 0
        if use_journal:
            # Plný journal recovery: fame × approx 2.5 silver/fame × 0.7 recovery rate
            journal_recovery = fame_per_item * 2.5 * JOURNAL_FAME_RECOVERY_RATE

        net_loss_per_item = loss_per_item - journal_recovery
        total_tier_loss = net_loss_per_item * items_to_craft
        total_tier_fame = fame_per_item * items_to_craft

        path_steps.append({
            "tier": tier,
            "item_id": item_id,
            "unlock_desc": unlock_desc,
            "required_fame": required_fame,
            "items_to_craft": items_to_craft,
            "cost_per_item": round(effective_cost),
            "sell_price": round(sell_price),
            "loss_per_item": round(loss_per_item),
            "journal_recovery_per_item": round(journal_recovery),
            "net_loss_per_item": round(net_loss_per_item),
            "total_tier_loss": round(total_tier_loss),
            "total_tier_fame": round(total_tier_fame),
            "total_tier_cost": round(effective_cost * items_to_craft),
            "total_tier_revenue": round(net_revenue * items_to_craft),
        })

        total_loss += total_tier_loss
        total_fame += total_tier_fame

    return {
        "item": item_key,
        "category": item_info["category"],
        "has_city_bonus": has_bonus,
        "path": path_steps,
        "total_silver_loss": round(total_loss),
        "total_fame": round(total_fame),
        "silver_per_fame": round(total_loss / total_fame, 2) if total_fame > 0 else 0,
    }


def BRIDGEWATCH_BONUSES_LOCAL(city):
    """Helper, returns bonus list for city."""
    bonuses = {
        "Bridgewatch": BRIDGEWATCH_BONUS,
        "Martlock": ["OFFHAND", "SHIELD", "TORCH"],
        "Lymhurst": ["LEATHER_ARMOR", "BOW", "SWORD"],
        "Thetford": ["CLOTH_ARMOR", "CURSED_STAFF", "ARCANE_STAFF"],
        "Fort Sterling": ["PLATE_HELMET", "AXE", "QUARTERSTAFF", "FIRE_STAFF"],
        "Caerleon": [],
    }
    return bonuses.get(city, [])


def main():
    parser = argparse.ArgumentParser(description="Albion leveling cost analyzer")
    parser.add_argument("--city", default="Bridgewatch", help="Kde craftíš")
    parser.add_argument("--journal", action="store_true", help="Započítat journal recovery")
    parser.add_argument("--out-dir", default=".")
    args = parser.parse_args()

    print(f"\n>> Leveling analyzer")
    print(f"   City:    {args.city}")
    print(f"   Journal: {'ANO' if args.journal else 'NE'}")
    print()

    # 1. Stáhni recepty z Gameinfo API pro všechny item/tier kombinace
    from recipes import RecipeLoader
    recipe_loader = RecipeLoader()

    item_ids_needed = []
    for item_key in LEVELING_ITEMS:
        for tier in [2, 3, 4]:  # T2, T3, T4 pro Expert unlock
            item_ids_needed.append(f"T{tier}_{item_key}")

    print(f"[1/4] Načítám recepty pro {len(item_ids_needed)} itemů...")
    recipes = recipe_loader.preload_recipes(item_ids_needed)

    # 2. Posbírej všechna unique resource IDs z receptů
    all_ids = set()
    for iid, recipe in recipes.items():
        if recipe is None:
            continue
        all_ids.add(iid)  # sám item (pro prodejní cenu)
        for res in recipe["resources"]:
            all_ids.add(res["id"])  # suroviny
    all_ids = sorted(all_ids)
    print(f"[2/4] Stahuji ceny pro {len(all_ids)} unique IDs (item + suroviny)...")

    prices = fetch_prices(all_ids, [args.city], quality=1)
    print(f"      Získáno {len(prices)} záznamů\n")

    print(f"[3/4] Počítám levelovací cesty...\n")
    results = []
    for item_key, info in LEVELING_ITEMS.items():
        res = calculate_leveling_path(item_key, info, prices, args.city, recipes, args.journal)
        if res:
            results.append(res)

    if not results:
        print("[!] Žádná data. Buď AODP nemá aktuální ceny nebo ID nesedí.")
        return

    # Seřaď podle nejnižší silver loss
    results.sort(key=lambda r: r["total_silver_loss"])

    # Report - HTML + CSV
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. HTML dashboard
    html_path = out_dir / f"leveling_report_{today}.html"
    write_leveling_html(html_path, results, args.city, args.journal, today)

    # 2. CSV - detailní plán tier po tieru pro Excel
    csv_path = out_dir / f"leveling_plan_{today}.csv"
    write_leveling_csv(csv_path, results, args.city, args.journal)

    print(f"[4/4] Reporty ulozeny:")
    print(f"      HTML dashboard: {html_path}")
    print(f"      Excel/CSV plan: {csv_path}\n")
    print("=" * 60)
    print("TOP 3 LEVELOVACÍ CESTY (nejnižší ztráta):")
    print("=" * 60)
    for i, r in enumerate(results[:3], 1):
        print(f"{i}. {r['item']:<25} | ztráta: {r['total_silver_loss']:>10,} | bonus: {'✓' if r['has_city_bonus'] else '—'}")


def write_leveling_csv(path, results, city, use_journal):
    """
    CSV s detailním plánem tier-po-tieru pro každou kandidátskou cestu.
    Každý řádek = jedna fáze levelování (T2, T3, T4) pro konkrétní item.
    Otevřeš v Excelu a vidíš přesně, co máš vyrobit.
    """
    import csv as csvlib
    fieldnames = [
        "priorita", "item_key", "kategorie", "city_bonus",
        "fáze", "tier", "item_id", "unlock_popis",
        "kolik_ks_vyrobit", "cena_za_kus", "prodejní_cena",
        "ztráta_za_kus_bez_journalu", "journal_recovery_za_kus",
        "čistá_ztráta_za_kus", "ztráta_celkem_fáze",
        "fame_za_kus", "fame_celkem_fáze",
        "náklad_surovin_celkem", "výnos_prodeje_celkem",
    ]

    with open(path, "w", newline="", encoding="utf-8-sig") as f:  # utf-8-sig pro Excel s diakritikou
        writer = csvlib.DictWriter(f, fieldnames=fieldnames, delimiter=";")  # ; pro Excel CZ
        writer.writeheader()

        for priority, r in enumerate(results, 1):
            for step in r["path"]:
                writer.writerow({
                    "priorita": priority,
                    "item_key": r["item"],
                    "kategorie": r["category"],
                    "city_bonus": "ANO" if r["has_city_bonus"] else "NE",
                    "fáze": step["unlock_desc"],
                    "tier": f"T{step['tier']}",
                    "item_id": step["item_id"],
                    "unlock_popis": step["unlock_desc"],
                    "kolik_ks_vyrobit": step["items_to_craft"],
                    "cena_za_kus": step["cost_per_item"],
                    "prodejní_cena": step["sell_price"],
                    "ztráta_za_kus_bez_journalu": step["loss_per_item"],
                    "journal_recovery_za_kus": step["journal_recovery_per_item"],
                    "čistá_ztráta_za_kus": step["net_loss_per_item"],
                    "ztráta_celkem_fáze": step["total_tier_loss"],
                    "fame_za_kus": round(step["total_tier_fame"] / step["items_to_craft"]) if step["items_to_craft"] > 0 else 0,
                    "fame_celkem_fáze": step["total_tier_fame"],
                    "náklad_surovin_celkem": step["total_tier_cost"],
                    "výnos_prodeje_celkem": step["total_tier_revenue"],
                })


def write_leveling_html(path, results, city, use_journal, today):
    """HTML dashboard pro levelovací fázi."""
    best = results[0]

    # Karty pro top 3
    cards_html = ""
    for i, r in enumerate(results[:3], 1):
        t2_loss = r["path"][0]["net_loss_per_item"] if len(r["path"]) > 0 else 0
        t3_loss = r["path"][1]["net_loss_per_item"] if len(r["path"]) > 1 else 0

        if i == 1:
            tier_class = "gold"
            badge = "🥇 ZAČNI TÍMHLE"
        elif i == 2:
            tier_class = "silver"
            badge = "🥈 alternativa #2"
        else:
            tier_class = "bronze"
            badge = "🥉 alternativa #3"

        bonus_badge = '<span class="bonus-yes">⭐ City bonus</span>' if r["has_city_bonus"] else '<span class="bonus-no">bez bonusu</span>'
        nice_name = r['item'].replace("_", " ").title()

        steps_html = ""
        for step in r["path"]:
            steps_html += f"""
            <div class="step-row">
                <div class="step-tier">T{step['tier']}</div>
                <div class="step-action">
                    Vyrob <b>{step['items_to_craft']:,}×</b> <code>{step['item_id']}</code><br>
                    <span class="step-sub">→ {step['unlock_desc']} ({step['required_fame']:,} fame)</span>
                </div>
                <div class="step-loss">ztráta ~{step['total_tier_loss']:,}</div>
            </div>
            """

        cards_html += f"""
        <div class="card {tier_class}">
            <div class="card-header">
                <span class="rank">{badge}</span>
                <span class="loss-big">−{r['total_silver_loss']:,}</span>
            </div>
            <div class="item-name">{nice_name}</div>
            <div class="item-meta">
                <code>{r['item']}</code> · {bonus_badge} · kategorie <b>{r['category']}</b>
            </div>

            <div class="instructions">
                {steps_html}
                <div class="step-row total-row">
                    <div class="step-tier">📊</div>
                    <div class="step-action"><b>Celkem:</b> {r['total_fame']:,} fame získáno</div>
                    <div class="step-loss"><b>−{r['total_silver_loss']:,}</b> silver celkem</div>
                </div>
            </div>
        </div>
        """

    # Ostatní možnosti v tabulce
    table_rows = ""
    for i, r in enumerate(results[3:], 4):
        bonus_icon = "⭐" if r["has_city_bonus"] else ""
        table_rows += f"""
        <tr>
            <td>{i}</td>
            <td><code>{r['item']}</code> {bonus_icon}</td>
            <td>{r['category']}</td>
            <td class="num loss">−{r['total_silver_loss']:,}</td>
            <td class="num">{r['silver_per_fame']}</td>
        </tr>
        """

    html = f"""<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="UTF-8">
<title>Albion Leveling Report — {today}</title>
<style>
    * {{ box-sizing: border-box; }}
    body {{
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #0f1419;
        color: #e6e6e6;
        margin: 0;
        padding: 24px;
        line-height: 1.5;
    }}
    .container {{ max-width: 1000px; margin: 0 auto; }}

    h1 {{ font-size: 28px; margin: 0 0 8px 0; color: #fff; }}
    .subtitle {{ color: #8a9199; margin-bottom: 24px; }}
    .subtitle b {{ color: #e6e6e6; }}

    .hero {{
        background: linear-gradient(135deg, #5f2d1a, #7a3f2d);
        border-radius: 16px;
        padding: 32px;
        margin-bottom: 32px;
        text-align: center;
        border: 2px solid #a85a3f;
    }}
    .hero-label {{
        font-size: 14px;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: #ffc9b3;
        margin-bottom: 8px;
    }}
    .hero-number {{
        font-size: 56px;
        font-weight: 800;
        color: #fff;
        line-height: 1;
        margin-bottom: 8px;
    }}
    .hero-details {{ font-size: 14px; color: #ffc9b3; }}

    .info-box {{
        background: #1a2a3f;
        border-left: 4px solid #4a90e2;
        padding: 16px 20px;
        border-radius: 8px;
        margin: 24px 0;
        color: #b3d4f5;
    }}
    .info-box b {{ color: #fff; }}

    h2 {{
        font-size: 22px;
        margin: 32px 0 16px 0;
        color: #fff;
        border-bottom: 2px solid #2a3441;
        padding-bottom: 8px;
    }}

    .card {{
        background: #1a2029;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 16px;
        border-left: 6px solid #3a4452;
    }}
    .card.gold {{ border-left-color: #ffd700; background: linear-gradient(90deg, #2a2415, #1a2029 30%); }}
    .card.silver {{ border-left-color: #c0c0c0; }}
    .card.bronze {{ border-left-color: #cd7f32; }}

    .card-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }}
    .rank {{ font-size: 16px; font-weight: 700; color: #8a9199; }}
    .card.gold .rank {{ color: #ffd700; }}
    .loss-big {{ font-size: 36px; font-weight: 800; color: #e76d5a; }}

    .item-name {{ font-size: 20px; font-weight: 600; color: #fff; margin-bottom: 8px; }}
    .item-meta {{ color: #8a9199; font-size: 14px; margin-bottom: 20px; }}
    .item-meta code {{
        background: #0a0d12; padding: 2px 6px; border-radius: 4px;
        color: #9ecbff; font-size: 12px;
    }}
    .bonus-yes {{ color: #ffd700; font-weight: 600; }}
    .bonus-no {{ color: #8a9199; }}

    .instructions {{ background: #0a0d12; border-radius: 8px; padding: 12px 16px; }}
    .step-row {{
        display: grid;
        grid-template-columns: 50px 1fr auto;
        gap: 12px;
        align-items: center;
        padding: 10px 0;
        border-bottom: 1px solid #1a2029;
    }}
    .step-row:last-child {{ border-bottom: none; }}
    .step-tier {{
        font-weight: 700; color: #ffd700; font-size: 14px;
        background: #2a2415; padding: 4px 8px; border-radius: 4px; text-align: center;
    }}
    .step-action {{ font-size: 14px; }}
    .step-action b {{ color: #fff; }}
    .step-action code {{
        background: #1a2029; padding: 2px 6px; border-radius: 4px;
        color: #9ecbff; font-size: 12px;
    }}
    .step-sub {{
        font-size: 12px;
        color: #8a9199;
        display: inline-block;
        margin-top: 2px;
    }}
    .step-loss {{ color: #e76d5a; font-size: 13px; white-space: nowrap; }}
    .total-row {{
        border-top: 2px solid #2a3441;
        margin-top: 4px;
        padding-top: 12px;
    }}
    .total-row .step-loss {{ font-size: 15px; }}

    table {{
        width: 100%; border-collapse: collapse;
        background: #1a2029; border-radius: 8px; overflow: hidden;
    }}
    th, td {{ padding: 10px 14px; text-align: left; border-bottom: 1px solid #2a3441; }}
    th {{ background: #0a0d12; color: #8a9199; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }}
    tr:last-child td {{ border-bottom: none; }}
    td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
    td.loss {{ color: #e76d5a; }}
    td code {{ background: #0a0d12; padding: 2px 6px; border-radius: 4px; color: #9ecbff; font-size: 12px; }}

    .next-steps {{
        background: #152a1f;
        border-left: 4px solid #3fa865;
        padding: 20px 24px;
        border-radius: 8px;
        margin: 32px 0;
    }}
    .next-steps h3 {{ margin: 0 0 12px 0; color: #3fa865; }}
    .next-steps ol {{ margin: 0; padding-left: 20px; }}
    .next-steps li {{ margin: 8px 0; }}
</style>
</head>
<body>
<div class="container">
    <h1>📚 Crafting Leveling Report</h1>
    <div class="subtitle">
        <b>{today}</b> · Craftíš v <b>{city}</b> · Journal: <b>{'ANO' if use_journal else 'NE'}</b> · Cíl: <b>T2 → T4 Expert</b> (ziskový tier)
    </div>

    <div class="hero">
        <div class="hero-label">Levná cesta T2 → T4 Expert stojí</div>
        <div class="hero-number">−{best['total_silver_loss']:,}</div>
        <div class="hero-details">
            silver celkem · získáš {best['total_fame']:,} fame<br>
            <b>nejlevnější volba: {best['item'].replace('_', ' ').title()}</b>
        </div>
    </div>

    <div class="info-box">
        💡 <b>Proč mínus?</b> Levelování crafting v Albionu <b>vždycky něco stojí</b> — je to investice do budoucích T4+ profitů.
        Cíl je minimalizovat tuhle ztrátu, ne ji úplně smazat. Po dokončení T4 Expert už budeš vydělávat.
    </div>

    <h2>🎯 Nejlepší volby na levelování</h2>
    {cards_html}

    {"<h2>📋 Další možnosti</h2><table><thead><tr><th>#</th><th>Item</th><th>Kategorie</th><th>Celková ztráta</th><th>Silver/fame</th></tr></thead><tbody>" + table_rows + "</tbody></table>" if table_rows else ""}

    <div class="next-steps">
        <h3>✅ Co dál po T4 Expert</h3>
        <ol>
            <li><b>Teď už používej focus!</b> Return rate je 62,9 % s city bonusem + focus</li>
            <li><b>Pusť <code>albion_crafting.py</code></b> — ukáže ti top profitní itemy pro tvoji specializaci</li>
            <li><b>10k focus denně = 100-300k silver denně</b> profit v T4-T5</li>
            <li><b>Journal prodávej</b> pravidelně (každý den) — plné journaly jsou rychlý cash flow</li>
            <li><b>Postup dál:</b> T5 Master (57k fame) → T6 Grandmaster (231k fame) → T7 Elder (924k fame)</li>
        </ol>
    </div>
</div>
</body>
</html>
"""
    with open(path, "w", encoding="utf-8") as f:
        f.write(html)


if __name__ == "__main__":
    main()
