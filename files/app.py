"""
Albion Crafting Profit Analyzer — Streamlit Web App
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import streamlit as st
import streamlit.components.v1 as components

try:
    from albion_crafting import (
        run_analysis, CITY_BONUSES, FOOD_CITY_BONUSES, write_html_report,
    )
except Exception as _import_err:
    import traceback
    st.error(f"**Import error:** `{type(_import_err).__name__}: {_import_err}`")
    st.code(traceback.format_exc())
    st.stop()
from datetime import datetime, timezone

AUTO_CITY = "🌍 Automaticky (nejlepší město per item)"
ROYAL_CITIES = [c for c in CITY_BONUSES.keys() if c != "Caerleon"]

def run_analysis_auto(tiers, top, sort_by, focus_budget, bonus_only, min_volume,
                      enchants, no_caerleon, spec_level, station_fee, progress_callback,
                      mode="equipment", use_focus=True):
    """Spustí analýzu pro všechna royal cities a pro každý item vybere nejlepší craft city."""
    from collections import defaultdict
    all_best = {}  # item_id -> best row
    last_error = None  # pro informativní error message když všechno selže

    # Bez focusu neřaď podle silver_per_focus (není relevantní metrika)
    if not use_focus and sort_by == "silver_per_focus":
        sort_by = "profit_no_focus"

    # Klíč pro výběr "nejlepší" varianty itemu mezi městy záleží na focus módu
    best_key = "profit_focus" if use_focus else "profit_no_focus"

    cities = ROYAL_CITIES
    for i, city in enumerate(cities):
        if progress_callback:
            progress_callback(f"Analyzuji {city} ({i+1}/{len(cities)})...")
        try:
            _, rows = run_analysis(
                city=city, tiers=tiers, top=9999, sort_by=sort_by,
                focus_budget=focus_budget, bonus_only=bonus_only,
                min_volume=min_volume, history_days=7, enchants=enchants,
                no_caerleon=no_caerleon, spec_level=spec_level,
                station_fee=station_fee, out_dir=None, progress_callback=None,
                mode=mode, use_focus=use_focus,
            )
            for row in rows:
                item_id = row["item_id"]
                if item_id not in all_best or row[best_key] > all_best[item_id][best_key]:
                    row["best_craft_city"] = city
                    all_best[item_id] = row
        except Exception as e:
            last_error = f"{city}: {type(e).__name__}: {e}"
            continue

    if not all_best:
        mode_label = "jídel" if mode == "food" else "itemů"
        hint = ""
        if last_error:
            hint = f"\n\nDetail poslední chyby: {last_error}"
        if min_volume > 0:
            hint += f"\n\nTip: zkus snížit 'Min. denní volume' (aktuálně {min_volume}) v nastavení."
        raise ValueError(f"Žádné výsledky pro {mode_label} T{tiers}. "
                         f"Možná data nejsou dostupná nebo všechny itemy mají nízký volume.{hint}")

    top_rows = sorted(all_best.values(), key=lambda r: r[sort_by], reverse=True)[:top]
    for r in top_rows:
        if use_focus and focus_budget > 0:
            crafts = focus_budget // r["focus_cost"] if r["focus_cost"] > 0 else 0
            r["_daily_profit"] = crafts * r["profit_focus"]
        else:
            r["_daily_profit"] = r["profit_no_focus"]
    top_rows.sort(key=lambda r: r["_daily_profit"], reverse=True)

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if progress_callback:
        progress_callback("Generuji HTML report...")
    import tempfile, os
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".html")
    tmp.close()
    try:
        html = write_html_report(tmp.name, top_rows, "Více měst", tiers, focus_budget, today,
                                 mode=mode, use_focus=use_focus)
    finally:
        try: os.unlink(tmp.name)
        except: pass
    return html, top_rows

# ─── Stránka ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Albion Craft Analyzer",
    page_icon="⚔️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ─── Custom CSS — skryje Streamlit header, opraví scrollování ───────────────
st.markdown("""
<style>
/* Skryj výchozí Streamlit header a deploy tlačítko */
header[data-testid="stHeader"] { display: none !important; }
#MainMenu { visibility: hidden; }
.stDeployButton { display: none; }

