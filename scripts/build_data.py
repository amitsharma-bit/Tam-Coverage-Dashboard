import csv
import json
import random
from collections import defaultdict, Counter

from geocode import (
    STATE_NAME_TO_USPS,
    jitter_in_state,
    load_state_rings,
    load_zcta_lookup,
    load_place_lookup,
    normalize_city,
    zero_pad_zip,
)

CSV_PATH = "/Users/amitsharma/Downloads/Hubspot CSV/hubspot-custom-report-usa-tam-relevant-2026-09-24/usa-tam-relevant.csv"

COL = {
    "company": 0, "domain": 1, "last_activity": 2, "deal_stage": 3, "demo_completed": 4,
    "contract_closed_on": 5, "owner": 6, "used_cars": 7, "new_cars": 8, "contacts": 9,
    "group": 10, "owner_assigned": 11, "dms": 12, "country": 13, "state": 14,
    "region_code": 15, "city": 16, "pincode": 17, "postal": 18, "data_type": 19,
    "rank": 20, "company_id": 21, "org_id": 22, "stage": 23, "team": 24,
    "crm_scheduler": 25, "crm_platform": 26, "oem": 27, "arr_sales": 28,
    "contracted_arr": 29, "company_id2": 30, "deal_id": 31, "group_id": 32,
}

STAGE_ORDER = ["Prospect", "In Pipeline", "Contract Closed", "Drop Off"]
STAGE_IDX = {s: i for i, s in enumerate(STAGE_ORDER)}
NOSTATE = ""


def clean(v):
    if v is None:
        return None
    v = v.strip()
    if v == "" or v == "(No value)":
        return None
    return v


def to_num(v):
    v = clean(v)
    if v is None:
        return None
    v = v.replace(",", "").replace("$", "")
    try:
        f = float(v)
        return int(f) if f == int(f) else f
    except ValueError:
        return None


