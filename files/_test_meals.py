"""
Rychly test: zjisti kolik meals se nacte z bulk dumpu pro T4-6.
Spust: python files/_test_meals.py
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from recipes import RecipeLoader

print("=== TEST MEALS ===")
rl = RecipeLoader()
rl._ensure_bulk_data()
if not rl.bulk_data:
    print("[X] bulk_data je prazdny - nemam data z ao-bin-dumps")
    sys.exit(1)

print(f"[OK] bulk_data obsahuje {len(rl.bulk_data)} itemu celkem")
all_meals = [k for k in rl.bulk_data if "_MEAL_" in k]
print(f"[OK] Z toho meals: {len(all_meals)}")
print(f"    Prvni meals: {all_meals[:10]}")

for t in [4, 5, 6, 7, 8]:
    ids = rl.get_meal_ids_for_tiers([t])
    with_recipe = sum(1 for i in ids if rl.bulk_data[i] is not None)
    print(f"  T{t}: {len(ids)} meal IDs, {with_recipe} s receptem")

print("=== HOTOVO ===")
