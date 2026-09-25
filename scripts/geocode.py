from __future__ import annotations

import csv
import json
import random
import re

STATE_NAME_TO_USPS = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA",
    "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN", "Mississippi": "MS",
    "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK",
    "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC",
    "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI",
    "Wyoming": "WY",
}

LSAD_STRIP_RE = re.compile(
    r"\s+(city|town|village|CDP|borough|municipality|urban county|city and borough|"
    r"consolidated government|metropolitan government|unified government)$",
    re.IGNORECASE,
)


def normalize_city(name: str) -> str:
    name = name.strip()
    name = LSAD_STRIP_RE.sub("", name)
    return name.lower()


def zero_pad_zip(z: str) -> str | None:
    if not z:
        return None
    z = z.strip()
    if not z:
        return None
    m = re.match(r"(\d{1,5})", z)
    if not m:
        return None
    return m.group(1).zfill(5)


def _dict_reader_stripped(f):
    reader = csv.DictReader(f, delimiter="\t")
    reader.fieldnames = [fn.strip() for fn in reader.fieldnames]
    for row in reader:
        yield {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items()}


def load_zcta_lookup(path: str) -> dict[str, tuple[float, float]]:
    lookup = {}
    with open(path, encoding="utf-8") as f:
        for row in _dict_reader_stripped(f):
            geoid = row["GEOID"].strip()
            try:
                lat = float(row["INTPTLAT"])
                lng = float(row["INTPTLONG"])
            except (ValueError, KeyError):
                continue
            lookup[geoid] = (lat, lng)
    return lookup


def load_place_lookup(path: str) -> dict[tuple[str, str], tuple[float, float]]:
    lookup = {}
    with open(path, encoding="utf-8") as f:
        for row in _dict_reader_stripped(f):
            usps = row["USPS"].strip()
            name = normalize_city(row["NAME"].strip())
            try:
                lat = float(row["INTPTLAT"])
                lng = float(row["INTPTLONG"])
            except (ValueError, KeyError):
                continue
            key = (usps, name)
            if key not in lookup:
                lookup[key] = (lat, lng)
    return lookup


# ---- real (lat, lng) GeoJSON polygon helpers, used only for the jitter fallback ----

def load_state_rings(geojson_path: str) -> dict[str, list[list[tuple[float, float]]]]:
    """Load the US states GeoJSON and flatten each state's Polygon/MultiPolygon into a
    list of (lng, lat)-tuple outer rings, keyed by state name. Used only as a fallback
    for the small fraction of rows with no usable zip or city match."""
    with open(geojson_path, encoding="utf-8") as f:
        gj = json.load(f)
    rings_by_state: dict[str, list[list[tuple[float, float]]]] = {}
    for feat in gj["features"]:
        name = feat["properties"].get("name")
        if name not in STATE_NAME_TO_USPS:
            continue
        geom = feat["geometry"]
        rings = []
        if geom["type"] == "Polygon":
            polys = [geom["coordinates"]]
        else:
            polys = geom["coordinates"]
        for poly in polys:
            outer = poly[0]  # outer ring only; ignore holes for jitter-sampling purposes
            rings.append([(pt[0], pt[1]) for pt in outer])  # (lng, lat)
        rings_by_state[name] = rings
    return rings_by_state


def point_in_ring(lng: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def point_in_any_ring(lng: float, lat: float, rings: list[list[tuple[float, float]]]) -> bool:
    return any(point_in_ring(lng, lat, r) for r in rings)


def jitter_in_state(state: str, rings_by_state: dict, rng: random.Random) -> tuple[float, float]:
    """Random point-in-polygon sample within a state's real geometry, for the small
    fraction of rows with neither a usable zip nor city match. Returns (lat, lng)."""
    rings = rings_by_state.get(state)
    if not rings:
        return (39.5, -98.35)  # geographic center of the US, last-ditch fallback
    all_pts = [p for ring in rings for p in ring]
    lngs = [p[0] for p in all_pts]
    lats = [p[1] for p in all_pts]
    min_lng, max_lng = min(lngs), max(lngs)
    min_lat, max_lat = min(lats), max(lats)
    for _ in range(30):
        lng = rng.uniform(min_lng, max_lng)
        lat = rng.uniform(min_lat, max_lat)
        if point_in_any_ring(lng, lat, rings):
            return (round(lat, 5), round(lng, 5))
    biggest = max(rings, key=len)
    cx = sum(p[0] for p in biggest) / len(biggest)
    cy = sum(p[1] for p in biggest) / len(biggest)
    return (round(cy, 5), round(cx, 5))
