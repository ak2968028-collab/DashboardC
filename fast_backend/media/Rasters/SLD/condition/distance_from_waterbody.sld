<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>Distance_from_Waterbody</sld:Name>
    <sld:UserStyle>
      <sld:Name>Distance_from_Waterbody</sld:Name>
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
  <sld:ColorMapEntry color="#d7191c" quantity="1000" label="&lt;= 1000 m"/>
  <sld:ColorMapEntry color="#f59053" quantity="2000" label="1000 m - 2000 m"/>
  <sld:ColorMapEntry color="#fedf99" quantity="3000" label="2000 m - 3000 m"/>
  <sld:ColorMapEntry color="#ddf1b4" quantity="6000" label="3000 m - 6000 m"/>
  <sld:ColorMapEntry color="#91cba8" quantity="11000" label="6000 m - 11000 m"/>
</sld:ColorMap>

            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>

