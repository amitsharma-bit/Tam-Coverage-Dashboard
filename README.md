# Spyne TAM Coverage Dashboard

A satellite-map dashboard of US dealership TAM coverage (companies/rooftops by state and
lifecycle stage), plus a linked "CS Live" section for live/onboarding accounts pulled from a
separate Google Sheet.

## Structure

```
public/              deployable static site — this is what gets uploaded to AWS
  index.html
  styles.css
  app.js             all dashboard logic (both TAM and CS Live sections)
  data.js            generated — TAM dataset (window.DATA)
  cslive-data.js      generated — CS Live dataset (window.DATA_CSLIVE)
  vendor/leaflet/     Leaflet, vendored locally (no CDN dependency)

scripts/              data pipeline — not deployed, regenerates public/data.js and
                       public/cslive-data.js from source data
  build_data.py       HubSpot TAM export -> public/data.js
  build_cs_data.py    CS Live Google Sheet -> public/cslive-data.js
  geocode.py          zip/city -> lat/lng lookups, state boundary helpers
  fetch_geo_datasets.py   downloads + caches US Census Gazetteer files
  verify.py           sanity checks on the built data.js (row counts, spot checks,
                       geographic containment)
  nocache_server.py    local dev server (no-cache headers, for live-editing)
  cache/               downloaded/cached source data (gitignored, rebuilt on demand)
```

`public/` has zero build step — it's plain HTML/CSS/JS, safe to upload as-is.

## Rebuilding the data

Requires Python 3.9+, stdlib only (no pip installs).

```bash
cd scripts
python3 build_data.py       # needs /Users/amitsharma/Downloads/Hubspot CSV/.../usa-tam-relevant.csv
python3 build_cs_data.py    # pulls the CS Live Google Sheet directly, no local file needed
python3 verify.py           # sanity-checks the rebuilt public/data.js
```

`build_data.py` currently points at a local CSV path (see `CSV_PATH` near the top of the file) —
update that path if the HubSpot export lives somewhere else.

## Local preview

```bash
cd scripts
python3 nocache_server.py 8000 ../public
```

Then open `http://localhost:8000`.

## Deploying to AWS

`public/` is a static site with no server-side logic, so it deploys as-is to:
- **S3 + CloudFront**: upload the contents of `public/` to an S3 bucket configured for static
  website hosting (or behind CloudFront), with `index.html` as the index document.
- **Amplify Hosting**: point Amplify at this repo with `public` as the build output directory
  and no build command.

`data.js` and `cslive-data.js` are static generated files checked into `public/` — there's no
runtime API call, so no backend/compute is needed. Re-run the scripts above and re-upload
`public/` whenever the underlying data should refresh.

## Notes

- `data.js`/`cslive-data.js` contain real dealer/account data (company names, owners, CSM
  emails, pipeline stage). Treat this repo's visibility accordingly.
- State boundaries and city/state maps use Esri World Imagery + a US states GeoJSON boundary
  set; rooftop positions are geocoded from zip/city (TAM) or the sheet's own lat/lng (CS Live).