/* Méně prázdného místa nahoře */
.block-container {
    padding-top: 1.5rem !important;
    padding-bottom: 2rem !important;
    max-width: 100% !important;
}

/* Iframe bez rámečku a bez vnitřního scrollbaru */
iframe {
    border: none !important;
    display: block;
}

/* Hezčí tabs */
.stTabs [data-baseweb="tab-list"] {
    gap: 8px;
    border-bottom: 2px solid #333;
    padding-bottom: 0;
}
.stTabs [data-baseweb="tab"] {
    padding: 8px 20px;
    border-radius: 8px 8px 0 0;
    font-weight: 500;
}

/* Sidebar nadpis */
[data-testid="stSidebar"] .stMarkdown h2 {
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
}
</style>
""", unsafe_allow_html=True)

st.title("⚔️ Albion Craft Profit Analyzer")
st.caption("Nejziskovější crafting příležitosti — živá data z [AODP](https://www.albion-online-data.com/).")

# ─── Tabs ───────────────────────────────────────────────────────────────────
tab_analyzer, tab_food, tab_guide = st.tabs(["📊 Analyzátor", "🍲 FOOD", "📖 Průvodce"])

# ═══════════════════════════════════════════════════════════════════════════
# SIDEBAR — nastavení (viditelný ve všech tabech)
# ═══════════════════════════════════════════════════════════════════════════
with st.sidebar:
    st.header("⚙️ Nastavení analýzy")

    city = st.selectbox(
        "🏙️ Craft city",
        options=[AUTO_CITY] + list(CITY_BONUSES.keys()),
        index=0,
        help="'Automaticky' = porovná všechna royal cities a pro každý item najde nejlepší. "
             "Nebo vyber konkrétní město kde máš postavu.",
    )
    if city == AUTO_CITY:
        st.caption("🔄 Porovná všechna royal cities — každý item dostane nejlepší craft city automaticky. Pomalejší (~30s).")
    else:
        # Zobraz jaký bonus má vybrané město
        bonus_cats = CITY_BONUSES.get(city, [])
        if bonus_cats:
            st.caption(f"✨ Bonus pro: {', '.join(bonus_cats[:3])}{'...' if len(bonus_cats) > 3 else ''}")

    tiers_selected = st.multiselect(
        "⚔️ Tiery",
        options=[4, 5, 6, 7, 8],
        default=[4],
        help="Které tiery chceš analyzovat. Vyšší tier = vyšší profit/kus, ale dražší suroviny.",
    )
    if not tiers_selected:
        tiers_selected = [4]

    enchants_selected = st.multiselect(
        "✨ Enchant levely",
        options=[0, 1, 2, 3],
        default=[0],
        help="0 = základní item, 1–3 = enchantovaná verze (.1 / .2 / .3). Enchantované itemy mají obvykle vyšší marži.",
    )
    if not enchants_selected:
        enchants_selected = [0]

    # ── Focus režim ─────────────────────────────────────────────
    focus_mode = st.radio(
        "🎯 Focus režim",
        options=["Mám focus", "Nemám focus dnes"],
        index=0,
        horizontal=True,
        help=(
            "Mám focus: běžný výpočet — focus snižuje spotřebu surovin (return rate ~47.9% base).\n"
            "Nemám focus: počítá bez focusu (RR 15.2% bez bonusu, 36.2% s city bonusem). "
            "Vhodné pro dny, kdy jsi už vyčerpal denní focus."
        ),
    )
    use_focus = (focus_mode == "Mám focus")

    if use_focus:
        focus_budget = st.number_input(
            "🎯 Denní focus budget",
            min_value=0,
            max_value=30_000,
            value=10_000,
            step=500,
            help="Premium hráč regeneruje 10 000 focus/den. Focus snižuje spotřebu surovin (return rate).",
        )
    else:
        focus_budget = 0
        st.caption("ℹ️ Bez focusu: profit se počítá za 1 kus (bez denního focus stropu). "
                   "Cost = suroviny s 15.2% RR (36.2% s city bonusem).")

    top = st.slider(
        "📋 Počet top itemů ve výsledku",
        min_value=5,
        max_value=100,
        value=30,
        step=5,
    )

    with st.expander("🔧 Pokročilá nastavení"):
        sort_by = st.selectbox(
            "Řadit výsledky podle",
            options=["silver_per_focus", "profit_focus", "profit_no_focus", "margin_focus_%"],
            format_func=lambda x: {
                "silver_per_focus":  "⭐ Silver per focus (doporučeno)",
                "profit_focus":      "💰 Profit s focusem (za kus)",
                "profit_no_focus":   "💰 Profit bez focusu (za kus)",
                "margin_focus_%":    "📈 Marže s focusem (%)",
            }[x],
        )

        min_volume = st.number_input(
            "Min. denní volume",
            min_value=0,
            max_value=200,
            value=10,
            step=5,
            help="Itemy s nižším průměrným denním prodejem budou odfiltrované. 0 = bez filtru.",
        )

        spec_level = st.slider(
            "Crafting spec level",
            min_value=0,
            max_value=100,
            value=4,
            step=1,
            help="Každý level přidá +0.3% return rate na suroviny.",
        )

        station_fee = st.number_input(
            "Poplatek za stanici (%)",
            min_value=0.0,
            max_value=5.0,
            value=1.5,
            step=0.1,
            format="%.1f",
            help="Poplatek craftovací stanici jako % z ceny surovin. Default 1.5% je standardní tax.",
        )

        bonus_only = st.checkbox(
            "Pouze itemy s city bonusem",
            value=False,
            help="Zobrazí jen kategorie, kde má vybrané město bonus (+37%). Rychlý denní přehled.",
        )

        no_caerleon = st.checkbox(
            "Vynechat Caerleon jako sell city",
            value=False,
            help="Caerleon má nejlepší ceny, ale přístup přes black zone portál (PvP risk).",
        )

    run_btn = st.button("🔍 Spustit analýzu", type="primary", use_container_width=True)

# ═══════════════════════════════════════════════════════════════════════════
# TAB 1 — ANALYZÁTOR
# ═══════════════════════════════════════════════════════════════════════════
with tab_analyzer:
    if run_btn:
        with st.status("Spouštím analýzu...", expanded=True) as status_widget:
            def on_progress(msg: str):
                status_widget.update(label=msg)

            try:
                if city == AUTO_CITY:
                    html, top_rows = run_analysis_auto(
                        tiers=tiers_selected, top=top, sort_by=sort_by,
                        focus_budget=focus_budget, bonus_only=bonus_only,
                        min_volume=min_volume, enchants=enchants_selected,
                        no_caerleon=no_caerleon, spec_level=spec_level,
                        station_fee=station_fee, progress_callback=on_progress,
                        use_focus=use_focus,
                    )
                else:
                    html, top_rows = run_analysis(
                        city=city, tiers=tiers_selected, top=top, sort_by=sort_by,
                        focus_budget=focus_budget, bonus_only=bonus_only,
                        min_volume=min_volume, history_days=7, enchants=enchants_selected,
                        no_caerleon=no_caerleon, spec_level=spec_level,
                        station_fee=station_fee, out_dir=None, progress_callback=on_progress,
                        use_focus=use_focus,
                    )
                status_widget.update(label="✅ Analýza dokončena!", state="complete")
            except ValueError as e:
                status_widget.update(label="❌ Chyba", state="error")
                st.error(str(e))
                st.stop()
            except Exception as e:
                status_widget.update(label="❌ Neočekávaná chyba", state="error")
                st.exception(e)
                st.stop()

        if top_rows:
            col1, col2, col3 = st.columns(3)
            best = top_rows[0]
            with col1:
                st.metric("🏆 Nejlepší item", best.get("name_en") or best["item_id"])
            with col2:
                if use_focus and focus_budget > 0:
                    crafts_best = focus_budget // best["focus_cost"] if best["focus_cost"] > 0 else 0
                    st.metric(
                        "💰 Denní profit (nejlepší)",
                        f"{crafts_best * best['profit_focus']:,} silver",
                        help="Za celý focus budget",
                    )
                else:
                    st.metric(
                        "💰 Profit za kus (bez focusu)",
                        f"{best['profit_no_focus']:,} silver",
                        help="Profit za 1 kus bez focusu (15.2% RR base).",
                    )
            with col3:
                st.metric("📦 Analyzovaných itemů", len(top_rows))

        st.divider()
        # Pevná výška s interním scrollbarem = netopí se to do Streamlit headeru
        # (předchozí varianta s dynamickou výškou + scrolling=False dělala, že
        # obsah "zajížděl" pod horní metriky při scrollu hlavní stránky)
        components.html(html, height=900, scrolling=True)

    else:
        st.info(
            "👈 Nastav parametry v levém panelu a klikni na **Spustit analýzu**.\n\n"
            "Data jsou stahována živě z [Albion Online Data Project](https://www.albion-online-data.com/). "
            "Aby byla data aktuální, musíš mít spuštěný AODP klient nebo si prohlédnout itemy přímo ve hře.",
            icon="ℹ️",
        )

# ═══════════════════════════════════════════════════════════════════════════
# TAB 2 — FOOD (jídla T3-T8)
# ═══════════════════════════════════════════════════════════════════════════
with tab_food:
    st.subheader("🍲 Food Analyzer — jídla pro craft profit")
    st.caption(
        "Stejná logika jako Equipment, ale scanuje **MEALs T3-T8** "
        "(PIE, SOUP, STEW, SALAD, SANDWICH, OMELETTE, ROAST). "
        "Enchanty se ignorují — jídla se neenchantují."
    )

    # Food-specific settings (vedle sidebar nastavení). Sdílí: tiery, focus, min_volume, spec_level atd.
    food_col1, food_col2, food_col3 = st.columns(3)
    with food_col1:
        food_city = st.selectbox(
            "🏙️ Craft city (food)",
            options=[AUTO_CITY] + list(FOOD_CITY_BONUSES.keys()),
            index=0,
            help="Chef's District město. 'Automaticky' porovná všechna royal cities.",
            key="food_city_select",
        )
        if food_city != AUTO_CITY:
            bonus_cats = FOOD_CITY_BONUSES.get(food_city, [])
            if bonus_cats:
                st.caption(f"👨‍🍳 Chef's bonus: {', '.join(bonus_cats)}")
            else:
                st.caption("Žádný chef's bonus (Caerleon)")
    with food_col2:
        food_tiers = st.multiselect(
            "⚔️ Tiery jídel",
            options=[3, 4, 5, 6, 7, 8],
            default=[4, 5, 6],
            key="food_tiers_select",
            help="T3 a výš. T6-T8 jídla jsou typicky nejvýdělečnější, ale pomalý obrat.",
        )
        if not food_tiers:
            food_tiers = [4, 5, 6]
    with food_col3:
        food_min_volume = st.number_input(
            "Min. denní volume",
            min_value=0,
            max_value=200,
            value=1,
            step=1,
            key="food_min_vol",
            help="Jídla mají obvykle nižší volume než zbroje (zvlášť T7-T8). "
                 "Doporučeno 1-3 pro vysoké tiery, 5-10 pro T4-T5. 0 = bez filtru.",
        )

    food_run_btn = st.button(
        "🔍 Spustit analýzu jídel",
        type="primary",
        use_container_width=True,
        key="food_run_btn",
    )

    if food_run_btn:
        # === DIAGNOSTIKA: zkus vytáhnout meal IDs z bulk dumpu ===
        with st.expander("🔬 Diagnostika (rozklikni pro detaily)", expanded=True):
            # Version marker — pokud nevidíš v4, Streamlit má ještě starý modul v cache
            st.caption("Diagnostika verze: **v7** (2026-04-24, root items.json)")

            # PŘÍMÝ HTTP TEST — obejdeme recipes.py úplně
            import requests as _requests
            _test_urls = [
                "https://cdn.jsdelivr.net/gh/ao-data/ao-bin-dumps@master/formatted/items.json",
                "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/formatted/items.json",
                "https://github.com/ao-data/ao-bin-dumps/raw/master/formatted/items.json",
            ]
            st.write("**Přímý HTTP test všech 3 URL:**")
            _any_success = False
            for _url in _test_urls:
                try:
                    _r = _requests.get(_url, timeout=60, headers={"User-Agent": "albion-crafting/1.0"}, stream=True)
                    _size_mb = len(_r.content) / 1024 / 1024 if _r.content else 0
                    if _r.status_code == 200:
                        st.success(f"✅ {_url[:60]}... → HTTP 200, {_size_mb:.1f} MB")
                        _any_success = True
                    else:
                        st.error(f"❌ {_url[:60]}... → HTTP {_r.status_code}")
                except Exception as _err:
                    st.error(f"❌ {_url[:60]}... → {type(_err).__name__}: {str(_err)[:200]}")

            if not _any_success:
                st.error("🚨 **ŽÁDNÁ URL nefunguje** — Streamlit Cloud nemá přístup k ao-bin-dumps. "
                         "Řešení: bundlovat data přímo v repu.")
                st.stop()

            # Přímý parsing test — použij ROOT items.json (ten má crafting data)
            st.write("**Parsing test ROOT items.json (má crafting data):**")
            try:
                _r = _requests.get(
                    "https://raw.githubusercontent.com/ao-data/ao-bin-dumps/master/items.json",
                    timeout=120, headers={"User-Agent": "albion-crafting/1.0"}
                )
                _r.raise_for_status()
                _raw_json = _r.json()
                st.success(f"✅ JSON parsed. Top-level type: **{type(_raw_json).__name__}**")
                if isinstance(_raw_json, list):
                    st.write(f"Flat list: {len(_raw_json)} itemů")
                    if _raw_json:
                        _first = _raw_json[0]
                        st.write(f"První item keys: `{list(_first.keys())[:15] if isinstance(_first, dict) else type(_first).__name__}`")
                        # Najdi první meal
                        _first_meal = next((it for it in _raw_json if isinstance(it, dict) and "_MEAL_" in str(it.get("@uniquename", ""))), None)
                        if _first_meal:
                            st.write(f"První MEAL item: `{str(_first_meal)[:400]}...`")
                        else:
                            st.warning("V flat listu nenalezen žádný MEAL item")
                elif isinstance(_raw_json, dict):
                    _keys = list(_raw_json.keys())[:20]
                    st.write(f"Dict top-level klíče: {_keys}")
                    _items_raw = _raw_json.get("items", _raw_json)
                    if isinstance(_items_raw, dict):
                        st.write(f"Sub-klíče v 'items' (nebo root): {list(_items_raw.keys())[:20]}")
            except Exception as _parse_err:
                import traceback as _tb
                st.error(f"❌ Parsing selhal: {type(_parse_err).__name__}: {_parse_err}")
                st.code(_tb.format_exc())

            try:
                from recipes import RecipeLoader, AO_BIN_DUMPS_URLS
                st.write(f"URL fallback list: {len(AO_BIN_DUMPS_URLS)} cest")
                _diag_loader = RecipeLoader()
                st.write("**Krok 1:** Stahuji bulk dump z ao-bin-dumps...")
                _diag_loader._ensure_bulk_data()
                if not _diag_loader.bulk_data:
                    st.error("❌ Bulk dump je PRÁZDNÝ — stažení selhalo. Nelze pokračovat.")
                    _err = getattr(_diag_loader, "bulk_data_error", None)
                    if _err:
                        st.code(f"Detail chyby:\n{_err}")
                    else:
                        st.info("Detail chyby nedostupný — pravděpodobně starý kód v cache. "
                                "Rebootni Streamlit app pomocí 'Reboot app'.")
                    st.stop()
                st.success(f"✅ Bulk dump OK: {len(_diag_loader.bulk_data):,} itemů")
                _meal_ids = _diag_loader.get_meal_ids_for_tiers(list(food_tiers))
                _with_recipe = sum(1 for i in _meal_ids if _diag_loader.bulk_data.get(i))
                st.write(f"**Krok 2:** Nalezeno **{len(_meal_ids)} meal IDs** pro tiery {food_tiers}, "
                         f"**{_with_recipe} s receptem**")
                if len(_meal_ids) == 0:
                    all_meals = [k for k in _diag_loader.bulk_data if "_MEAL_" in k]
                    st.warning(f"⚠️ Žádné meals pro tyto tiery. Celkem meals v dumpu: {len(all_meals)}. "
                               f"Prvních 20: {all_meals[:20]}")
                else:
                    st.write(f"Prvních 5 meal IDs: `{_meal_ids[:5]}`")
                    # Ukázka prvního receptu
                    first_recipe = _diag_loader.bulk_data.get(_meal_ids[0])
                    st.write(f"První recept ({_meal_ids[0]}): `{first_recipe}`")
            except Exception as _e:
                st.error(f"❌ Diagnostika selhala: {type(_e).__name__}: {_e}")
                import traceback
                st.code(traceback.format_exc())

        with st.status("Spouštím food analýzu...", expanded=True) as status_widget:
            def on_progress_food(msg: str):
                status_widget.update(label=msg)

            try:
                if food_city == AUTO_CITY:
                    html_food, top_rows_food = run_analysis_auto(
                        tiers=food_tiers, top=top, sort_by=sort_by,
                        focus_budget=focus_budget, bonus_only=bonus_only,
                        min_volume=food_min_volume, enchants=[0],
                        no_caerleon=no_caerleon, spec_level=spec_level,
                        station_fee=station_fee, progress_callback=on_progress_food,
                        mode="food", use_focus=use_focus,
                    )
                else:
                    html_food, top_rows_food = run_analysis(
                        city=food_city, tiers=food_tiers, top=top, sort_by=sort_by,
                        focus_budget=focus_budget, bonus_only=bonus_only,
                        min_volume=food_min_volume, history_days=7, enchants=[0],
                        no_caerleon=no_caerleon, spec_level=spec_level,
                        station_fee=station_fee, out_dir=None,
                        progress_callback=on_progress_food, mode="food",
                        use_focus=use_focus,
                    )
                status_widget.update(label="✅ Food analýza dokončena!", state="complete")
            except ValueError as e:
                status_widget.update(label="❌ Chyba", state="error")
                st.error(str(e))
                import traceback
                with st.expander("🔬 Traceback (pro debug)"):
                    st.code(traceback.format_exc())
                st.stop()
            except Exception as e:
                status_widget.update(label="❌ Neočekávaná chyba", state="error")
                st.exception(e)
                st.stop()

        if top_rows_food:
            col1, col2, col3 = st.columns(3)
            best_f = top_rows_food[0]
            with col1:
                st.metric("🏆 Nejlepší jídlo", best_f.get("name_en") or best_f["item_id"])
            with col2:
                if use_focus and focus_budget > 0:
                    crafts_best_f = focus_budget // best_f["focus_cost"] if best_f["focus_cost"] > 0 else 0
                    st.metric(
                        "💰 Denní profit (nejlepší)",
                        f"{crafts_best_f * best_f['profit_focus']:,} silver",
                        help="Za celý focus budget",
                    )
                else:
                    st.metric(
                        "💰 Profit za kus (bez focusu)",
                        f"{best_f['profit_no_focus']:,} silver",
                        help="Profit za 1 kus bez focusu (15.2% RR base).",
                    )
            with col3:
                st.metric("📦 Analyzovaných jídel", len(top_rows_food))

        st.divider()
        components.html(html_food, height=900, scrolling=True)

    else:
        st.info(
            "👆 Nastav food parametry výše, sdílené nastavení (focus budget, spec level, sort by) "
            "najdeš v levém panelu. Pak klikni **Spustit analýzu jídel**.",
            icon="ℹ️",
        )

# ═══════════════════════════════════════════════════════════════════════════
# TAB 3 — PRŮVODCE
# ═══════════════════════════════════════════════════════════════════════════
with tab_guide:
    st.header("📖 Jak používat Albion Craft Analyzer")

    # ── Rychlý start ──
    st.subheader("🚀 Rychlý start")
    st.markdown("""
