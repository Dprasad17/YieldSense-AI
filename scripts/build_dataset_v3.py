"""Build the v3 reference dataset: 1990–2023 with real year-by-year weather.

Sources (all public, no key):
- Yield (kg/ha): FAOSTAT Crops and livestock products (QCL), element "Yield".
- Pesticides (tonnes, total agricultural use): FAOSTAT Pesticides Use (RP).
- Rainfall (mm/year) and temperature (°C, annual mean): CRU TS 4.08 country averages from the
  World Bank Climate Change Knowledge Portal (CCKP). These vary by year, unlike the v2 dataset,
  whose rainfall was one long-term value per country.
- Producer prices (USD/tonne): FAOSTAT Prices (PP), written to datasets/processed/producer_prices.json
  for the revenue estimate.

Same 101 countries and 10 crops as the v2 dataset (Kaggle "Crop Yield Prediction", built from FAOSTAT
and World Bank data), one row per country × crop × year. Field-condition columns (soil pH, moisture,
humidity, sunlight, irrigation, fertilizer, disease, duration) are generated exactly as before and stay
labelled synthetic; NDVI stays excluded from the model (it is derived from the yield).

    python scripts/build_dataset_v3.py          # downloads to datasets/raw/cache/ (gitignored)
"""

import json
import os
import sys
import urllib.request
import zipfile

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CACHE = os.path.join(ROOT, "datasets", "raw", "cache")
OUT_CSV = os.path.join(ROOT, "datasets", "processed", "cleaned_crop_yield.csv")
OUT_WEATHER = os.path.join(ROOT, "datasets", "raw", "cru_country_weather_1990_2023.csv")
OUT_PRICES = os.path.join(ROOT, "datasets", "processed", "producer_prices.json")
FAOSTAT = "https://bulks-faostat.fao.org/production/"
CCKP = "https://cckpapi.worldbank.org/cckp/v1/cru-x0.5_timeseries_{var}_timeseries_annual_1901-2023_mean_historical_cru_ts4.08_mean/{codes}?_format=json"
FIRST_YEAR, LAST_YEAR = 1990, 2023

CROPS = {
    "Maize (corn)": "Maize",
    "Potatoes": "Potato",
    "Rice": "Rice",
    "Soya beans": "Soybean",
    "Wheat": "Wheat",
    "Sorghum": "Sorghum",
    "Cassava, fresh": "Cassava",
    "Sweet potatoes": "Sweet Potato",
    "Yams": "Yams",
    "Plantains and cooking bananas": "Plantains",
}

