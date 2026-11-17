<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Lineament_Density</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry color="#30123b" quantity="20038.62" label="&lt;= 20038.62 m/m²"/>
  <sld:ColorMapEntry color="#28bceb" quantity="40077.24" label="20038.62 - 40077.24 m/m²"/>
  <sld:ColorMapEntry color="#a4fc3c" quantity="60115.87" label="40077.24 - 60115.87 m/m²"/>
  <sld:ColorMapEntry color="#fb7e21" quantity="80154.49" label="60115.87 - 80154.49 m/m²"/>
  <sld:ColorMapEntry color="#7a0403" quantity="100193.11" label="80154.49 - 100193.11 m/m²"/>
</sld:ColorMap>

          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
