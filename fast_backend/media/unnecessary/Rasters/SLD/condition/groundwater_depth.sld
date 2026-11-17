<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>groundwater_level</sld:Name>
    <sld:UserStyle>
      <sld:Name>groundwater_level</sld:Name>
      <sld:FeatureTypeStyle>
        <sld:Name>name</sld:Name>
        <sld:Rule>
          <sld:RasterSymbolizer>
            <sld:ChannelSelection>
              <sld:GrayChannel>
                <sld:SourceChannelName>1</sld:SourceChannelName>
                <sld:ContrastEnhancement>
                  <sld:GammaValue>1.0</sld:GammaValue>
                </sld:ContrastEnhancement>
              </sld:GrayChannel>
            </sld:ChannelSelection>
<sld:ColorMap>
    <sld:ColorMapEntry color="#30123b" quantity="5.34" label="0.05 - 5.34 m"/>
    <sld:ColorMapEntry color="#3e9cfe" quantity="7.94" label="5.34 - 7.94 m"/>
    <sld:ColorMapEntry color="#48f882" quantity="10.73" label="7.94 - 10.73 m"/>
    <sld:ColorMapEntry color="#e2dc38" quantity="14.49" label="10.73 - 14.49 m"/>
    <sld:ColorMapEntry color="#ef5911" quantity="25.0" label="14.49 - 25.0 m"/>
</sld:ColorMap>
            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>

