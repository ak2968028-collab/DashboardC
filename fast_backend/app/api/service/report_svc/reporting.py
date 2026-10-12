# ====================================================================
# app/api/service/report_svc/reporting.py
# PDF and Data Export Reporting Module for Varanasi Village Dashboard
# Uses ReportLab for Academic M.Tech Thesis Standard Documents
# ====================================================================
import os
import io
import pandas as pd
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

def generate_village_pdf(v, output_path=None):
    """
    Generates a professional academic M.Tech village profile & carbon assessment PDF report.
    Returns bytes or writes to output_path.
    """
    buffer = io.BytesIO() if output_path is None else open(output_path, 'wb')
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=36,
        leftMargin=36,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#1b5e20'),
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor('#424242'),
        spaceAfter=12
    )
    
    h2_style = ParagraphStyle(
        'SectionH2',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=colors.HexColor('#2e7d32'),
        spaceBefore=8,
        spaceAfter=6
    )
    
    cell_bold = ParagraphStyle('CellB', fontName='Helvetica-Bold', fontSize=8, leading=10)
    cell_norm = ParagraphStyle('CellN', fontName='Helvetica', fontSize=8, leading=10)
    meta_style = ParagraphStyle('MetaText', fontName='Helvetica', fontSize=8, leading=11, textColor=colors.HexColor('#616161'))

    story = []

    # Document Header
    story.append(Paragraph("VARANASI DISTRICT — VILLAGE ENVIRONMENT & CARBON ASSESSMENT", title_style))
    story.append(Paragraph("M.Tech Thesis Project: Village-Level Resource Mapping & Greenhouse Gas Accounting", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#1b5e20'), spaceAfter=10))

    # Village Identity Bar
    v_name = v.get('village_name', 'Unknown Village')
    v_code = v.get('village_code', 'N/A')
    b_name = v.get('block_name', 'N/A')
    s_dist = v.get('subdistrict', 'Varanasi')
    lat = v.get('latitude', 0.0)
    lon = v.get('longitude', 0.0)
    
    meta_table_data = [
        [
            Paragraph(f"<b>Village:</b> {v_name}", cell_bold),
            Paragraph(f"<b>Census Code:</b> {v_code}", cell_bold),
            Paragraph(f"<b>Block:</b> {b_name}", cell_bold)
        ],
        [
            Paragraph(f"<b>Tehsil / Sub-District:</b> {s_dist}", cell_norm),
            Paragraph(f"<b>District / State:</b> Varanasi, UP", cell_norm),
            Paragraph(f"<b>Coordinates:</b> {lat:.4f}° N, {lon:.4f}° E", cell_norm)
        ]
    ]
    t_meta = Table(meta_table_data, colWidths=[180, 160, 180])
    t_meta.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#e8f5e9')),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor('#a5d6a7')),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor('#c8e6c9')),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_meta)
    story.append(Spacer(1, 10))

    # 1. Demographics & Land Use Table
    story.append(Paragraph("1. DEMOGRAPHY & LAND USE INVENTORY", h2_style))
    
    pop = v.get('total_residents', 0)
    hh = v.get('total_households', 0)
    male = v.get('total_male', 0)
    female = v.get('total_female', 0)
    
    tot_area = v.get('total_area_ha', 0.0)
    builtup = v.get('builtup_area_ha', 0.0)
    agri = v.get('agri_area_ha', 0.0)
    forest = v.get('forest_area_ha', 0.0)
    remaining_land = v.get('remaining_area_ha', 0.0)
    
    land_demo_data = [
        [Paragraph("<b>Demographic Parameter</b>", cell_bold), Paragraph("<b>Value</b>", cell_bold), Paragraph("<b>Land Use Parameter</b>", cell_bold), Paragraph("<b>Area (Hectares)</b>", cell_bold)],
        [Paragraph("Total Residents", cell_norm), Paragraph(f"{pop:,}", cell_norm), Paragraph("Total Geographical Area", cell_norm), Paragraph(f"{tot_area:,.2f} ha", cell_norm)],
        [Paragraph("Total Households", cell_norm), Paragraph(f"{hh:,}", cell_norm), Paragraph("Settlement / Built-up Area", cell_norm), Paragraph(f"{builtup:,.2f} ha", cell_norm)],
        [Paragraph("Male Residents", cell_norm), Paragraph(f"{male:,}", cell_norm), Paragraph("Agricultural / Net Sown Area", cell_norm), Paragraph(f"{agri:,.2f} ha", cell_norm)],
        [Paragraph("Female Residents", cell_norm), Paragraph(f"{female:,}", cell_norm), Paragraph("Forest & Plantation Area", cell_norm), Paragraph(f"{forest:,.2f} ha", cell_norm)],
        [Paragraph("Average Household Size", cell_norm), Paragraph(f"{(pop/hh):.1f} persons" if hh>0 else "N/A", cell_norm), Paragraph("Remaining / Other Land", cell_norm), Paragraph(f"{remaining_land:,.2f} ha", cell_norm)],
    ]
    t_land_demo = Table(land_demo_data, colWidths=[140, 120, 140, 120])
    t_land_demo.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f8e9')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cfd8dc')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_land_demo)
    story.append(Spacer(1, 10))

    # 2. Water, Energy, Transport & Waste Inventory
    story.append(Paragraph("2. WATER, ENERGY, TRANSPORT & SOLID WASTE ACTIVITY DATA", h2_style))
    
    pond = v.get('pond_area_ha', 0.0)
    canal = v.get('canal_area_ha', 0.0)
    river = v.get('river_area_ha', 0.0)
    tot_water = v.get('total_water_area_ha', 0.0)
    
    lpg = v.get('lpg_monthly_kg', 0.0)
    firewood = v.get('firewood_monthly_kg', 0.0)
    elec = v.get('electricity_monthly_kwh', 0.0)
    
    bikes = v.get('motorbikes_count', 0)
    petrol = v.get('petrol_monthly_litres', 0.0)
    waste = v.get('waste_monthly_kg', 0.0)
    
    activity_data = [
        [Paragraph("<b>Resource / Activity Domain</b>", cell_bold), Paragraph("<b>Metric</b>", cell_bold), Paragraph("<b>Observed Survey Value</b>", cell_bold), Paragraph("<b>Annual Total</b>", cell_bold)],
        [Paragraph("Water Resources: Ponds & Tanks", cell_norm), Paragraph("Surface Area", cell_norm), Paragraph(f"{pond:,.2f} ha", cell_norm), Paragraph("-", cell_norm)],
        [Paragraph("Water Resources: Canals & Drainage", cell_norm), Paragraph("Surface Area", cell_norm), Paragraph(f"{canal:,.2f} ha", cell_norm), Paragraph("-", cell_norm)],
        [Paragraph("Water Resources: Rivers & Water Bodies", cell_norm), Paragraph("Total Water Area", cell_norm), Paragraph(f"{tot_water:,.2f} ha", cell_norm), Paragraph("-", cell_norm)],
        [Paragraph("Domestic Energy: LPG", cell_norm), Paragraph("Consumption (Monthly)", cell_norm), Paragraph(f"{lpg:,.1f} kg/month", cell_norm), Paragraph(f"{(lpg*12):,.1f} kg/yr", cell_norm)],
        [Paragraph("Domestic Energy: Firewood / Biomass", cell_norm), Paragraph("Consumption (Monthly)", cell_norm), Paragraph(f"{firewood:,.1f} kg/month", cell_norm), Paragraph(f"{(firewood*12):,.1f} kg/yr", cell_norm)],
        [Paragraph("Domestic Energy: Grid Electricity", cell_norm), Paragraph("Consumption (Monthly)", cell_norm), Paragraph(f"{elec:,.1f} kWh/month", cell_norm), Paragraph(f"{(elec*12):,.1f} kWh/yr", cell_norm)],
        [Paragraph("Road Transport: Motorbikes (2-W)", cell_norm), Paragraph("Vehicle Count & Petrol", cell_norm), Paragraph(f"{bikes:,} units ({petrol:,.1f} L/mo)", cell_norm), Paragraph(f"{(petrol*12):,.1f} L/yr", cell_norm)],
        [Paragraph("Waste Management: Rural Solid Waste", cell_norm), Paragraph("Waste Generation", cell_norm), Paragraph(f"{waste:,.1f} kg/month", cell_norm), Paragraph(f"{(waste*12):,.1f} kg/yr", cell_norm)],
    ]
    t_act = Table(activity_data, colWidths=[170, 130, 120, 100])
    t_act.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f8e9')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cfd8dc')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_act)
    story.append(Spacer(1, 10))

    # 3. Livestock Inventory
    story.append(Paragraph("3. LIVESTOCK POPULATION INVENTORY", h2_style))
    cows = v.get('cows_count', 0)
    goats = v.get('goats_count', 0)
    sheep = v.get('sheep_count', 0)
    tot_live = v.get('total_livestock', cows + goats + sheep)
    
    live_data = [
        [Paragraph("<b>Livestock Category</b>", cell_bold), Paragraph("<b>Head Count</b>", cell_bold), Paragraph("<b>IPCC Enteric + Manure Factor</b>", cell_bold), Paragraph("<b>Estimated Annual GHG</b>", cell_bold)],
        [Paragraph("Dairy Cattle & Cows", cell_norm), Paragraph(f"{cows:,} heads", cell_norm), Paragraph("980.0 kg CO2e / head / year", cell_norm), Paragraph(f"{(cows * 0.98):,.2f} t CO2e/yr", cell_norm)],
        [Paragraph("Goats (Caprine)", cell_norm), Paragraph(f"{goats:,} heads", cell_norm), Paragraph("145.6 kg CO2e / head / year", cell_norm), Paragraph(f"{(goats * 0.1456):,.2f} t CO2e/yr", cell_norm)],
        [Paragraph("Sheep (Ovine)", cell_norm), Paragraph(f"{sheep:,} heads", cell_norm), Paragraph("145.6 kg CO2e / head / year", cell_norm), Paragraph(f"{(sheep * 0.1456):,.2f} t CO2e/yr", cell_norm)],
        [Paragraph("<b>Total Livestock</b>", cell_bold), Paragraph(f"<b>{tot_live:,} heads</b>", cell_bold), Paragraph("-", cell_norm), Paragraph(f"<b>{v.get('livestock_co2e_t_yr', 0):,.2f} t CO2e/yr</b>", cell_bold)],
    ]
    t_live = Table(live_data, colWidths=[160, 100, 160, 100])
    t_live.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#f1f8e9')),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor('#e8f5e9')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#cfd8dc')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_live)
    story.append(Spacer(1, 10))

    # 4. Derived Greenhouse Gas Emissions Analysis
    story.append(Paragraph("4. GREENHOUSE GAS ACCOUNTING & EMISSION MODELING RESULTS", h2_style))
    
    tot_co2 = v.get('total_co2e_t_yr', 0.0)
    per_cap = v.get('per_capita_co2e_kg_yr', 0.0)
    
    lpg_e = v.get('lpg_co2e_t_yr', 0.0)
    fire_e = v.get('firewood_co2e_t_yr', 0.0)
    elec_e = v.get('electricity_co2e_t_yr', 0.0)
    energy_e = v.get('energy_total_co2e_t_yr', lpg_e + fire_e + elec_e)
    trans_e = v.get('transport_co2e_t_yr', 0.0)
    waste_e = v.get('waste_co2e_t_yr', 0.0)
    live_e = v.get('livestock_co2e_t_yr', 0.0)
    
    def pct(val):
        return f"{(val/tot_co2*100):.1f}%" if tot_co2 > 0 else "0.0%"

    ghg_table_data = [
        [Paragraph("<b>Emission Source / Sector</b>", cell_bold), Paragraph("<b>Gas Species</b>", cell_bold), Paragraph("<b>Emission Factor & Standard</b>", cell_bold), Paragraph("<b>Annual Output (t CO2e)</b>", cell_bold), Paragraph("<b>Share (%)</b>", cell_bold)],
        [Paragraph("LPG Domestic Combustion", cell_norm), Paragraph("CO2, CH4, N2O", cell_norm), Paragraph("2.984 kg CO2e/kg (IPCC 2006)", cell_norm), Paragraph(f"{lpg_e:,.2f} t", cell_norm), Paragraph(pct(lpg_e), cell_norm)],
        [Paragraph("Firewood Biomass Burning", cell_norm), Paragraph("CO2, CH4, N2O", cell_norm), Paragraph("1.747 kg CO2e/kg (MoEFCC/IPCC)", cell_norm), Paragraph(f"{fire_e:,.2f} t", cell_norm), Paragraph(pct(fire_e), cell_norm)],
        [Paragraph("Electricity Grid Consumption", cell_norm), Paragraph("CO2", cell_norm), Paragraph("0.820 kg CO2/kWh (CEA India v20)", cell_norm), Paragraph(f"{elec_e:,.2f} t", cell_norm), Paragraph(pct(elec_e), cell_norm)],
        [Paragraph("2-Wheeler Petrol Transport", cell_norm), Paragraph("CO2, CH4, N2O", cell_norm), Paragraph("2.310 kg CO2e/L (IPCC 2006)", cell_norm), Paragraph(f"{trans_e:,.2f} t", cell_norm), Paragraph(pct(trans_e), cell_norm)],
        [Paragraph("Rural Solid Waste Disposal", cell_norm), Paragraph("CH4", cell_norm), Paragraph("0.450 kg CO2e/kg (IPCC FOD)", cell_norm), Paragraph(f"{waste_e:,.2f} t", cell_norm), Paragraph(pct(waste_e), cell_norm)],
        [Paragraph("Livestock Enteric & Manure", cell_norm), Paragraph("CH4", cell_norm), Paragraph("IPCC Tier 1 Ruminant Factors", cell_norm), Paragraph(f"{live_e:,.2f} t", cell_norm), Paragraph(pct(live_e), cell_norm)],
        [Paragraph("<b>TOTAL VILLAGE EMISSION</b>", cell_bold), Paragraph("<b>All GHGs</b>", cell_bold), Paragraph("<b>Aggregated Carbon Footprint</b>", cell_bold), Paragraph(f"<b>{tot_co2:,.2f} t CO2e/yr</b>", cell_bold), Paragraph("<b>100.0%</b>", cell_bold)],
        [Paragraph("<b>PER CAPITA CARBON FOOTPRINT</b>", cell_bold), Paragraph("<b>CO2 Equivalent</b>", cell_bold), Paragraph("<b>Normalized by Population</b>", cell_bold), Paragraph(f"<b>{per_cap:,.2f} kg/capita/yr</b>", cell_bold), Paragraph("<b>-</b>", cell_bold)],
    ]
    t_ghg = Table(ghg_table_data, colWidths=[150, 80, 140, 100, 50])
    t_ghg.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#e0f2f1')),
        ('BACKGROUND', (0,-2), (-1,-1), colors.HexColor('#b2dfdb')),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#b0bec5')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    story.append(t_ghg)
    story.append(Spacer(1, 10))

    # 5. Scientific Methodology & Citations
    story.append(Paragraph("5. SCIENTIFIC METHODOLOGY & CITATION STATEMENT", h2_style))
    method_text = (
        "<b>Methodological Distinction:</b> Survey parameters (demography, land area, fuel volumes, vehicle counts, and livestock head counts) "
        "represent direct primary/secondary survey data from Census 2011 and field research. Greenhouse gas emissions are derived model outputs "
        "computed via Tier-1 emission factor multiplication: <i>Emissions (t CO2e) = Activity Data × EF × 10^-3</i>. "
        "<br/><b>References:</b><br/>"
        "• Central Electricity Authority (CEA), Government of India (2024): <i>CO2 Baseline Database for the Indian Power Sector, User Guide Version 20.0</i>.<br/>"
        "• Intergovernmental Panel on Climate Change (IPCC) (2006): <i>IPCC Guidelines for National Greenhouse Gas Inventories</i>, Vol 2 (Energy), Vol 4 (AFOLU), Vol 5 (Waste).<br/>"
        "• Ministry of Environment, Forest and Climate Change (MoEFCC), India: <i>India's Biennial Update Reports to UNFCCC</i>."
    )
    story.append(Paragraph(method_text, meta_style))

    doc.build(story)
    
    if output_path is None:
        buffer.seek(0)
        return buffer.getvalue()
    else:
        buffer.close()
        return output_path

def export_village_csv(v):
    """Exports single village parameters and emissions as CSV."""
    df = pd.DataFrame([v])
    return df.to_csv(index=False)
