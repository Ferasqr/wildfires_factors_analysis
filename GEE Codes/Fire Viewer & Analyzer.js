//This code is developed by Feras Alqrinaiwi for the Geoinformatics Project



// Create a title panel with centered text
var titlePanel = ui.Panel([
  ui.Label('Fire Viewer & Analyzer', {
    fontWeight: 'bold',
    fontSize: '24px',
    margin: '10px 5px',
    textAlign: 'center',
    stretch: 'horizontal'
  }),
  ui.Label('By: Feras Alqrinawi', {
    fontSize: '16px',
    margin: '0 5px 10px 5px',
    textAlign: 'center',
    stretch: 'horizontal'
  })
], ui.Panel.Layout.flow('vertical'), {stretch: 'horizontal'});

// Create a dropdown menu for the user to select the continent
var continentSelect = ui.Select({
  items: ['Africa', 'Asia', 'Europe', 'North America', 'South America', 'Oceania', 'Australia'],
  placeholder: 'Select a continent',
  onChange: updateVisualization
});

// Create a slider for year selection
var yearSlider = ui.Slider({
  min: 2001,
  max: 2023,
  step: 1,
  value: 2001,
  style: {stretch: 'horizontal'}
});
yearSlider.onChange(updateVisualization);

// Function to update the visualization based on selected continent and year
function updateVisualization() {
  var selectedContinent = continentSelect.getValue();
  var selectedYear = yearSlider.getValue();
  
  if (!selectedContinent) return;

  // Define the continental boundary based on user selection
  var continents = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');
  var selectedContinentFeature = continents.filter(ee.Filter.eq('wld_rgn', selectedContinent));

  // Import the MODIS Burned Area Monthly Global 500m dataset
  var modis = ee.ImageCollection('MODIS/061/MCD64A1')
    .filterBounds(selectedContinentFeature)
    .select('BurnDate');

  // Function to calculate monthly burn areas
  var calculateMonthlyBurnArea = function(month) {
    var startDate = ee.Date.fromYMD(selectedYear, month, 1);
    var endDate = startDate.advance(1, 'month');
    var monthlyBurn = modis
      .filterDate(startDate, endDate)
      .map(function(image) {
        return image.gt(0);
      })
      .max();
    var burnArea = monthlyBurn.multiply(ee.Image.pixelArea()).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: selectedContinentFeature.geometry(),
      scale: 500,
      maxPixels: 1e13
    });
    return ee.Feature(null, {
      'month': month,
      'area': ee.Number(burnArea.get('BurnDate')).divide(1e6) // Convert to square kilometers
    });
  };

  // Calculate burn areas for each month
  var months = ee.List.sequence(1, 12);
  var monthlyBurnAreas = ee.FeatureCollection(months.map(calculateMonthlyBurnArea));

  // Create a chart
  var chart = ui.Chart.feature.byFeature(monthlyBurnAreas, 'month', 'area')
    .setChartType('ColumnChart')
    .setOptions({
      title: 'Monthly Burned Area in ' + selectedContinent + ' (' + selectedYear + ')',
      hAxis: {title: 'Month', viewWindow: {min: 1, max: 12}},
      vAxis: {title: 'Burned Area (sq km)'},
      legend: {position: 'none'},
      colors: ['red'] // Set the chart color to red
    });

  // Clear previous chart and add new one
  chartPanel.clear();
  chartPanel.add(chart);

  // Visualize the burned area on the map
  var yearStart = ee.Date.fromYMD(selectedYear, 1, 1);
  var yearEnd = yearStart.advance(1, 'year');
  var burnedAreaYear = modis
    .filterDate(yearStart, yearEnd)
    .map(function(image) {
      return image.gt(0);
    })
    .max();
  
  var burnedAreaVis = {
    min: 0,
    max: 1,
    palette: ['black', 'red']
  };

  Map.layers().reset();
  Map.centerObject(selectedContinentFeature, 4);
  Map.addLayer(selectedContinentFeature.style({fillColor: '00000000'}), {}, 'Continental Boundary');
  Map.addLayer(burnedAreaYear, burnedAreaVis, 'Burned Area ' + selectedYear);
}

// Create a panel to hold the chart
var chartPanel = ui.Panel();

// Add UI elements to the map
Map.add(ui.Panel({
  widgets: [
    titlePanel,
    ui.Label('Select a continent:'),
    continentSelect,
    ui.Label('Select a year:'),
    yearSlider,
    chartPanel
  ],
  style: {width: '400px', position: 'top-left'}
}));

// Initial update
updateVisualization();
