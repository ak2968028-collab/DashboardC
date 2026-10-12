<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>Water_Demand_PCS</sld:Name>
    <sld:UserStyle>
      <sld:Name>Water_Demand_PCS</sld:Name>
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
<sld:ColorMap type="intervals">
  <sld:ColorMapEntry color="#30123b" quantity="42664" label="0 L - 42664 L"/>
  <sld:ColorMapEntry color="#3e9cfe" quantity="74762" label="42664 L - 74762 L"/>
  <sld:ColorMapEntry color="#48f882" quantity="111552" label="74762 L - 111552 L"/>
  <sld:ColorMapEntry color="#e2dc38" quantity="156058" label="111552 L - 156058 L"/>
  <sld:ColorMapEntry color="#ef5911" quantity="237181" label="156058 L - 237181 L"/>
  <sld:ColorMapEntry color="#7a0403" quantity="72909504" label="237181 L - 72909504 L"/>
</sld:ColorMap>

            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>

