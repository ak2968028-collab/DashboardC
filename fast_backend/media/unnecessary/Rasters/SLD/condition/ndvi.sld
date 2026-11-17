<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>NDVI</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry color="#8B0000" quantity="0.077137980000000009" label="&lt;= 0.08"/>
  <sld:ColorMapEntry color="#D73027" quantity="0.23507296" label="0.08 - 0.24"/>
  <sld:ColorMapEntry color="#FEE08B" quantity="0.39300794" label="0.24 - 0.39"/>
  <sld:ColorMapEntry color="#66BD63" quantity="0.55094292" label="0.39 - 0.55"/>
  <sld:ColorMapEntry color="#006400" quantity="0.70887789999999995" label="0.55 - 0.71"/>
</sld:ColorMap>

          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