1. **Vyber Craft city** — město kde craftíš (vlevo v panelu)
2. **Vyber tier** — začni s T4 nebo T5
3. **Klikni Spustit analýzu** — stáhne živá data a spočítá profit
4. **Koukni na výsledky** — itemy seřazené od nejziskovějšího
5. **Nakup suroviny, craftuj, prodej** v doporučeném městě
    """)

    st.divider()

    # ── Výsledky ──
    st.subheader("📊 Jak číst výsledky")

    col1, col2 = st.columns(2)
    with col1:
        st.markdown("""
**Karta každého itemu zobrazuje:**
- 🏆 **Název itemu** a tier/enchant
- 💰 **Profit za kus** (s focusem / bez focusu)
- 🎯 **Silver per focus** — hlavní metrika efektivity
- 📦 **Denní volume** — kolik kusů se průměrně prodá/den
- 🏙️ **Kam prodat** — tabulka měst s cenami a trendem
        """)
    with col2:
        st.markdown("""
**Trend šipky v tabulce měst:**
- ↑ **zelená** — cena roste (>5% za týden)
- ↓ **červená** — cena klesá (>5% za týden)
- → **šedá** — cena stabilní

**Grafy pod kartou:**
- **Horní graf** — denní volume (kolik kusů se prodalo)
- **Spodní graf** — průměrná cena (modrá čára = aktuální sell_min, tečkovaná = 7d medián pro referenci)
        """)

    st.divider()

    # ── Metriky ──
    st.subheader("📈 Co znamenají metriky")
    st.markdown("""