def main():
    print("reading CSV...")
    rows = []
    with open(CSV_PATH, encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader)
        assert len(header) == 33, f"unexpected column count: {len(header)}"
        for r in reader:
            rows.append(r)
    print(f"  {len(rows)} raw rows")

    # ---- clean pass ----
    cleaned = []
    for r in rows:
        rec = {
            "company": (clean(r[COL["company"]]) or "").strip(),
            "domain": clean(r[COL["domain"]]),
            "last_activity": clean(r[COL["last_activity"]]),
            "owner": clean(r[COL["owner"]]),
            "used_cars": to_num(r[COL["used_cars"]]),
            "new_cars": to_num(r[COL["new_cars"]]),
            "contacts": to_num(r[COL["contacts"]]),
            "group": clean(r[COL["group"]]),
            "dms": clean(r[COL["dms"]]),
            "state": clean(r[COL["state"]]),
            "city": clean(r[COL["city"]]),
            "pincode": clean(r[COL["pincode"]]),
            "postal": clean(r[COL["postal"]]),
            "rank": clean(r[COL["rank"]]),
            "company_id": clean(r[COL["company_id"]]) or clean(r[COL["company_id2"]]),
            "org_id": clean(r[COL["org_id"]]),
            "stage": clean(r[COL["stage"]]),
            "team": clean(r[COL["team"]]),
            "crm_scheduler": clean(r[COL["crm_scheduler"]]),
            "crm_platform": clean(r[COL["crm_platform"]]),
            "oem": clean(r[COL["oem"]]),
            "arr_sales": to_num(r[COL["arr_sales"]]),
            "contracted_arr": to_num(r[COL["contracted_arr"]]),
            "deal_id": clean(r[COL["deal_id"]]),
        }
        if not rec["company_id"] or not rec["stage"]:
            continue
        cleaned.append(rec)
    print(f"  {len(cleaned)} usable rows after clean")

    # ---- dedupe by Company ID ----
    groups = defaultdict(list)
    for rec in cleaned:
        groups[rec["company_id"]].append(rec)

    mismatches = 0
    canonical = []
    for cid, grp in groups.items():
        base = grp[0]
        for g in grp[1:]:
            if (g["state"] != base["state"] or g["team"] != base["team"]
                    or g["stage"] != base["stage"] or g["org_id"] != base["org_id"]):
                mismatches += 1
        arr_sales_sum = sum(g["arr_sales"] for g in grp if g["arr_sales"]) or None
        contracted_sum = sum(g["contracted_arr"] for g in grp if g["contracted_arr"]) or None
        last_activity = max((g["last_activity"] for g in grp if g["last_activity"]), default=None)
        rec = dict(base)
        rec["arr_sales"] = arr_sales_sum
        rec["contracted_arr"] = contracted_sum
        rec["last_activity"] = last_activity
        canonical.append(rec)
    print(f"  {len(canonical)} canonical rooftops (Company ID deduped), {mismatches} field mismatches within a group")

    # ---- state bucketing ----
    for rec in canonical:
        st = rec["state"]
        if st is None:
            rec["bucket"] = NOSTATE
        elif st == "Ontario":
            rec["bucket"] = "Ontario"
        elif st in STATE_NAME_TO_USPS:
            rec["bucket"] = st
        else:
            rec["bucket"] = NOSTATE

    bucket_counts = Counter(rec["bucket"] for rec in canonical)
    print("  bucket counts (top 10):", bucket_counts.most_common(10))
    print("  no-state bucket size:", bucket_counts[NOSTATE])

    # ---- real state boundary GeoJSON (WGS84 lat/lng) ----
    with open("cache/us-states.json", encoding="utf-8") as f:
        us_states_geojson = json.load(f)
    # keep only the 50 states we actually use (drop Puerto Rico; DC kept for map "nodata" rendering)
    us_states_geojson["features"] = [
        feat for feat in us_states_geojson["features"]
        if feat["properties"].get("name") in STATE_NAME_TO_USPS
        or feat["properties"].get("name") == "District of Columbia"
    ]
    rings_by_state = load_state_rings("cache/us-states.json")

    # ---- geocoding lookups ----
    print("loading ZCTA / place lookups...")
    zcta = load_zcta_lookup("cache/2023_Gaz_zcta_national.txt")
    places = load_place_lookup("cache/2023_Gaz_place_national.txt")
    print(f"  {len(zcta)} ZCTAs, {len(places)} places")

    tier_counts = Counter()
    rng = random.Random(42)

    for rec in canonical:
        state = rec["bucket"]
        if state not in STATE_NAME_TO_USPS:
            rec["lat"] = None
            rec["lng"] = None
            continue
        usps = STATE_NAME_TO_USPS[state]

        latlng = None
        zip5 = zero_pad_zip(rec["postal"]) or zero_pad_zip(rec["pincode"])
        if zip5 and zip5 in zcta:
            latlng = zcta[zip5]
            tier_counts["zip"] += 1
        elif rec["city"]:
            key = (usps, normalize_city(rec["city"]))
            if key in places:
                latlng = places[key]
                tier_counts["city"] += 1

        if not latlng:
            latlng = jitter_in_state(state, rings_by_state, rng)
            tier_counts["jitter"] += 1

        rec["lat"], rec["lng"] = latlng

    print("  geocode tiers:", dict(tier_counts))
    total_us = sum(1 for r in canonical if r["bucket"] in STATE_NAME_TO_USPS)
    jitter_pct = 100 * tier_counts["jitter"] / total_us if total_us else 0
    print(f"  jitter-tier: {jitter_pct:.2f}% of US-bucketed rows")

    # ---- teams ----
    team_counts = Counter()
    for rec in canonical:
        t = rec["team"]
        if t is None or t == "Not Assigned":
            rec["team_norm"] = "Unassigned"
        else:
            rec["team_norm"] = t
        team_counts[rec["team_norm"]] += 1

    real_teams = sorted(
        [t for t in team_counts if t != "Unassigned"],
        key=lambda t: -team_counts[t],
    )
    acct_teams = real_teams + ["Unassigned"]
    team_to_idx = {t: i for i, t in enumerate(acct_teams)}
    unassigned_idx = team_to_idx["Unassigned"]
    print("  realTeams:", real_teams)

    cell_keys = ["All", "Spyne"] + real_teams + ["Unassigned"]

    # ---- aggregate states.cells ----
    states_out = {}
    accounts_out = defaultdict(list)

    all_buckets = set(rec["bucket"] for rec in canonical) | {NOSTATE}
    for bucket in all_buckets:
        if bucket == NOSTATE:
            continue
        recs_in_bucket = [r for r in canonical if r["bucket"] == bucket]
        cells = {}
        for key in cell_keys:
            if key == "All":
                sel = recs_in_bucket
            elif key == "Spyne":
                sel = [r for r in recs_in_bucket if r["team_norm"] != "Unassigned"]
            else:
                sel = [r for r in recs_in_bucket if r["team_norm"] == key]

            co_orgs_by_stage = defaultdict(set)
            rf_count_by_stage = Counter()
            for r in sel:
                si = STAGE_IDX.get(r["stage"])
                if si is None:
                    continue
                co_orgs_by_stage[si].add(r["org_id"])
                rf_count_by_stage[si] += 1

            co_vec = [len(set().union(*co_orgs_by_stage.values())) if co_orgs_by_stage else 0]
            rf_vec = [sum(rf_count_by_stage.values())]
            for si in range(len(STAGE_ORDER)):
                co_vec.append(len(co_orgs_by_stage.get(si, set())))
                rf_vec.append(rf_count_by_stage.get(si, 0))
            cells[key] = {"co": co_vec, "rf": rf_vec}

        states_out[bucket] = {"cells": cells}

    # ---- accounts rows ----
    def rank_flag(v):
        return 1 if v and "Top 150" in v else 0

    for rec in canonical:
        bucket = rec["bucket"]
        team_idx = team_to_idx.get(rec["team_norm"], unassigned_idx)
        stage_idx = STAGE_IDX.get(rec["stage"], 0)
        last_activity = rec["last_activity"][:10] if rec["last_activity"] else None
        row = [
            rec["company"],                 # 0 company
            rec["group"],                   # 1 group
            rec["owner"],                   # 2 owner
            team_idx,                       # 3 teamIdx
            stage_idx,                      # 4 stageIdx
            rec["city"],                    # 5 city
            rec["dms"],                     # 6 dms
            rec["used_cars"],                # 7 usedCars
            rec["new_cars"],                 # 8 newCars
            rec["oem"],                     # 9 oem
            rec["lat"],                     # 10 lat (real WGS84)
            rec["lng"],                     # 11 lng (real WGS84)
            rank_flag(rec["rank"]),          # 12 rank
            rec["arr_sales"],                # 13 arrSales
            rec["contracted_arr"],           # 14 contractedArr
            rec["crm_platform"],             # 15 crmPlatform
            rec["crm_scheduler"],            # 16 crmScheduler
            rec["contacts"],                 # 17 contacts
            rec["domain"],                  # 18 domain
            last_activity,                   # 19 lastActivity
        ]
        accounts_out[bucket].append(row)

    final = {
        "usStates": us_states_geojson,
        "states": states_out,
        "accounts": accounts_out,
        "realTeams": real_teams,
        "acctTeams": acct_teams,
        "stages": STAGE_ORDER,
        "cellKeys": cell_keys,
    }

    with open("../public/data.js", "w", encoding="utf-8") as f:
        f.write("window.DATA = ")
        json.dump(final, f, separators=(",", ":"))
        f.write(";\n")

    import os
    size_mb = os.path.getsize("../public/data.js") / (1024 * 1024)
    print(f"wrote ../public/data.js ({size_mb:.2f} MB)")

    total_rooftops = sum(len(v) for v in accounts_out.values())
    total_orgs = len(set(r["org_id"] for r in canonical))
    print(f"total rooftops across all buckets: {total_rooftops}")
    print(f"total distinct org ids: {total_orgs}")
    print(f"states with data: {len([b for b in accounts_out if b in STATE_NAME_TO_USPS])}")
    print(f"Ontario rooftops: {len(accounts_out.get('Ontario', []))}")
    print(f"No-state rooftops: {len(accounts_out.get(NOSTATE, []))}")


if __name__ == "__main__":
    main()
