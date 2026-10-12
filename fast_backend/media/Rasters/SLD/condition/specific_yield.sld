<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:sld="http://www.opengis.net/sld" version="1.0.0" xmlns:ogc="http://www.opengis.net/ogc">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Specific_Yield</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
            <sld:ColorMap type="intervals">
              <sld:ColorMapEntry quantity="0.067207240000000001" color="#30123b" label="0.05 - 0.07"/>
              <sld:ColorMapEntry quantity="0.080414479999999997" color="#28bceb" label="0.07 - 0.08"/>
              <sld:ColorMapEntry quantity="0.093621719999999992" color="#a4fc3c" label="0.08 - 0.09"/>
              <sld:ColorMapEntry quantity="0.10682896" color="#fb7e21" label="0.09 - 0.11"/>
              <sld:ColorMapEntry quantity="0.13" color="#7a0403" label="> 0.11"/>
            </sld:ColorMap>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
