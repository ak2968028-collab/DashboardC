<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>Groundwater_Table</sld:Name>
    <sld:UserStyle>
      <sld:Name>Groundwater_Table</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Name>name</sld:Name>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
                <sld:ContrastEnhancement>
                  <sld:GammaValue>1.0</sld:GammaValue>
                </sld:ContrastEnhancement>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry color="#30123b" quantity="6.05" label="&lt;= 6.05 m"/>
  <sld:ColorMapEntry color="#28bceb" quantity="7" label="6.05 m - 7.00 m"/>
  <sld:ColorMapEntry color="#a4fc3c" quantity="8" label="7.00 m - 8.00 m"/>
  <sld:ColorMapEntry color="#fb7e21" quantity="10" label="8.00 m - 10.00 m"/>
  <sld:ColorMapEntry color="#7a0403" quantity="13" label="10.00 m - 13.00 m"/>
</sld:ColorMap>

            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>