| Metrika | Popis |
|---------|-------|
| **Silver per focus** ⭐ | Kolik silver vyděláš za každý bod focusu. **Nejlepší metrika pro porovnání** — zohledňuje jak profit, tak náklady na focus. |
| **Profit s focusem** | Zisk na jeden craftovaný kus při použití focusu. Focus snižuje spotřebu surovin (return rate ~62.9%). |
| **Profit bez focusu** | Zisk na kus bez focusu (return rate ~47.9%). Pro hráče bez premium nebo ke konci dne. |
| **Marže (%)** | Profit jako % z výrobních nákladů. Vyšší % = větší polštář při poklesu cen. |
| **Denní profit** | Profit za celý denní focus budget (10 000 focus u premium). Reálný denní výdělek. |
| **Prodejní cena** | Aktuální sell_min z AODP (nejnižší výprodejní order). 7d medián je jen referenční čára v grafu. |
    """)

    st.divider()

    # ── Nastavení ──
    st.subheader("⚙️ Popis nastavení")
    st.markdown("""
**Craft city** — město kde stojíš u craftovací stanice. Každé město má bonus **+37% crafting return rate** pro určité kategorie:

| Město | Bonus pro |
|-------|-----------|
| 🟠 Bridgewatch | Crossbow, Dagger, Cursed Staff |
| 🟢 Lymhurst | Sword, Bow, Cloth armor |
| ⬜ Fort Sterling | Axe, Hammer, Plate armor |
| 🔵 Martlock | Shield, Quarterstaff, Leather armor |
| 🟣 Thetford | Spear, Nature/Holy Staff, Off-hands |
| ⚫ Caerleon | Žádný bonus (ale nejlepší ceny na trhu) |

