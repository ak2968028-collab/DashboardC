<?xml version="1.0" encoding="UTF-8"?>
<!-- Village total GHG emissions (t CO2e/yr), quintile classes, YlOrRd -->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>varanasi_carbon</Name>
    <UserStyle>
      <Title>Total Carbon Emission (t CO2e/yr)</Title>
      <FeatureTypeStyle>
        <Rule>
          <Title>&lt; 100</Title>
          <ogc:Filter><ogc:PropertyIsLessThan><ogc:PropertyName>total_co2e_t_yr</ogc:PropertyName><ogc:Literal>100</ogc:Literal></ogc:PropertyIsLessThan></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#ffffb2</CssParameter><CssParameter name="fill-opacity">0.8</CssParameter></Fill><Stroke><CssParameter name="stroke">#37474f</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
        <Rule>
          <Title>100 – 250</Title>
          <ogc:Filter><ogc:PropertyIsBetween><ogc:PropertyName>total_co2e_t_yr</ogc:PropertyName><ogc:LowerBoundary><ogc:Literal>100</ogc:Literal></ogc:LowerBoundary><ogc:UpperBoundary><ogc:Literal>249.999</ogc:Literal></ogc:UpperBoundary></ogc:PropertyIsBetween></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#fecc5c</CssParameter><CssParameter name="fill-opacity">0.8</CssParameter></Fill><Stroke><CssParameter name="stroke">#37474f</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
        <Rule>
          <Title>250 – 400</Title>
          <ogc:Filter><ogc:PropertyIsBetween><ogc:PropertyName>total_co2e_t_yr</ogc:PropertyName><ogc:LowerBoundary><ogc:Literal>250</ogc:Literal></ogc:LowerBoundary><ogc:UpperBoundary><ogc:Literal>399.999</ogc:Literal></ogc:UpperBoundary></ogc:PropertyIsBetween></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#fd8d3c</CssParameter><CssParameter name="fill-opacity">0.8</CssParameter></Fill><Stroke><CssParameter name="stroke">#37474f</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
        <Rule>
          <Title>400 – 700</Title>
          <ogc:Filter><ogc:PropertyIsBetween><ogc:PropertyName>total_co2e_t_yr</ogc:PropertyName><ogc:LowerBoundary><ogc:Literal>400</ogc:Literal></ogc:LowerBoundary><ogc:UpperBoundary><ogc:Literal>699.999</ogc:Literal></ogc:UpperBoundary></ogc:PropertyIsBetween></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#f03b20</CssParameter><CssParameter name="fill-opacity">0.8</CssParameter></Fill><Stroke><CssParameter name="stroke">#37474f</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
        <Rule>
          <Title>≥ 700</Title>
          <ogc:Filter><ogc:PropertyIsGreaterThanOrEqualTo><ogc:PropertyName>total_co2e_t_yr</ogc:PropertyName><ogc:Literal>700</ogc:Literal></ogc:PropertyIsGreaterThanOrEqualTo></ogc:Filter>
          <PolygonSymbolizer><Fill><CssParameter name="fill">#bd0026</CssParameter><CssParameter name="fill-opacity">0.8</CssParameter></Fill><Stroke><CssParameter name="stroke">#37474f</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke></PolygonSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
