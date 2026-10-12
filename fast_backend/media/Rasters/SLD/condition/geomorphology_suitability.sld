<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:sld="http://www.opengis.net/sld" version="1.0.0" xmlns:ogc="http://www.opengis.net/ogc">
  <UserLayer>
    <sld:LayerFeatureConstraints>
      <sld:FeatureTypeConstraint/>
    </sld:LayerFeatureConstraints>
    <sld:UserStyle>
      <sld:Name>Geomorphology.tif</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
              </sld:GrayChannel>
            </sld:ChannelSelection>
            <sld:ColorMap type="values">
              <sld:ColorMapEntry color="#cb2404" quantity="1" label="Water Body&#8211;Lake"/>
              <sld:ColorMapEntry color="#f8f863" quantity="1" label="Water Body&#8211;Unclassified"/>
              <sld:ColorMapEntry color="#430df1" quantity="2" label="River"/>
              <sld:ColorMapEntry color="#feac0d" quantity="3" label="Pond"/>
              <sld:ColorMapEntry color="#0a61f5" quantity="4" label="Older Flood Plain"/>
              <sld:ColorMapEntry color="#11d71b" quantity="6" label="Older Alluvial Plain"/>
            </sld:ColorMap>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </UserLayer>
</StyledLayerDescriptor>