**Focus budget** — premium hráč regeneruje 10 000 focus/den. Pokud nemáš premium, dej 0.

**Enchant levely** — .1/.2/.3 verze itemů mají obvykle lepší marži, ale vyžadují runestones/soulstones.

**Min. denní volume** — bezpečnostní filtr. Itemy s nízkým volume jsou těžko prodejné — môžeš čekat týdny.

**Spec level** — každý level craftovacího specialization přidá +0.3% return rate. Najdeš ho v destiny boardu.

**Station fee** — poplatek stanici v % z hodnoty surovin. Záleží kdo stanici vlastní (typicky 1–3%).
    """)

    st.divider()

    # ── Tipy ──
    st.subheader("💡 Tipy a triky")
    st.markdown("""
- **Začni s "Pouze itemy s city bonusem"** — výsledky budou nejlepší, protože +37% bonus výrazně zlepší return rate.

- **AODP data nejsou vždy aktuální** — pokud vidíš "žádná data", prohlédni si itemy přímo v Albionu. Tím se data nahrají do AODP.

- **Sell v jiném městě než craftíš** — nástroj automaticky hledá nejlepší prodejní město. Transport fee je zahrnutý v kalkulaci.

- **Caerleon má nejlepší ceny**, ale je v black zone (PvP). Pokud nechceš riskovat, zaškrtni "Vynechat Caerleon".