# Dataset region -> (FAOSTAT area name, ISO3 for CRU). Names follow the v2 dataset.
REGIONS = {
    "Albania": "ALB", "Algeria": "DZA", "Angola": "AGO", "Argentina": "ARG", "Armenia": "ARM", "Australia": "AUS",
    "Austria": "AUT", "Azerbaijan": "AZE", "Bahamas": "BHS", "Bahrain": "BHR", "Bangladesh": "BGD", "Belarus": "BLR",
    "Belgium": "BEL", "Botswana": "BWA", "Brazil": "BRA", "Bulgaria": "BGR", "Burkina Faso": "BFA", "Burundi": "BDI",
    "Cameroon": "CMR", "Canada": "CAN", "Central African Republic": "CAF", "Chile": "CHL", "Colombia": "COL",
    "Croatia": "HRV", "Denmark": "DNK", "Dominican Republic": "DOM", "Ecuador": "ECU", "Egypt": "EGY",
    "El Salvador": "SLV", "Eritrea": "ERI", "Estonia": "EST", "Finland": "FIN", "France": "FRA", "Germany": "DEU",
    "Ghana": "GHA", "Greece": "GRC", "Guatemala": "GTM", "Guinea": "GIN", "Guyana": "GUY", "Haiti": "HTI",
    "Honduras": "HND", "Hungary": "HUN", "India": "IND", "Indonesia": "IDN", "Iraq": "IRQ", "Ireland": "IRL",
    "Italy": "ITA", "Jamaica": "JAM", "Japan": "JPN", "Kazakhstan": "KAZ", "Kenya": "KEN", "Latvia": "LVA",
    "Lebanon": "LBN", "Lesotho": "LSO", "Libya": "LBY", "Lithuania": "LTU", "Madagascar": "MDG", "Malawi": "MWI",
    "Malaysia": "MYS", "Mali": "MLI", "Mauritania": "MRT", "Mauritius": "MUS", "Mexico": "MEX", "Montenegro": "MNE",
    "Morocco": "MAR", "Mozambique": "MOZ", "Namibia": "NAM", "Nepal": "NPL", "Netherlands": "NLD",
    "New Zealand": "NZL", "Nicaragua": "NIC", "Niger": "NER", "Norway": "NOR", "Pakistan": "PAK",
    "Papua New Guinea": "PNG", "Peru": "PER", "Poland": "POL", "Portugal": "PRT", "Qatar": "QAT", "Romania": "ROU",
    "Rwanda": "RWA", "Saudi Arabia": "SAU", "Senegal": "SEN", "Slovenia": "SVN", "South Africa": "ZAF",
    "Spain": "ESP", "Sri Lanka": "LKA", "Sudan": "SDN", "Suriname": "SUR", "Sweden": "SWE", "Switzerland": "CHE",
    "Tajikistan": "TJK", "Thailand": "THA", "Tunisia": "TUN", "Turkey": "TUR", "Uganda": "UGA", "Ukraine": "UKR",
    "United Kingdom": "GBR", "Uruguay": "URY", "Zambia": "ZMB", "Zimbabwe": "ZWE",
}
FAO_NAMES = {
    "Netherlands": ["Netherlands (Kingdom of the)"],
    "Turkey": ["Türkiye"],
    "United Kingdom": ["United Kingdom of Great Britain and Northern Ireland"],
    "Sudan": ["Sudan (former)", "Sudan"],  # former Sudan until 2011, Sudan from 2012
}


def download(name: str) -> str:
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, name)
    if not os.path.exists(path):
        print(f"  downloading {name}")
        urllib.request.urlretrieve(FAOSTAT + urllib.request.quote(name), path)
    return path


def read_faostat(name: str) -> pd.DataFrame:
    z = zipfile.ZipFile(download(name))
    csv = [n for n in z.namelist() if n.endswith("(Normalized).csv")][0]
    return pd.read_csv(z.open(csv), encoding="utf-8", low_memory=False)


def to_region(area: pd.Series) -> pd.Series:
    lookup = {name: region for region in REGIONS for name in FAO_NAMES.get(region, [region])}
    return area.map(lookup)


def cru(var: str) -> pd.DataFrame:
    codes = ",".join(REGIONS.values())
    req = urllib.request.Request(CCKP.format(var=var, codes=codes), headers={"User-Agent": "Mozilla/5.0 (YieldSenseAI dataset build)"})
    with urllib.request.urlopen(req, timeout=120) as r:
        data = json.load(r)["data"]
    rows = [
        {"iso3": iso, "year": int(k[:4]), var: float(v)}
        for iso, series in data.items()
        for k, v in series.items()
        if v is not None and FIRST_YEAR <= int(k[:4]) <= LAST_YEAR
    ]
    return pd.DataFrame(rows)


