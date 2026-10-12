<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Groundwater_Recharge</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry color="#fb7e21" quantity="131" label="&lt;= 131 mm/year"/>
  <sld:ColorMapEntry color="#a4fc3c" quantity="178" label="131 - 178 mm/year"/>
  <sld:ColorMapEntry color="#28bceb" quantity="221" label="178 - 221 mm/year"/>
  <sld:ColorMapEntry color="#30123b" quantity="282" label="221 - 282 mm/year"/>
  <sld:ColorMapEntry color="#30123b" quantity="381" label="282 - 381 mm/year"/>
</sld:ColorMap>

          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