- **Trend šipky jsou klíčové** — item s ↑ trendem je bezpečnější volba než item s ↓ trendem, i kdyby měl momentálně vyšší cenu.

- **T4 pro začátečníky, T6-T8 pro pokročilé** — vyšší tiery mají vyšší absolutní profit, ale potřebuješ víc startovního kapitálu.

- **Enchanted (.1/.2/.3) itemy** mají obvykle nejlepší marže, protože méně hráčů je craftuje. Potřebuješ ale runestones/soulstones/relics.
    """)

    st.divider()

    # ── FAQ ──
    st.subheader("❓ Časté otázky")

    with st.expander("Proč mi analýza nenašla žádné itemy?"):
        st.markdown("""
AODP (Albion Online Data Project) potřebuje, aby někdo nedávno navštívil trhák s těmito itemy.
Řešení:
1. Jdi do Albionu
2. Navštiv trhák ve svém craft city
3. Podívej se na itemy které chceš craftovat (stačí otevřít okno prodeje)
4. Spusť analýzu znovu za ~5 minut
        """)

    with st.expander("Jaký je rozdíl mezi profit s focusem a bez?"):
        st.markdown("""
**Focus** je herní mechanika pro premium hráče. Při crafting s focusem dostaneš zpět část surovin:
- **Bez focusu**: return rate ~47.9% (základní craftovací bonus)
- **S focusem**: return rate ~62.9% (premium bonus)

Prakticky: craftuješ-li s focusem, potřebuješ méně surovin na stejný počet itemů = nižší náklady = vyšší profit.
        """)

    with st.expander("Co je AODP a proč jsou data někdy stará?"):
        st.markdown("""
**Albion Online Data Project** je komunitní projekt kde hráči sdílejí trhové ceny.
Funguje takto:
1. Hráč si nainstaluje AODP klient
2. Klient automaticky nahrává ceny které hráč vidí na trháku
3. Data jsou dostupná přes veřejné API

Data mohou být stará pokud daný item nikdo nedávno nenavštívil na trháku. Nástroj používá aktuální **sell_min** (nejnižší výprodejní order). V grafu se pro porovnání zobrazuje i **7-denní medián** — pokud je sell_min výrazně pod mediánem, může jít o outlier.
        """)

    with st.expander("Proč se liší ceny v různých městech?"):
        st.markdown("""
Každé město má svůj vlastní trhák a hráči tam nakupují i prodávají lokálně.
Caerleon bývá nejdražší (centrální black zone hub), Royal cities jsou levnější.
Nástroj automaticky hledá město kde je nejvyšší sell cena a zahrne i transport fee (stříbro za převoz).
        """)