def synthesize(df: pd.DataFrame) -> pd.DataFrame:
    """Field-condition columns, generated as in scripts/preprocess_real_dataset.py (synthetic, labelled so)."""
    rng = np.random.default_rng(42)
    n = len(df)
    ph_base = {"Maize": 6.5, "Potato": 5.8, "Rice": 6.2, "Wheat": 6.8, "Soybean": 6.6, "Cassava": 6.0, "Sweet Potato": 5.9, "Plantains": 6.1, "Yams": 6.3, "Sorghum": 6.7}
    days_base = {"Maize": 120, "Potato": 110, "Rice": 130, "Wheat": 140, "Soybean": 115, "Cassava": 270, "Sweet Potato": 120, "Plantains": 300, "Yams": 240, "Sorghum": 125}
    rain, temp = df["rainfall_mm"], df["temperature_C"]
    df["soil_pH"] = (df["crop_type"].map(ph_base).fillna(6.5) + rng.normal(0, 0.35, n)).clip(5.0, 8.2).round(2)
    df["soil_moisture_%"] = ((rain / 3500.0) * 50 + 25 + rng.normal(0, 5, n)).clip(15.0, 95.0).round(2)
    df["humidity_%"] = (45.0 + (rain / 3000.0) * 35.0 - (temp - 20.0) * 0.5 + rng.normal(0, 4, n)).clip(30.0, 95.0).round(2)
    df["sunlight_hours"] = (8.5 - (rain / 3000.0) * 3.0 + rng.normal(0, 0.8, n)).clip(4.0, 12.0).round(2)
    df["total_days"] = (df["crop_type"].map(days_base).fillna(120) + rng.integers(-10, 11, n)).astype(int)
    df["sowing_date"] = df["year"].astype(str) + "-01-15"
    df["harvest_date"] = df["year"].astype(str) + "-05-15"
    df["irrigation_type"] = np.where(
        rain > 1500,
        rng.choice(["Rainfed", "Sprinkler"], size=n, p=[0.7, 0.3]),
        rng.choice(["Drip", "Sprinkler", "Flood", "Rainfed"], size=n, p=[0.35, 0.35, 0.2, 0.1]),
    )
    df["fertilizer_type"] = rng.choice(["NPK 15-15-15", "Urea", "Organic Compost", "DAP"], size=n, p=[0.4, 0.3, 0.2, 0.1])
    sick = rng.random(n) < np.where(df["humidity_%"] > 75.0, 0.35, 0.15)
    df["crop_disease_status"] = np.where(sick, rng.choice(["Mild", "Moderate", "Severe"], size=n, p=[0.6, 0.3, 0.1]), "None")
    pct = df["yield_kg_per_hectare"].rank(pct=True)
    df["NDVI_index"] = (0.35 + pct * 0.55 + rng.normal(0, 0.04, n)).clip(0.15, 0.98).round(2)
    return df


def build_prices() -> None:
    pp = read_faostat("Prices_E_All_Data_(Normalized).zip")
    pp = pp[(pp["Element"] == "Producer Price (USD/tonne)") & pp["Item"].isin(CROPS) & (pp["Months"].str.lower() == "annual value")]
    pp = pp.assign(region=to_region(pp["Area"]), crop=pp["Item"].map(CROPS)).dropna(subset=["region", "Value"])
    pp = pp[pp["Year"] >= 2015].sort_values("Year")
    latest = pp.groupby(["region", "crop"]).tail(1)
    out = {
        "source": "FAOSTAT Producer Prices (PP), USD/tonne, annual value; latest year available per country and crop",
        "prices": {r: {} for r in sorted(latest["region"].unique())},
    }
    for row in latest.itertuples():
        out["prices"][row.region][row.crop] = {"usd_per_tonne": round(float(row.Value), 1), "year": int(row.Year)}
    # Median across countries per crop: the fallback when a country has no price.
    out["crop_median"] = {c: round(float(v), 1) for c, v in latest.groupby("crop")["Value"].median().items()}
    with open(OUT_PRICES, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1, ensure_ascii=False)
    print(f"prices: {len(latest)} country × crop prices -> {OUT_PRICES}")


