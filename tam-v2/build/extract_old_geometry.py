import json

OLD_HTML_PATH = "../../tam-coverage-index.html"

with open(OLD_HTML_PATH, encoding="utf-8") as f:
    for i, line in enumerate(f):
        if i == 272:  # line 273, the `const DATA = {...}` line
            data_line = line
            break
    else:
        raise SystemExit("Could not find line 273 in old file")

s = data_line.strip()
prefix = "const DATA = "
assert s.startswith(prefix), s[:50]
assert s.endswith(";")
json_text = s[len(prefix):-1]
old = json.loads(json_text)

print("top-level keys:", sorted(old.keys()))
print("paths count:", len(old["paths"]))
print("stateGeo count:", len(old["stateGeo"]))

with open("cache/paths.json", "w", encoding="utf-8") as f:
    json.dump(old["paths"], f, separators=(",", ":"))

with open("cache/stategeo.json", "w", encoding="utf-8") as f:
    json.dump(old["stateGeo"], f, separators=(",", ":"))

print("wrote cache/paths.json and cache/stategeo.json")

# sanity: confirm fixed width and per-state height
import statistics
widths = {k: v["w"] for k, v in old["stateGeo"].items()}
print("distinct widths:", set(widths.values()))
