import csv
import json
import os
import urllib.request

from geocode import STATE_NAME_TO_USPS, load_state_rings, point_in_any_ring

SHEET_ID = "1SS9KE18vbV1LmYWRcn3NhGaT2C1MVba33qgLGb5AOFk"
CSV_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0"
CACHE_PATH = "cache/cslive_sheet.csv"


def fetch_sheet():
    print("downloading CS Live sheet...")
    req = urllib.request.Request(CSV_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read()
    with open(CACHE_PATH, "wb") as f:
        f.write(raw)
    print(f"  saved {len(raw)} bytes to {CACHE_PATH}")


def clean(v):
    if v is None:
        return None
    v = v.strip()
    return v if v else None


def titleize_type(v):
    if not v:
        return None
    return v.replace("_", " ").title()


def main():
    fetch_sheet()
    with open(CACHE_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        reader.fieldnames = [fn.strip() for fn in reader.fieldnames]
        rows = list(reader)
    print(f"  {len(rows)} raw rows, columns: {reader.fieldnames}")

    rings = load_state_rings("cache/us-states.json")

    def find_state(lat, lng):
        for name, rs in rings.items():
            if point_in_any_ring(lng, lat, rs):
                return name
        return None

    accounts = []
    skipped_stage = 0
    outside_us = 0
    for r in rows:
        ps = clean(r.get("Product Stage"))
        if not ps:
            continue
        parts = ps.split()
        stage = parts[-1]
        product = " ".join(parts[:-1])
        if stage not in ("Live", "Onboarding"):
            skipped_stage += 1
            continue

        try:
            geo = json.loads(r["geo_coordinates"])
            lat, lng = float(geo["lat"]), float(geo["lng"])
        except Exception:
            lat = lng = None

        state = find_state(lat, lng) if lat is not None else None
        if state is None:
            outside_us += 1

        accounts.append([
            clean(r.get("rooftop_name")),        # 0 rooftop
            clean(r.get("enterprise_name")),      # 1 group/company
            clean(r.get("Company Domain")),       # 2 domain
            clean(r.get("city")),                 # 3 city
            state,                                # 4 state (derived from coordinates)
            product,                              # 5 product: Studio | Vini
            stage,                                # 6 stage: Live | Onboarding
            titleize_type(clean(r.get("account_type"))),  # 7 account type
            clean(r.get("csm_poc")),              # 8 csm
            lat,                                  # 9 lat
            lng,                                  # 10 lng
            clean(r.get("enterprise_id")),        # 11 enterprise id (companies count basis)
            clean(r.get("rooftop_id")),           # 12 rooftop id
        ])

    print(f"  {len(accounts)} accounts kept (Live/Onboarding), {skipped_stage} skipped (other stage), {outside_us} outside 50 states+DC")

    products = sorted(set(a[5] for a in accounts))
    total_companies = len(set(a[11] for a in accounts))
    states_with_data = len(set(a[4] for a in accounts if a[4]))
    print(f"  distinct companies: {total_companies}, states with data: {states_with_data}")

    final = {
        "accounts": accounts,
        "products": products,
        "stages": ["Live", "Onboarding"],
    }

    with open("../public/cslive-data.js", "w", encoding="utf-8") as f:
        f.write("window.DATA_CSLIVE = ")
        json.dump(final, f, separators=(",", ":"))
        f.write(";\n")

    size_kb = os.path.getsize("../public/cslive-data.js") / 1024
    print(f"wrote ../public/cslive-data.js ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