def main() -> int:
    print("[1/5] FAOSTAT yields")
    qcl = read_faostat("Production_Crops_Livestock_E_All_Data_(Normalized).zip")
    y = qcl[(qcl["Element"] == "Yield") & (qcl["Unit"] == "kg/ha") & qcl["Item"].isin(CROPS)]
    y = y[(y["Year"] >= FIRST_YEAR) & (y["Year"] <= LAST_YEAR)]
    y = y.assign(region=to_region(y["Area"]), crop_type=y["Item"].map(CROPS))
    y = y[y["region"].notna() & (y["Value"] > 0)]
    sudan_new = (y["Area"] == "Sudan") & (y["Year"] <= 2011)
    sudan_old = (y["Area"] == "Sudan (former)") & (y["Year"] >= 2012)
    y = y[~(sudan_new | sudan_old)]
    y = y[["region", "crop_type", "Year", "Value"]].rename(columns={"Year": "year", "Value": "yield_kg_per_hectare"})

    print("[2/5] FAOSTAT pesticides")
    rp = read_faostat("Inputs_Pesticides_Use_E_All_Data_(Normalized).zip")
    rp = rp[(rp["Element"] == "Agricultural Use") & (rp["Item"] == "Pesticides (total)")]
    rp = rp.assign(region=to_region(rp["Area"])).dropna(subset=["region"])
    rp = rp[["region", "Year", "Value"]].rename(columns={"Year": "year", "Value": "pesticide_tonnes"}).groupby(["region", "year"], as_index=False).sum()

    print("[3/5] CRU TS 4.08 country rainfall and temperature (World Bank CCKP)")
    weather = cru("pr").merge(cru("tas"), on=["iso3", "year"])
    iso_to_region = {v: k for k, v in REGIONS.items()}
    weather["region"] = weather["iso3"].map(iso_to_region)
    weather = weather.rename(columns={"pr": "rainfall_mm", "tas": "temperature_C"})
    weather[["region", "iso3", "year", "rainfall_mm", "temperature_C"]].sort_values(["region", "year"]).to_csv(OUT_WEATHER, index=False)

    print("[4/5] Joining")
    df = y.merge(weather[["region", "year", "rainfall_mm", "temperature_C"]], on=["region", "year"], how="inner")
    df = df.merge(rp, on=["region", "year"], how="left").sort_values(["region", "crop_type", "year"])
    # Pesticide use is reported with gaps; carry the nearest reported year within the country.
    df["pesticide_tonnes"] = df.groupby("region")["pesticide_tonnes"].transform(lambda s: s.ffill().bfill())
    df = df.dropna(subset=["pesticide_tonnes"])
    df["pesticide_usage_ml"] = (df["pesticide_tonnes"] * 100).round(2)  # same index as v2: national tonnes × 100
    df["yield_kg_per_hectare"] = df["yield_kg_per_hectare"].round(2)
    df["rainfall_mm"] = df["rainfall_mm"].round(1)
    df["temperature_C"] = df["temperature_C"].round(2)
    df = synthesize(df.reset_index(drop=True))
    df.insert(0, "farm_id", [f"FARM{i + 1:05d}" for i in range(len(df))])
    cols = ["farm_id", "region", "crop_type", "yield_kg_per_hectare", "rainfall_mm", "temperature_C", "pesticide_usage_ml", "soil_pH", "soil_moisture_%", "humidity_%", "sunlight_hours", "total_days", "sowing_date", "harvest_date", "irrigation_type", "fertilizer_type", "crop_disease_status", "NDVI_index"]
    df[cols].to_csv(OUT_CSV, index=False)
    print(f"      {len(df):,} rows, {df['region'].nunique()} countries, {df['crop_type'].nunique()} crops, {df['year'].min()}–{df['year'].max()}")
    missing = sorted(set(REGIONS) - set(df["region"]))
    if missing:
        print(f"      no rows for: {missing}")
    print(f"      rainfall values per country (median distinct years): {int(df.groupby('region')['rainfall_mm'].nunique().median())}")

    print("[5/5] Producer prices")
    build_prices()
    return 0


if __name__ == "__main__":
    sys.exit(main())
