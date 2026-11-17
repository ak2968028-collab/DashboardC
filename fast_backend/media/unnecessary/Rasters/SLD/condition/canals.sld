<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:sld="http://www.opengis.net/sld" version="1.0.0" xmlns:ogc="http://www.opengis.net/ogc">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Canals</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry quantity="1776.25" color="#30123b" label="0.00 m - 1776.25 m"/>
  <sld:ColorMapEntry quantity="3552.51" color="#28bceb" label="1776.25 m - 3552.51 m"/>
  <sld:ColorMapEntry quantity="5328.76" color="#a4fc3c" label="3552.51 m - 5328.76 m"/>
  <sld:ColorMapEntry quantity="7105.01" color="#fb7e21" label="5328.76 m - 7105.01 m"/>
  <sld:ColorMapEntry quantity="8900.00" color="#7a0403" label="&gt; 7105.01 m"/>
</sld:ColorMap>

          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
