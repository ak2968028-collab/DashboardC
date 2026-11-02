# ====================================================================
# app/api/service/report_svc/reporting.py
# Village PDF reports (ReportLab):
#   basic    - public summary: purpose, profile, location maps, carbon footprint
#   advanced - for logged-in Pradhans / admins: full inventory, district emission map, benchmarking,
#              reduction opportunities, data provenance and methodology annex
# ====================================================================
import io

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import (
    CondPageBreak, KeepTogether, PageBreak, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from app.api.service.report_svc.pdf_parts import (
    Banner, P, PageDecor, PhotoStrip, bullets, callout, choropleth_map, comparison_bars,
    data_table, fmt, kpi_tiles, land_bar, location_map, sector_pie, village_map,
)

BASIC, ADVANCED = "basic", "advanced"
MARGIN = 36
CONTENT_WIDTH = A4[0] - 2 * MARGIN

# Dashboard sector name -> (emission key, activity description, activity key, unit, factor key, factor unit)
SECTORS = [
    ("LPG Energy", "lpg_co2e_t_yr", "LPG used for cooking", "lpg_monthly_kg", "kg/month", "lpg", "kg CO2e/kg"),
    ("Firewood Energy", "firewood_co2e_t_yr", "Firewood / biomass burnt", "firewood_monthly_kg", "kg/month", "firewood", "kg CO2e/kg"),
    ("Electricity Energy", "electricity_co2e_t_yr", "Grid electricity used", "electricity_monthly_kwh", "kWh/month", "electricity", "kg CO2/kWh"),
    ("Transport (Petrol)", "transport_co2e_t_yr", "Petrol for two-wheelers", "petrol_monthly_litres", "L/month", "petrol", "kg CO2e/L"),
    ("Solid Waste", "waste_co2e_t_yr", "Solid waste generated", "waste_monthly_kg", "kg/month", "waste", "kg CO2e/kg"),
    ("Livestock Enteric", "livestock_co2e_t_yr", "Cattle, goats & sheep", "total_livestock", "head", None, "kg CO2e/head/yr"),
]

# What a village can do about each source (shown for its largest sources in the advanced report).
ACTIONS = {
    "LPG Energy": "Promote efficient burners and pressure cookers, regular stove servicing, and solar or community "
                  "biogas cooking to cut LPG use per meal.",
    "Firewood Energy": "Shift households from open fires to improved cookstoves, LPG (PM Ujjwala Yojana) or cattle-dung "
                       "biogas (GOBARdhan); this also reduces indoor smoke and women's fuel-collection time.",
    "Electricity Energy": "Rooftop solar on homes and public buildings (PM Surya Ghar), solar irrigation pumps (PM-KUSUM), "
                          "LED street lights and efficient fans / pumps.",
    "Transport (Petrol)": "Encourage shared trips, regular two-wheeler servicing and correct tyre pressure, and electric "
                          "two-wheelers / e-rickshaws for local travel.",
    "Solid Waste": "Segregate waste at source, compost or vermicompost wet waste and recycle dry waste through the "
                   "Swachh Bharat Mission (Grameen) village solid-waste system, instead of open dumping or burning.",
    "Livestock Enteric": "Balanced feeding with mineral mixture and green fodder, fewer but more productive animals, and "
                         "converting dung to biogas and slurry manure (GOBARdhan).",
}

DATA_STATUS = {
    "BASELINE_SURVEY_DATA": "Baseline survey (Census 2011 and field survey)",
    "SUPERVISOR_SUBMITTED_ADMIN_APPROVED": "Updated by the village Pradhan and approved by the admin",
}


def _sector_rows(v):
    return [(name, v.get(key) or 0) for name, key, *_ in SECTORS]


def _pct(part, whole):
    return f"{part / whole * 100:.1f}%" if whole else "0.0%"


def _compare(value, reference):
    """'34% above' / '12% below' / 'about the same as' the reference."""
    if not reference:
        return "not comparable with"
    diff = (value - reference) / reference * 100
    if abs(diff) < 5:
        return "about the same as"
    return f"{abs(diff):.0f}% {'above' if diff > 0 else 'below'}"


def _location_lines(v):
    return [
        f"Block {v.get('block_name') or '—'}  ·  Sub-district {v.get('subdistrict') or '—'}  ·  "
        f"{v.get('district') or 'Varanasi'}, {v.get('state') or 'Uttar Pradesh'}",
        f"Census 2011 village code {v.get('village_code')}",
    ]


# ---------- Sections shared by both reports ----------

def _purpose(level, v):
    name = v["village_name"]
    if level == BASIC:
        return [
            P("Purpose of this report", "h1"),
            P(f"This <b>Basic Village Report</b> is a short, public summary of the environment and carbon footprint of "
              f"<b>{name}</b>. It is meant for residents, Gram Sabha members, teachers, students and anyone interested "
              "in the village. It answers three simple questions:"),
            *bullets([
                "<b>Where is the village and how big is it?</b> The maps place the village inside Varanasi district "
                "and show its mapped boundary.",
                "<b>What does the village use?</b> The people, land, cooking fuel, electricity, petrol, waste and "
                "livestock recorded in the survey.",
                "<b>How much greenhouse gas does that produce, and from which sources?</b> Emissions are given in "
                "tonnes of CO<sub>2</sub>-equivalent (t CO<sub>2</sub>e) per year, for each source and per person.",
            ]),
            P("Use it to understand the village's footprint, to see how it compares with the district, and to start a "
              "conversation about cleaner fuels, saving energy and handling waste better. A more detailed "
              "<b>Advanced Report</b> with benchmarking, reduction options and full data tables is available to the "
              "village Pradhan after logging in to the dashboard."),
        ]
    return [
        P("Purpose of this report", "h1"),
        P(f"This <b>Advanced Village Report</b> is a planning document for the <b>Pradhan and Gram Panchayat of {name}</b>. "
          "It goes beyond the public summary to support decisions and follow-up:"),
        *bullets([
            "<b>Plan:</b> identify which sources produce most of the village's emissions, so that the Gram Panchayat "
            "Development Plan (GPDP) can give them priority.",
            "<b>Compare:</b> benchmark the village against its block and the whole district, and see its rank among all "
            "surveyed villages.",
            "<b>Act:</b> estimate how much a given reduction in each activity would save, with practical actions and "
            "relevant government schemes.",
            "<b>Track:</b> record the data source and last update, so that next year's report can show progress after "
            "the Pradhan submits new survey figures through the dashboard.",
            "<b>Explain:</b> the annex lists every emission factor, formula and reference, so the numbers can be checked "
            "by officials, auditors or researchers.",
        ]),
    ]


def _profile(v, bench):
    pop, hh = v.get("total_residents") or 0, v.get("total_households") or 0
    district_pc = bench["district"]["total"]
    tiles = kpi_tiles([
        ("Residents", fmt(pop), f"{fmt(hh)} households"),
        ("Village area", f"{fmt(v.get('total_area_ha'), 1)} ha", "survey (land records)"),
        ("Total emissions", fmt(v.get("total_co2e_t_yr"), 1), "t CO<sub>2</sub>e per year"),
        ("Per person", fmt(v.get("per_capita_co2e_kg_yr")), "kg CO<sub>2</sub>e per year"),
        ("District average", fmt(district_pc), "kg CO<sub>2</sub>e per person"),
    ], CONTENT_WIDTH)
    return [
        P("Village at a glance", "h1"),
        P("<i>Purpose:</i> the key figures a reader needs first — size of the community, land, and the overall carbon "
          "footprint compared with the district.", "small"),
        tiles,
        Spacer(1, 8),
    ]


def _maps(v, layers, title="Where is the village?"):
    if not layers.get("village") or not layers.get("district"):
        return [P(title, "h1"), P("No mapped boundary is available for this village yet.")]
    half = (CONTENT_WIDTH - 10) / 2
    maps = Table([[location_map(layers, half, 250), village_map(layers, half, 250, v["village_name"])]],
                 colWidths=[half + 5, half + 5])
    maps.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    captions = Table([[P(f"Map 1. Varanasi district: 9 development blocks and {len(layers['villages']):,} village "
                         f"boundaries; {v['village_name']} in red.", "caption"),
                       P(f"Map 2. Mapped boundary of {v['village_name']} with neighbouring villages.", "caption")]],
                     colWidths=[half + 5, half + 5])
    return [KeepTogether([
        P(title, "h1"),
        P("<i>Purpose of the maps:</i> the survey numbers in this report belong to a real place. Map 1 shows where the "
          "village lies in Varanasi district and which development block it belongs to, so it can be found and compared "
          "with its neighbours. Map 2 shows the village's own boundary polygon from the Survey of India village layer — "
          "the same shape used on the dashboard map — with its mapped area and neighbouring villages, to check the "
          "extent covered by the survey and to plan location-specific work such as waste sites, solar or ponds.", "body"),
        maps,
        captions,
    ])]


def _footprint(v, bench, level):
    total = v.get("total_co2e_t_yr") or 0
    rows = _sector_rows(v)
    largest = max(rows, key=lambda r: r[1]) if rows else ("—", 0)
    pc, district_pc = v.get("per_capita_co2e_kg_yr") or 0, bench["district"]["total"]
    table = data_table(
        [["Source", "t CO<sub>2</sub>e / yr", "Share"]]
        + [[name, fmt(t, 2), _pct(t, total)] for name, t in rows]
        + [["Total", fmt(total, 2), "100%"]],
        [120, 70, 50], total_rows=1,
    )
    side = Table([[table, sector_pie(rows, CONTENT_WIDTH - 250, 140)]], colWidths=[250, CONTENT_WIDTH - 250])
    side.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
    return [KeepTogether([
        P("Carbon footprint" if level == BASIC else "3. Emissions by source", "h1"),
        P("<i>Purpose:</i> shows how much greenhouse gas the village's activities release in a year and which sources "
          "matter most — the starting point for any reduction plan.", "small"),
        side,
        Spacer(1, 6),
        callout(f"<b>{largest[0]}</b> is the largest source ({_pct(largest[1], total)} of the village total). "
                f"Each resident accounts for about <b>{fmt(pc)} kg CO<sub>2</sub>e per year</b>, which is "
                f"<b>{_compare(pc, district_pc)}</b> the Varanasi district average of {fmt(district_pc)} kg."),
    ])]


def _how_calculated():
    return [
        P("How the numbers are calculated", "h1"),
        P("Every emission figure is <b>activity × emission factor</b>: for example, kilograms of LPG burnt in a year × "
          "2.984 kg CO<sub>2</sub>e per kg. Monthly survey values are multiplied by 12; livestock use a yearly factor per "
          "animal. Factors follow the IPCC 2006 Guidelines (Tier 1) and the Central Electricity Authority grid emission "
          "factor for India. Methane and nitrous oxide are converted to CO<sub>2</sub>-equivalent with their global "
          "warming potentials, so all sources can be added together."),
    ]


def _disclaimer(v, level):
    status = DATA_STATUS.get(v.get("data_status"), v.get("data_status") or "—")
    updated = v.get("modified_at")
    return [
        Spacer(1, 6),
        P(f"<b>Data source:</b> {status}. Last updated: {updated:%d %b %Y}." if updated else f"<b>Data source:</b> {status}.", "small"),
        P("Estimates are indicative (IPCC Tier 1) and depend on the accuracy of the survey values. They are meant for "
          "awareness and planning, not for regulatory compliance or carbon-credit claims."
          + ("" if level == ADVANCED else " Pradhans can log in to the dashboard to update the village data and download "
                                         "the Advanced Report."), "small"),
    ]


# ---------- Advanced-only sections ----------

def _summary(v, bench):
    total, pc = v.get("total_co2e_t_yr") or 0, v.get("per_capita_co2e_kg_yr") or 0
    rows = sorted(_sector_rows(v), key=lambda r: -r[1])
    top2 = rows[0][1] + rows[1][1] if len(rows) > 1 else total
    rank = bench["rank"] or {}
    area = v.get("total_area_ha") or 0
    findings = [
        f"The village emits <b>{fmt(total, 1)} t CO<sub>2</sub>e per year</b>, about <b>{fmt(pc)} kg per resident</b> — "
        f"{_compare(pc, bench['block']['total'])} the {v.get('block_name')} block average ({fmt(bench['block']['total'])} kg) "
        f"and {_compare(pc, bench['district']['total'])} the district average ({fmt(bench['district']['total'])} kg).",
        f"<b>{rows[0][0]}</b> ({_pct(rows[0][1], total)}) and <b>{rows[1][0]}</b> ({_pct(rows[1][1], total)}) together make "
        f"up <b>{_pct(top2, total)}</b> of all emissions — these are the priority areas for action.",
    ]
    if rank:
        findings.append(
            f"By emissions per person the village ranks <b>{rank['per_capita_rank']:,} of {rank['villages']:,}</b> villages "
            f"in the district and <b>{rank['block_rank']} of {rank['block_villages']}</b> in its block "
            "(rank 1 = lowest footprint).")
    if area:
        findings.append(
            f"Agriculture covers {_pct(v.get('agri_area_ha') or 0, area)} of the village land and settlements "
            f"{_pct(v.get('builtup_area_ha') or 0, area)}; water bodies cover {fmt(v.get('total_water_area_ha'), 1)} ha.")
    return [P("Executive summary", "h1"), *bullets(findings)]


def _inventory(v):
    pop, hh = v.get("total_residents") or 0, v.get("total_households") or 0
    male, female = v.get("total_male") or 0, v.get("total_female") or 0
    area = v.get("total_area_ha") or 0
    land = [
        ("Agriculture", v.get("agri_area_ha") or 0, colors.HexColor("#7cb342")),
        ("Built-up", v.get("builtup_area_ha") or 0, colors.HexColor("#8d6e63")),
        ("Forest", v.get("forest_area_ha") or 0, colors.HexColor("#2e7d32")),
        ("Other land", v.get("remaining_area_ha") or 0, colors.HexColor("#b0bec5")),
    ]
    other_parts = [("barren / unculturable", "barren_area_ha"), ("culturable waste", "culturable_waste_ha"),
                   ("fallow", "fallow_land_ha")]
    per_hh = lambda x: fmt(x / hh, 1) if hh else "—"  # noqa: E731
    w = CONTENT_WIDTH
    return [
        P("2. Village inventory (survey data)", "h1"),
        P("<i>Purpose:</i> the complete set of activity data behind the emission estimates. Check these figures first: "
          "if a value looks wrong, the Pradhan can correct it through the dashboard's Data Entry page.", "small"),
        P("Demography", "h2"),
        data_table([
            ["Residents", "Households", "Male", "Female", "Sex ratio (F per 1,000 M)", "Household size"],
            [fmt(pop), fmt(hh), fmt(male), fmt(female), fmt(female / male * 1000) if male else "—",
             fmt(pop / hh, 1) if hh else "—"],
        ], [w / 6] * 6),
        P("Land use", "h2"),
        data_table([["Category", "Area (ha)", "Share of village area"]]
                   + [[label, fmt(ha, 2), _pct(ha, area)] for label, ha, _ in land]
                   + [[f"&nbsp;&nbsp;&nbsp;&nbsp;of which {label}", fmt(v.get(key), 2), _pct(v.get(key) or 0, area)]
                      for label, key in other_parts]
                   + [["Total village area", fmt(area, 2), "100%"]], [w * 0.5, w * 0.25, w * 0.25], total_rows=1),
        Spacer(1, 4),
        land_bar(land, w, total=area),
        P("Water resources", "h2"),
        data_table([
            ["Ponds", "Rivers", "Canals", "Other water bodies", "Total water area", "Well-irrigated land"],
            [f"{fmt(v.get(k), 2)} ha" for k in ("pond_area_ha", "river_area_ha", "canal_area_ha", "other_water_ha",
                                               "total_water_area_ha", "well_irrig_area_ha")],
        ], [w / 6] * 6),
        CondPageBreak(160),
        P("Energy, transport, waste & livestock", "h2"),
        data_table([
            ["Activity", "Survey value", "Per year", "Per household / yr"],
            ["LPG", f"{fmt(v.get('lpg_monthly_kg'), 1)} kg/month", f"{fmt((v.get('lpg_monthly_kg') or 0) * 12)} kg",
             f"{per_hh((v.get('lpg_monthly_kg') or 0) * 12)} kg"],
            ["Firewood / biomass", f"{fmt(v.get('firewood_monthly_kg'), 1)} kg/month",
             f"{fmt((v.get('firewood_monthly_kg') or 0) * 12)} kg", f"{per_hh((v.get('firewood_monthly_kg') or 0) * 12)} kg"],
            ["Grid electricity", f"{fmt(v.get('electricity_monthly_kwh'), 1)} kWh/month",
             f"{fmt((v.get('electricity_monthly_kwh') or 0) * 12)} kWh",
             f"{per_hh((v.get('electricity_monthly_kwh') or 0) * 12)} kWh"],
            ["Motorbikes / petrol", f"{fmt(v.get('motorbikes_count'))} bikes, {fmt(v.get('petrol_monthly_litres'), 1)} L/month",
             f"{fmt((v.get('petrol_monthly_litres') or 0) * 12)} L", f"{per_hh((v.get('petrol_monthly_litres') or 0) * 12)} L"],
            ["Solid waste", f"{fmt(v.get('waste_monthly_kg'), 1)} kg/month", f"{fmt((v.get('waste_monthly_kg') or 0) * 12)} kg",
             f"{per_hh((v.get('waste_monthly_kg') or 0) * 12)} kg"],
            ["Livestock", f"{fmt(v.get('cows_count'))} cattle, {fmt(v.get('goats_count'))} goats, {fmt(v.get('sheep_count'))} sheep",
             f"{fmt(v.get('total_livestock'))} head", f"{per_hh(v.get('total_livestock') or 0)} head"],
        ], [w * 0.22, w * 0.36, w * 0.2, w * 0.22]),
    ]


def _emission_detail(v, factors):
    rows = [["Source", "Activity (per year)", "Emission factor", "t CO<sub>2</sub>e / yr"]]
    for name, key, label, activity_key, unit, factor_key, factor_unit in SECTORS:
        if factor_key:
            activity = (v.get(activity_key) or 0) * 12
            yearly_unit = unit.replace("/month", "")
            rows.append([name, f"{label}: {fmt(activity)} {yearly_unit}", f"{factors[factor_key]:g} {factor_unit}",
                         fmt(v.get(key), 2)])
        else:
            rows.append([name, f"{fmt(v.get('cows_count'))} cattle, {fmt(v.get('goats_count'))} goats, "
                               f"{fmt(v.get('sheep_count'))} sheep",
                         f"{factors['cow']:g} / {factors['goat']:g} / {factors['sheep']:g} {factor_unit}", fmt(v.get(key), 2)])
    rows.append(["Total", "", "", fmt(v.get("total_co2e_t_yr"), 2)])
    w = CONTENT_WIDTH
    return [
        P("How each source was calculated", "h2"),
        data_table(rows, [w * 0.2, w * 0.38, w * 0.26, w * 0.16], total_rows=1),
        P("t CO<sub>2</sub>e = activity per year × emission factor ÷ 1,000.", "small"),
    ]


def _spatial(layers):
    if not layers.get("district"):
        return []
    return [KeepTogether([
        P("4. The village in the district: emissions per person", "h1"),
        P("<i>Purpose:</i> shows whether the village sits in a high- or low-emission part of the district. Every village "
          "polygon is shaded by its emissions per person (darker = higher), so clusters of high-emission villages — "
          "where joint, block-level programmes may work best — stand out.", "small"),
        choropleth_map(layers, CONTENT_WIDTH, 330),
        P("Map 3. Per-capita emissions of all surveyed villages in Varanasi district (5 classes with equal numbers of "
          "villages); this village outlined in blue.", "caption"),
    ])]


def _benchmark(v, bench):
    pop = v.get("total_residents") or 0
    village_pc = {name: (t * 1000 / pop if pop else 0) for name, t in _sector_rows(v)}
    block, district = bench["block"], bench["district"]
    names = [name for name, *_ in SECTORS]
    rank = bench["rank"] or {}
    w = CONTENT_WIDTH
    table = data_table(
        [["kg CO<sub>2</sub>e per person / yr", "This village", f"{v.get('block_name')} block", "District"]]
        + [[n, fmt(village_pc[n]), fmt(block[n]), fmt(district[n])] for n in names]
        + [["Total", fmt(v.get("per_capita_co2e_kg_yr")), fmt(block["total"]), fmt(district["total"])]],
        [w * 0.37, w * 0.21, w * 0.21, w * 0.21], total_rows=1,
    )
    parts = [
        P("5. Benchmarking", "h1"),
        P("<i>Purpose:</i> a village's total emissions grow with its size, so fair comparison uses emissions <b>per "
          "person</b>. The block and district figures are totals divided by total population (large villages weigh "
          "more). Sources where the village is well above the block show where it differs from its neighbours.", "small"),
        table,
        Spacer(1, 6),
        comparison_bars([(n.replace(" Energy", "").replace(" (Petrol)", ""), [village_pc[n], block[n], district[n]])
                         for n in names], w, 210, ["This village", f"{v.get('block_name')} block", "District"]),
    ]
    if rank:
        parts.append(P(f"Rank by emissions per person: <b>{rank['per_capita_rank']:,} of {rank['villages']:,}</b> in the "
                       f"district, <b>{rank['block_rank']} of {rank['block_villages']}</b> in the block. Rank by total "
                       f"emissions: {rank['total_rank']:,} of {rank['villages']:,} (rank 1 = lowest).", "small"))
    return [KeepTogether(parts)]


def _opportunities(v):
    total = v.get("total_co2e_t_yr") or 0
    rows = sorted(_sector_rows(v), key=lambda r: -r[1])
    w = CONTENT_WIDTH
    table = data_table(
        [["Source", "Now (t CO<sub>2</sub>e / yr)", "Saving if activity falls 10%", "Saving if activity falls 25%",
          "Share of village total"]]
        + [[n, fmt(t, 1), f"{fmt(t * 0.10, 1)} t", f"{fmt(t * 0.25, 1)} t", _pct(t, total)] for n, t in rows],
        [w * 0.24, w * 0.18, w * 0.2, w * 0.2, w * 0.18],
    )
    return [
        P("6. Reduction opportunities", "h1"),
        P("<i>Purpose:</i> turns the footprint into targets. Emissions in this model are proportional to activity, so a "
          "10% cut in, for example, firewood use removes 10% of the firewood emissions. Sources are listed from largest "
          "to smallest: the first rows give the biggest savings for the same effort.", "small"),
        table,
        P("Suggested actions for the largest sources", "h2"),
        *bullets([f"<b>{n}:</b> {ACTIONS[n]}" for n, t in rows[:3] if t > 0]),
        P("Scheme names are given as pointers; check current eligibility with the block office.", "small"),
    ]


def _why_it_matters():
    return [KeepTogether([
        P("7. Why village carbon accounting matters", "h1"),
        PhotoStrip(CONTENT_WIDTH, "co2_swirl.jpg", "Visualisation of carbon dioxide spreading through the global atmosphere."),
        Spacer(1, 6),
        P("Greenhouse gases from millions of small sources — kitchens, pumps, vehicles, animals and waste dumps — add up "
          "to national emissions. India has committed to net-zero emissions by 2070, and Gram Panchayat Development "
          "Plans increasingly include 'clean and green village' goals. A village that knows its own footprint can "
          "target the sources that matter, measure progress year by year, and make a stronger case for funds. Many "
          "low-carbon actions also save money and improve health: clean cooking reduces smoke in homes, solar pumps cut "
          "diesel and electricity bills, and composting keeps streets and ponds cleaner."),
    ])]


def _land_warnings(v):
    """Land-record checks for the report (the 'other land' sub-categories must fit inside it)."""
    other = v.get("remaining_area_ha") or 0
    parts = sum(v.get(k) or 0 for k in ("barren_area_ha", "culturable_waste_ha", "fallow_land_ha"))
    if parts > other * 1.05 + 0.5:
        return [f"Barren, culturable-waste and fallow land ({fmt(parts, 1)} ha) exceed the 'other land' left after "
                f"agriculture, built-up and forest ({fmt(other, 1)} ha); some land may be counted twice in the records."]
    return []


def _provenance(v, provenance, warnings):
    status = DATA_STATUS.get(v.get("data_status"), v.get("data_status") or "—")
    rows = [
        ["Data source", status],
        ["Last updated", f"{v['modified_at']:%d %b %Y, %H:%M}" if v.get("modified_at") else "—"],
    ]
    if provenance:
        rows += [
            ["Last approved Pradhan update", f"{provenance['reviewed_at']:%d %b %Y}" if provenance.get("reviewed_at") else "—"],
            ["Submitted by / approved by", f"{provenance.get('submitted_by') or '—'} / {provenance.get('reviewed_by') or '—'}"],
            ["Submitted via", "Excel template" if provenance.get("source") == "excel" else "Dashboard form"],
        ]
    w = CONTENT_WIDTH
    parts = [
        P("8. Data source and quality checks", "h1"),
        P("<i>Purpose:</i> records where the numbers come from and whether they are internally consistent, so the report "
          "can be trusted and compared with future editions.", "small"),
        data_table(rows, [w * 0.3, w * 0.7], header=False),
        Spacer(1, 4),
    ]
    if warnings:
        parts += [P("Consistency checks — please review:", "h2"), *bullets(warnings)]
    else:
        parts.append(P("Consistency checks passed: male + female population equals total residents, there are fewer "
                       "households than residents, and the land categories fit within the village area.", "small"))
    return parts


def _annex(factor_table):
    w = CONTENT_WIDTH
    return [
        P("Annex A. Emission factors used", "h1"),
        data_table([["Activity", "Unit", "Factor", "Factor unit", "Source"]]
                   + [[f["activity"], f["unit"], f"{f['factor']:g}", f["factor_unit"], f["standard"]] for f in factor_table],
                   [w * 0.3, w * 0.1, w * 0.1, w * 0.2, w * 0.3]),
        P("Annex B. Method and references", "h1"),
        P("Emissions are estimated with the IPCC Tier 1 approach: <b>E = A × EF</b>, where A is the yearly activity "
          "(monthly survey values × 12, or animal head count) and EF the emission factor in kg CO<sub>2</sub>e per unit. "
          "Results are reported in tonnes (÷ 1,000). Per-capita emissions divide the village total by the number of "
          "residents. Grid electricity uses the national (CEA) grid factor; firewood includes the non-CO<sub>2</sub> "
          "gases from burning biomass."),
        *bullets([
            "IPCC (2006). <i>Guidelines for National Greenhouse Gas Inventories</i>, Vol. 2 Energy, Vol. 4 AFOLU, Vol. 5 Waste.",
            "Central Electricity Authority, Government of India (2024). <i>CO<sub>2</sub> Baseline Database for the Indian "
            "Power Sector</i>, Version 20.0.",
            "Ministry of Environment, Forest and Climate Change. <i>India's Biennial Update Reports to the UNFCCC</i>.",
            "Census of India 2011, village directory and primary census abstract (village codes and population).",
        ], "small"),
        P("Glossary", "h2"),
        *bullets([
            "<b>CO<sub>2</sub>e (carbon dioxide equivalent):</b> the amount of CO<sub>2</sub> that would warm the planet as "
            "much as a given amount of another gas such as methane.",
            "<b>Emission factor:</b> greenhouse gas released per unit of activity, e.g. per kg of LPG or per kWh.",
            "<b>Tier 1:</b> the simplest IPCC method, using standard default factors; suitable for village-level estimates.",
            "<b>Per capita:</b> per resident of the village.",
        ], "small"),
    ]


# ---------- Report assembly ----------

def generate_village_pdf(v, context, level=BASIC):
    """Builds the basic or advanced village report and returns the PDF bytes.

    context: layers (map GeoJSON), bench (ranks & per-capita averages) and, for the advanced report,
    factors ({key: value}), factor_table (rows), provenance (last approved submission or None), warnings.
    """
    buffer = io.BytesIO()
    label = "Basic Village Report" if level == BASIC else "Advanced Village Report — for Pradhan / Gram Panchayat"
    decor = PageDecor(label.split(" —")[0], f"{v['village_name']} ({v['village_code']})")
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=62, bottomMargin=44,
                            title=f"{label}: {v['village_name']}", author="Varanasi Village Carbon Dashboard",
                            subject="Village environment and carbon footprint")
    layers, bench = context["layers"], context["bench"]
    layers["village_code"] = v["village_code"]

    story = [Banner(CONTENT_WIDTH, label, v["village_name"], _location_lines(v)), Spacer(1, 6)]
    story += _purpose(level, v)
    if level == BASIC:
        story += _profile(v, bench)
        story += _footprint(v, bench, level)
        story += _maps(v, layers)
        story += _how_calculated()
        story += _disclaimer(v, level)
    else:
        story += _summary(v, bench)
        story += _profile(v, bench)
        story += [PageBreak()] + _maps(v, layers, "1. Location")
        story += [PageBreak()] + _inventory(v)
        story += [PageBreak()] + _footprint(v, bench, level) + _emission_detail(v, context["factors"])
        story += [PageBreak()] + _spatial(layers)
        story += _benchmark(v, bench)
        story += [CondPageBreak(300)] + _opportunities(v)
        story += [Spacer(1, 6)] + _why_it_matters()
        story += [CondPageBreak(200)] + _provenance(v, context.get("provenance"), _land_warnings(v) + (context.get("warnings") or []))
        story += _annex(context["factor_table"])
        story += _disclaimer(v, level)

    doc.build(story, onFirstPage=decor, onLaterPages=decor)
    return buffer.getvalue()


def export_village_csv(v):
    """Exports single village parameters and emissions as CSV."""
    df = pd.DataFrame([v])
    return df.to_csv(index=False)
