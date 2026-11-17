<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Groundwater_Drawdown</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
            <sld:ColorMap type="ramp">
              <sld:ColorMapEntry quantity="0.0040984000000000003" color="#d7191c" label="0.0041"/>
              <sld:ColorMapEntry quantity="0.23503640000000001" color="#fdae61" label="0.2350"/>
              <sld:ColorMapEntry quantity="0.46597440000000001" color="#ffffbf" label="0.4660"/>
              <sld:ColorMapEntry quantity="0.69691239999999999" color="#abdda4" label="0.6969"/>
              <sld:ColorMapEntry quantity="0.92785039999999996" color="#2b83ba" label="0.9279"/>
            </sld:ColorMap>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
