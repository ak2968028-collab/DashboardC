<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld">
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


<sld:ColorMap type="ramp">
  <sld:ColorMapEntry quantity="0.00" color="#30123b" label="0.00 - 4.04 m/m²"/>
  <sld:ColorMapEntry quantity="4.04" color="#28bceb" label="4.04 - 8.08 m/m²"/>
  <sld:ColorMapEntry quantity="8.08" color="#a4fc3c" label="8.08 - 12.12 m/m²"/>
  <sld:ColorMapEntry quantity="12.12" color="#fb7e21" label="12.12 - 16.16 m/m²"/>
  <sld:ColorMapEntry quantity="16.16" color="#7a0403" label="&gt; 16.16 m/m²"/>
</sld:ColorMap>

          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
