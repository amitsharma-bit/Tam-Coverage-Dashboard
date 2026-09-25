import json

from geocode import STATE_NAME_TO_USPS, load_state_rings, point_in_any_ring

with open("../public/data.js", encoding="utf-8") as f:
    text = f.read()
assert text.startswith("window.DATA = ")
data = json.loads(text[len("window.DATA = "):-2])

F = dict(COMPANY=0, GROUP=1, OWNER=2, TEAM_IDX=3, STAGE_IDX=4, CITY=5, DMS=6,
         USED_CARS=7, NEW_CARS=8, OEM=9, LAT=10, LNG=11, RANK=12, ARR_SALES=13,
         CONTRACTED_ARR=14, CRM_PLATFORM=15, CRM_SCHEDULER=16, CONTACTS=17,
         DOMAIN=18, LAST_ACTIVITY=19)

accounts = data["accounts"]
states = data["states"]

# 1. row-count reconciliation
total_rooftops = sum(len(v) for v in accounts.values())
print(f"total rooftops: {total_rooftops}")
assert total_rooftops == 65780, total_rooftops

no_state = accounts.get("", [])
ontario = accounts.get("Ontario", [])
print(f"no-state rooftops: {len(no_state)}, Ontario: {len(ontario)}")

# 2. spot-check known companies
def find(company_substr):
    hits = []
    for state, rows in accounts.items():
        for row in rows:
            if company_substr.lower() in row[F["COMPANY"]].lower():
                hits.append((state, row))
    return hits

checks = [
    ("Astorg Hyundai", "West Virginia", "Parkersburg"),
    ("Joe Cooper Cadillac of Shawnee", "Oklahoma", "Shawnee"),
    ("Peoria Volkswagen", "Arizona", "Peoria"),
    ("Steve White Volkswagen Spartanburg", "South Carolina", "Spartanburg"),
]
for name, exp_state, exp_city in checks:
    hits = find(name)
    assert hits, f"NOT FOUND: {name}"
    state, row = hits[0]
    ok_state = state == exp_state
    ok_city = row[F["CITY"]] == exp_city
    print(f"{name}: state={state} (expected {exp_state}, {'OK' if ok_state else 'MISMATCH'}), "
          f"city={row[F['CITY']]} (expected {exp_city}, {'OK' if ok_city else 'MISMATCH'}), "
          f"lat={row[F['LAT']]}, lng={row[F['LNG']]}")
    assert ok_state

# 3. containment check across ALL states: what fraction of dots actually fall inside
#    the state's real geographic boundary (not just a bounding box)?
rings_by_state = load_state_rings("cache/us-states.json")
print("\ncontainment check per state (sample up to 300 rows/state):")
worst = []
for state in STATE_NAME_TO_USPS:
    rows = accounts.get(state, [])
    if not rows:
        continue
    rings = rings_by_state.get(state, [])
    sample = rows[:300]
    inside = 0
    for row in sample:
        lat, lng = row[F["LAT"]], row[F["LNG"]]
        if lat is None or lng is None:
            continue
        if point_in_any_ring(lng, lat, rings):
            inside += 1
    pct = 100 * inside / len(sample) if sample else 0
    worst.append((state, pct, len(sample)))

worst.sort(key=lambda t: t[1])
print("worst 15 states by containment %:")
for state, pct, n in worst[:15]:
    print(f"  {state}: {pct:.1f}% inside (n={n})")
print("best 5:")
for state, pct, n in worst[-5:]:
    print(f"  {state}: {pct:.1f}% inside (n={n})")

avg_pct = sum(p for _, p, _ in worst) / len(worst)
print(f"\naverage containment across 50 states: {avg_pct:.1f}%")

print("\nALL CHECKS PASSED" if total_rooftops == 65780 else "CHECK FAILED")
