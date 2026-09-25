import io
import os
import urllib.request
import zipfile

CACHE = "cache"
os.makedirs(CACHE, exist_ok=True)

FILES = {
    "2023_Gaz_zcta_national.txt": "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_zcta_national.zip",
    "2023_Gaz_place_national.txt": "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_place_national.zip",
}

for out_name, url in FILES.items():
    out_path = os.path.join(CACHE, out_name)
    if os.path.exists(out_path):
        print(f"already cached: {out_path}")
        continue
    print(f"downloading {url} ...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        raw = resp.read()
    zf = zipfile.ZipFile(io.BytesIO(raw))
    names = zf.namelist()
    print("  zip contains:", names)
    # the txt file inside has a similar name
    inner_name = names[0]
    with zf.open(inner_name) as fh:
        content = fh.read()
    with open(out_path, "wb") as f:
        f.write(content)
    print(f"  wrote {out_path} ({len(content)} bytes)")

print("done")
