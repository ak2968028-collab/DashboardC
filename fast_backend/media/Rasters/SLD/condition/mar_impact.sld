<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>MAR</sld:Name>
    <sld:UserStyle>
      <sld:Name>MAR</sld:Name>
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
              <sld:ColorMapEntry color="#d7191c" quantity="0.157384" label=" Very Low"/>
              <sld:ColorMapEntry color="#fdae61" quantity="0.31476799999999999" label=" Low"/>
              <sld:ColorMapEntry color="#ffffbf" quantity="0.47215200000000002" label=" Medium"/>
              <sld:ColorMapEntry color="#abdda4" quantity="0.62953599999999998" label=" High"/>
              <sld:ColorMapEntry color="#2b83ba" quantity="0.8" label=" Very High"/>
            </sld:ColorMap>
            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>

