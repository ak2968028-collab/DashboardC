<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>Distance_from_Builtup</sld:Name>
    <sld:UserStyle>
      <sld:Name>Distance_from_Builtup</sld:Name>
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
  <sld:ColorMapEntry color="#d7191c" quantity="2000" label="&lt;= 2000 m"/>
  <sld:ColorMapEntry color="#fdae61" quantity="4000" label="2000 m - 4000 m"/>
  <sld:ColorMapEntry color="#ffffbf" quantity="6000" label="4000 m - 6000 m"/>
  <sld:ColorMapEntry color="#abdda4" quantity="8000" label="6000 m - 8000 m"/>
  <sld:ColorMapEntry color="#2b83ba" quantity="15365" label="8000 m - 15365 m"/>
</sld:ColorMap>

            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>

