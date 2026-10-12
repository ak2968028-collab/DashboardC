<?xml version="1.0" encoding="UTF-8"?><sld:StyledLayerDescriptor xmlns:sld="http://www.opengis.net/sld" xmlns="http://www.opengis.net/sld" xmlns:gml="http://www.opengis.net/gml" xmlns:ogc="http://www.opengis.net/ogc" version="1.0.0">
  <sld:NamedLayer>
    <sld:Name>Proximity_River_Quality</sld:Name>
    <sld:UserStyle>
      <sld:Name>Proximity_River_Quality</sld:Name>
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
    <sld:ColorMapEntry color="#006837" quantity="1.9000011999999999" label="Very Good"/>
    <sld:ColorMapEntry color="#66BD63" quantity="3.9250008999999997" label="Good"/>
    <sld:ColorMapEntry color="#FFFFBF" quantity="5.9500006000000001" label="Moderate"/>
    <sld:ColorMapEntry color="#FDAE61" quantity="7.9750002999999996" label="Poor"/>
    <sld:ColorMapEntry color="#D73027" quantity="10" label="Very Poor"/>
</sld:ColorMap>
            <sld:ContrastEnhancement/>
          </sld:RasterSymbolizer>
        </sld:Rule>
      </sld:FeatureTypeStyle>
    </sld:UserStyle>
  </sld:NamedLayer>
</sld:StyledLayerDescriptor>

