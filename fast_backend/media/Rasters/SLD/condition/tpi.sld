<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>TPI</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry color="#30123b" quantity="-2.00" label="&lt;= -2.00"/>
  <sld:ColorMapEntry color="#28bceb" quantity="0.00" label="-2.00 - 0.00"/>
  <sld:ColorMapEntry color="#a4fc3c" quantity="1.00" label="0.00 - 1.00"/>
  <sld:ColorMapEntry color="#fb7e21" quantity="2.00" label="1.00 - 2.00"/>
  <sld:ColorMapEntry color="#7a0403" quantity="21.00" label="2.00 - 21.00"/>
</sld:ColorMap>

          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
