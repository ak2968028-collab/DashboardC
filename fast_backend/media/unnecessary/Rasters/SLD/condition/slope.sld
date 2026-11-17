<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Slope</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
            <sld:ColorMap type="intervals">
  <sld:ColorMapEntry color="#3e9cfe" quantity="1" label="&lt;= 1°"/>
  <sld:ColorMapEntry color="#48f882" quantity="3" label="1° - 3°"/>
  <sld:ColorMapEntry color="#e2dc38" quantity="5" label="3° - 5°"/>
  <sld:ColorMapEntry color="#ef5911" quantity="10" label="5° - 10°"/>
  <sld:ColorMapEntry color="#7a0403" quantity="24" label="10° - 24°"/>
</sld:ColorMap>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
