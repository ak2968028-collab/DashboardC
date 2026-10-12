<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0" xmlns:sld="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Rainfall</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry color="#d7191c" quantity="913.31401366" label="&lt;= 913.31 mm"/>
  <sld:ColorMapEntry color="#fdae61" quantity="947.85300291999999" label="913.31 - 947.85 mm"/>
  <sld:ColorMapEntry color="#ffffc0" quantity="982.39199217999999" label="947.85 - 982.39 mm"/>
  <sld:ColorMapEntry color="#a6d96a" quantity="1016.93098144" label="982.39 - 1016.93 mm"/>
  <sld:ColorMapEntry color="#1a9641" quantity="1051.4699707" label="1016.93 - 1051.47 mm"/>
</sld:ColorMap>

          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
