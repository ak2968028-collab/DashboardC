<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Drainage_Density</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
            <sld:ColorMap type="intervals">
              <sld:ColorMapEntry color="#ef5911" quantity="793.9294921875" label="0 - 793.93 m"/>
              <sld:ColorMapEntry color="#e2dc38" quantity="1587.858984375" label="793.93 - 1587.86 m"/>
              <sld:ColorMapEntry color="#48f882" quantity="2381.7884765625" label="1587.86 - 2381.79 m"/>
              <sld:ColorMapEntry color="#3e9cfe" quantity="3175.71796875" label="2381.79 - 3175.72 m"/>
              <sld:ColorMapEntry color="#30123b" quantity="3969.6474609375" label="3175.72 - 3969.65 m"/>
            </sld:ColorMap>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
