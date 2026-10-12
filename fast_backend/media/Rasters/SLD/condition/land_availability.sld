<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" version="1.0.0" xmlns:gml="http://www.opengis.net/gml" xmlns:sld="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Land_Availability</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry quantity="0.13" color="#d7191c" label="Very Low"/>
  <sld:ColorMapEntry quantity="0.44" color="#fdae61" label="Low"/>
  <sld:ColorMapEntry quantity="0.95" color="#ffffbf" label="Moderate"/>
  <sld:ColorMapEntry quantity="1.81" color="#abdda4" label="High"/>
  <sld:ColorMapEntry quantity="3.1" color="#2b83ba" label="Very High"/>
</sld:ColorMap>


          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
