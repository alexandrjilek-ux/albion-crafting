"""Automatic loader for Albion public events and bonus reference data."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

import requests

SOURCE_URL = "https://www.albiondatabase.com/events"

DAILY_FALLBACK = [
    ("COMMON_SWORD", "Swords"),
    ("COMMON_AXE", "Axes"),
    ("COMMON_CROSSBOW", "Crossbows"),
    ("COMMON_HAMMER", "Hammers"),
    ("COMMON_MACE", "Maces"),
    ("COMMON_KNUCKLES", "Knuckles"),
    ("COMMON_PLATE_HELMET", "Plate Helmets"),
    ("COMMON_PLATE_ARMOR", "Plate Armor"),
    ("COMMON_PLATE_SHOES", "Plate Shoes"),
    ("COMMON_SPEAR", "Spears"),
    ("COMMON_BOW", "Bows"),
    ("COMMON_NATURESTAFF", "Nature Staffs"),
    ("COMMON_DAGGER", "Daggers"),
    ("COMMON_QUARTERSTAFF", "Quarterstaffs"),
    ("COMMON_SHAPESHIFTERSTAFF", "Shapeshifter Staffs"),
    ("COMMON_LEATHER_HELMET", "Leather Helmets"),
    ("COMMON_LEATHER_ARMOR", "Leather Armor"),
    ("COMMON_LEATHER_SHOES", "Leather Shoes"),
    ("COMMON_ARCANESTAFF", "Arcane Staffs"),
    ("COMMON_CURSESTAFF", "Curse Staffs"),
    ("COMMON_FIRESTAFF", "Fire Staffs"),
    ("COMMON_FROSTSTAFF", "Frost Staffs"),
    ("COMMON_HOLYSTAFF", "Holy Staffs"),
    ("COMMON_CLOTH_HELMET", "Cloth Helmets"),
    ("COMMON_CLOTH_ARMOR", "Cloth Armor"),
    ("COMMON_CLOTH_SHOES", "Cloth Shoes"),
    ("COMMON_OFFHAND", "Off-Hands"),
    ("COMMON_FIBER", "Fiber"),
    ("COMMON_WOOD", "Wood"),
    ("COMMON_ROCK", "Rock"),
    ("COMMON_ORE", "Ore"),
    ("COMMON_HIDE", "Hide"),
    ("COMMON_TOOLS", "Tools"),
    ("COMMON_GATHERERGEAR", "Gatherer Gear"),
    ("COMMON_POTION", "Potions"),
    ("COMMON_FOOD", "Food"),
    ("COMMON_BAG", "Bags"),
    ("COMMON_CAPE", "Capes"),
]

ACTIVITY_FALLBACK = [
    ("HELLGATE", "Hellgate Frenzy"),
    ("CORRUPTED", "Corrupted Dungeoneering"),
    ("HELLDUNGEON", "Call of the Depths"),
    ("FACTIONPOINTS", "Faction Rivalry"),
    ("GROUP_AND_RAID_DUNGEONS", "Gather Your Party"),
    ("STATIC_DUNGEONS", "Invade the Enemy Strongholds"),
    ("SOLO_DUNGEONS", "Solo Dungeoneering"),
    ("ROAMING_MOBS", "Roam the Open World"),
    ("ROADS", "Roads of Avalon"),
    ("MISTS", "Mist Opportunities"),
    ("FAME", "Fame Rush"),
]

GATHERING_FALLBACK = [
    ("ORE", "Gathering Bonus: Ore"),
    ("ROCK", "Gathering Bonus: Stone"),
    ("WOOD", "Gathering Bonus: Wood"),
    ("FIBER", "Gathering Bonus: Fiber"),
    ("HIDE", "Gathering Bonus: Hide"),
    ("FISHING", "Gathering Bonus: Fishing"),
    ("TRACKING", "The Great Hunt"),
]


def get_bonus_calendar() -> dict[str, Any]:
    """Fetch public bonus data and return a normalized payload."""
    try:
        html = _fetch_source_html()
        source_available = True
    except Exception:
        # Calendar tab je hlavně ruční picker pro bonusy ve hře. Když veřejný
        # zdroj nebo DNS zrovna nejede, nesmí kvůli tomu spadnout celý tab.
        html = ""
        source_available = False
    daily = _extract_entries(html, DAILY_FALLBACK) or _entries(DAILY_FALLBACK)
    activities = _extract_entries(html, ACTIVITY_FALLBACK, duration=(2, 3)) or _entries(
        ACTIVITY_FALLBACK,
        duration=(2, 3),
    )
    gathering = _extract_entries(html, GATHERING_FALLBACK, duration=(2, 3)) or _entries(
        GATHERING_FALLBACK,
        duration=(2, 3),
    )

    return {
        "daily_crafting": daily,
        "rotating_activities": activities,
        "rotating_gathering": gathering,
        "source_url": SOURCE_URL,
        "source_updated_label": _extract_source_updated_label(html) if source_available else None,
        "exact_week_schedule_available": False,
        "note": (
            "Public source exposes the current bonus pools and rotation rules, "
            "but not an exact upcoming day-by-day weekly schedule."
            if source_available
            else "Public source was unavailable, so this response uses the bundled fallback bonus list."
        ),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def _fetch_source_html() -> str:
    response = requests.get(SOURCE_URL, timeout=20)
    response.raise_for_status()
    return response.text


def _extract_entries(
    html: str,
    fallback: list[tuple[str, str]],
    *,
    duration: tuple[int, int] | None = None,
) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    for code, fallback_label in fallback:
        label = _extract_label_for_code(html, code) or fallback_label
        entries.append(_entry(code, label, duration=duration))
    return entries


def _extract_label_for_code(html: str, code: str) -> str | None:
    # Next.js Flight data embeds rows as `"KEY", {... "children":"Label"}`.
    # Regex držíme úzce na konkrétní key, aby fallback převzal kontrolu při změně markup.
    pattern = rf'"{re.escape(code)}".{{0,260}}?"children":"([^"]+)"'
    match = re.search(pattern, html)
    return match.group(1) if match else None


def _extract_source_updated_label(html: str) -> str | None:
    match = re.search(
        r"Data:\s*([A-Za-z]{3,9}\s+\d{1,2},\s+\d{4})\s*·\s*Updated\s*([A-Za-z0-9 ]+)",
        html,
    )
    if not match:
        return None
    return f"Data: {match.group(1).strip()} · Updated {match.group(2).strip()}"


def _entries(
    rows: list[tuple[str, str]],
    *,
    duration: tuple[int, int] | None = None,
) -> list[dict[str, Any]]:
    return [_entry(code, label, duration=duration) for code, label in rows]


def _entry(
    code: str,
    label: str,
    *,
    duration: tuple[int, int] | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "label": label,
        "duration_days_min": duration[0] if duration else None,
        "duration_days_max": duration[1] if duration else None,
    }
