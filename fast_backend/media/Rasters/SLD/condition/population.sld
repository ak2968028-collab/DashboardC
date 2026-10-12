<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>Population_Density</sld:Name>
    <sld:UserStyle>
      <sld:Name>Population_Density</sld:Name>
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
    <sld:ColorMapEntry color="#FFFF00" quantity="1600" label="382 - 1600"/>
    <sld:ColorMapEntry color="#FFC000" quantity="5000" label="1600 - 5000"/>
    <sld:ColorMapEntry color="#FF8000" quantity="10000" label="5000 - 10000"/>
    <sld:ColorMapEntry color="#FF4000" quantity="20000" label="10000 - 20000"/>
    <sld:ColorMapEntry color="#FF0000" quantity="20000" label="&gt; 20000"/>
</sld:ColorMap>

            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>

