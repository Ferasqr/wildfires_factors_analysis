
//This code is developed by Feras Alqrinaiwi for the Geoinformatics Project

var ls8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_TOA");
var climateVar = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE");
var dem = ee.Image("USGS/SRTMGL1_003");
var human_impact_index = ee.ImageCollection("projects/HII/v1/hii");
var infrastructure = ee.ImageCollection("projects/HII/v1/driver/infrastructure");
var population_density = ee.ImageCollection("projects/HII/v1/driver/population_density");
var Continent = ee.FeatureCollection("projects/ee-geoproj/assets/Africa");
var dataset = ee.ImageCollection("MODIS/006/MCD64A1");
var lightningFrequency = ee.ImageCollection("NASA/GLDAS/V021/NOAH/G025/T3H").select('Rainf_f_tavg'); // Proxy for lightning
var evapotranspiration = ee.ImageCollection("MODIS/006/MOD16A2").select('ET');
var distanceToWaterBodies = ee.Image("JRC/GSW1_3/GlobalSurfaceWater").select('occurrence');
var fuelLoad = ee.ImageCollection("NASA/ORNL/biomass_carbon_density/v1").select('agb'); // Correct band for aboveground biomass
var fuelMoistureContent = ee.ImageCollection("MODIS/006/MOD13Q1").select('NDVI'); // Proxy for fuel moisture
var solarRadiation = ee.ImageCollection("IDAHO_EPSCOR/TERRACLIMATE").select('srad');
//Loading the hexagon grid produced in QGIS with a 500km horizontal and vertical spacing, on a WGS84 Pseudo-mercator projection
var Grid_500km = ee.FeatureCollection('projects/ee-geoproj/assets/grid_500km_mercator'); //Hexagon grid



//Clipping
var clippedGrid = Grid_500km.filterBounds(Continent.geometry());



//***********************************\\MODIS MASK BURNED AREAS//****************************************//
// Set date range
var startDate = ee.Date('2010-01-01');
var endDate = ee.Date(Date.now()); // Automatically set to current date

// Print the date range used for analysis
print('Analysis Date Range:', startDate.format('YYYY-MM-dd'), 'to', endDate.format('YYYY-MM-dd'));





// MODIS Burned Area Processing
var Modis = dataset.filter(ee.Filter.date(startDate, endDate));
  print(Modis.first(),'Fires');
  
  var scale = Modis.first().projection().nominalScale().getInfo();
  print( 'scale:', scale);

  // Defining a threshold for the BurnDate
  var burnDateThreshold = 1; 

  // Creating a binary target variable based on the threshold (1 for burned, 0 for not).
  var burnedMask = Modis.map(function(image) {
    var isBurned = image.select('BurnDate').gte(burnDateThreshold);
    return isBurned.rename('Burned'); // Use a single band for the mask
  });
  
  // Summing all images in the collection to create a cumulative burned area image
  var cumulativeBurnedMask = burnedMask.sum();
  Map.addLayer(cumulativeBurnedMask, {min:0, max:3},'cumulativeBurnedMask',0);
  
  // fix: use where
  cumulativeBurnedMask = cumulativeBurnedMask.where(cumulativeBurnedMask.gte(1),1);

  var cumulativeBurnedMask_at_15km = cumulativeBurnedMask//.unmask()
  .setDefaultProjection({crs :'SR-ORG:6974',scale :463})
    .reduceResolution(ee.Reducer.sum().unweighted(), false, 50) 
    .reproject(ee.Projection('EPSG:4326').scale(0.015, 0.015)).updateMask(1);
    
  Map.addLayer(cumulativeBurnedMask_at_15km, { palette: ['blue','red'] }, 'Clipped Burned Area 5k');
  
  
  //Mask non pure pixels
  var PureFires = cumulativeBurnedMask_at_15km.updateMask(cumulativeBurnedMask_at_15km.gte(10));
  PureFires = PureFires.where(PureFires.gte(1),1);
  
  Map.addLayer(PureFires, { palette: 'FF0000' }, 'pure fires');

  //Create an area image by multiplying the burned mask with pixel area
  var areaImage = PureFires.multiply(ee.Image.pixelArea());
  print(cumulativeBurnedMask);
  
  // Clip MODIS burned area to the extent of the clipped grid
  var clippedBurnedArea = burnedMask.map(function(image) {
    return image.clip(clippedGrid.geometry());
  });

  // Simplify the geometry of the grid
  var simplifiedGrid = clippedGrid.map(function(feature) {
    return feature.simplify(100); 
  });
  
  // Perform zonal statistics to calculate the area burned within each hexagon in the grid
  var stats = areaImage.reduceRegions({
    collection: simplifiedGrid,
    reducer: ee.Reducer.sum(),
    scale: 1500,
    crs: 'EPSG:4326',
    tileScale: 4
  });

  
  // Display the burned area with the clipped grid
  Map.addLayer(clippedGrid, { color: 'blue' }, 'Clipped Grid',0);
  Map.addLayer(burnedMask, { palette: 'FF0000' }, 'Burned Mask',0);
  Map.addLayer(cumulativeBurnedMask, { palette: 'FF0000' }, 'Clipped Burned Area');
  print('cumulativeBurnedMask',cumulativeBurnedMask);

  
  // Print the number of hexagons (features) in the table
  var numberOfHexagons = stats.size();
  print('Number of Hexagons:', numberOfHexagons);
  
  // Filter hexagons with burned pixel sum equal to 0
  var hexagonsWithBurnedPixelSum0 = stats.filter(ee.Filter.eq('sum', 0));
  
  // Filter hexagons with burned pixel sum different than 0
  var hexagonsWithBurnedPixelSumNot0 = stats.filter(ee.Filter.neq('sum', 0));

  // Print the number of hexagons in each category
  var numberOfHexagonsWithBurnedPixelSum0 = hexagonsWithBurnedPixelSum0.size();
  var numberOfHexagonsWithBurnedPixelSumNot0 = hexagonsWithBurnedPixelSumNot0.size();
  
  print('Number of Hexagons with Burned Pixel Sum 0:', numberOfHexagonsWithBurnedPixelSum0);
  print('Number of Hexagons with Burned Pixel Sum Not 0:', numberOfHexagonsWithBurnedPixelSumNot0);
  
  
  //Assigning unique IDs to each hexagon and shuffling them to ensure they are not in a specific order
  var fc = hexagonsWithBurnedPixelSum0.distinct('id').aggregate_array('id').shuffle(1);

  print('fc',fc);
  print('fc 1',fc.getNumber(1));


  // Add layers for visualization
  Map.addLayer(hexagonsWithBurnedPixelSum0, {color: 'blue'}, 'Hexagons with Burned Pixel Sum 0',0);
  Map.addLayer(hexagonsWithBurnedPixelSumNot0, {color: 'purple'}, 'Hexagons with Burned Pixel Sum Not 0',0);
  




//***********************************\\VARAIBLES//****************************************//


  
  // Loading Landsat 8 image collection
  var ls8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_TOA')
    .filterBounds(Continent)
    .filterDate(startDate, endDate);
  
  // Write a function for Landsat cloud masking
  function maskL8clouds(image) {
    var qa = image.select('QA_PIXEL'); 
    var cloudBitMask = 1 << 4; 
    var shadowBitMask = 1 << 3; 
    var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
              qa.bitwiseAnd(shadowBitMask).eq(0));
    return image.updateMask(mask)
        .select('B.*') 
        .copyProperties(image, ['system:time_start']);
  }

  var maskedLandsat = ls8.map(maskL8clouds);
  var landsat8 = maskedLandsat.median();


//////CLIMATE and HYDROLOGY VARIABLES USING LANDSAT8//////
  
  //Wind speed
  var windSpeed = climateVar.select('vs')
    .filterDate(startDate,endDate)
    .median() ;
  //Max temperature
  var tempMax = climateVar.select('tmmx')
    .filterDate(startDate,endDate)
    .median() ;
  //Min temperature
  var tempMin = climateVar.select('tmmn')
    .filterDate(startDate,endDate)
    .median() ;
  //Water deficit
  var waterDeficit = climateVar.select('def')
    .filterDate(startDate,endDate)
    .median() ;
  //Precipitation
  var precipitation = climateVar.select('pr')
    .filterDate(startDate,endDate)
    .median() ;
  //Soil Moisture
  var soilMoist = climateVar.select('soil')
    .filterDate(startDate,endDate)
    .median() ;
  


//////VEGETATION VARIABLES USING LANDSAT8//////
  
  //Computing NDVI
  var NDVI = landsat8.normalizedDifference(['B5', 'B4']);
  Map.addLayer(NDVI, {}, 'NDVI',0);
      
  //Computing NDMI (Normalized Difference Moisture Index) with the bands NIR and SWIR
  var NDMI = landsat8.normalizedDifference(['B5', 'B6']);
  Map.addLayer(NDMI ,{}, 'NDMI',0);
  
  
//////TOPOGRAPHIC VARIABLES//////
  
  //SLOPE
  var slope = ee.Terrain.slope(dem) ;
  Map.addLayer(slope,{min:0,max:20,palette:["ffe3e0","fbc3bc","f7a399","f38375","ef6351"]}, 'Slope',0);
  
  //ASPECT
  var aspect = ee.Terrain.aspect(dem);
  Map.addLayer(aspect,{min:0,max:360,palette:["#212529","#adb5bd","#e9ecef","#adb5bd","#212529"]}, 'Aspect',0);
  
  
//////LAND COVER LAYER//////

  //Add the land cover dataset from MCD12Q1
  var mcd12q1 = ee.ImageCollection('MODIS/061/MCD12Q1')
                    .filter(ee.Filter.date('2010-01-01', '2023-09-01'))
                    .first();
  // Select the land cover band 
  var landCoverBand = mcd12q1.select('LC_Type1');
  var landCoverPalette = [
    '05450a', '086a10', '54a708', '78d203', '009900',
    'c6b044', 'dcd159', 'dade48', 'fbff13', 'b6ff05',
    '27ff87', 'c24f44', 'a5a5a5', 'ff6d4c', '69fff8',
    'f9ffa4', '1c0dff'
  ];
  
  // Set the land cover visualization parameters
  var mcd12q1Vis = {min: 1, max: 17, palette: landCoverPalette};
  // Add the MCD12Q1 map layer
  Map.addLayer(landCoverBand, mcd12q1Vis, 'MCD12Q1 Land Cover',0);
  
  // Reproject the "LandCover" band to match the CRS of the other bands (e.g., EPSG:4326).
  var landCoverReprojected = landCoverBand.reproject({crs: 'EPSG:4326'});
  
  
//////HUMAN IMPACT//////

  // Asset specifications for Human Impact Index and drivers
  // Use Inspector tool to inspect ImageCollection details and pixel series charts
  var hiiviz = {min: 5, max: 5000, palette: ["224f1a","a3ff76","feff6f","a09568","ffa802","f7797c","fb0102","d87136","a90086","7a1ca5","421137","000000"]};
  var infviz = {min: 0, max: 1000, palette: ['f1edec', 'dfbcb0', 'd08b73', 'c0583b', 'a62225', '730e27', '3c0912']};
  var popviz = {min: 0, max: 1000, palette: ['151d44', '156c72', '7eb390', 'fdf5f4', 'db8d77', '9c3060', '340d35']};
 
  var humanImpactIndexMean = human_impact_index.mean();
  //added new factors

// 1. Relative Humidity
var relativeHumidity = climateVar.select('vpd')
  .filterDate(startDate, endDate)
  .median();
  
  // 2. Lightning Strikes
// Using WWLLN dataset for lightning strikes
var wwlln = ee.ImageCollection("NOAA/GFS0P25")
  .select('lightning_probability')
  .filterDate(startDate, endDate)
  .mean();

// 3. Elevation
// We already have the DEM, so we can use it directly
var elevation = dem;

// 4. Population Density
// Using the WorldPop dataset
var populationDensity = population_density.mean();

  
// Creating an image with all the predictor variables as bands.
  var predictorImage = landsat8
    .addBands(slope.rename('Slope')) 
    .addBands(aspect.rename('Aspect'))
    .addBands(windSpeed.rename('WindSpeed'))
    .addBands(tempMax.rename('TempMax'))
    .addBands(tempMin.rename('TempMin'))
    .addBands(precipitation.rename('Precipitation'))
    .addBands(soilMoist.rename('SoilMoist'))
    .addBands(NDVI.rename('NDVI'))
    .addBands(NDMI.rename('NDMI'))
    .addBands(landCoverReprojected.rename('LandCover'))
    .addBands(humanImpactIndexMean.rename('HumanImpactIndexMean'))
    .addBands(relativeHumidity.rename('RelativeHumidity'))
    .addBands(elevation.rename('Elevation'))
    .addBands(fuelLoad.median().rename('FuelLoad'))
    .addBands(fuelMoistureContent.median().rename('FuelMoistureContent'))
    .addBands(solarRadiation.median().rename('SolarRadiation'))
    .addBands(lightningFrequency.median().rename('LightningFrequency'))
    .addBands(evapotranspiration.median().rename('Evapotranspiration'))
    .addBands(distanceToWaterBodies.rename('DistanceToWaterBodies'))
    .addBands(populationDensity.rename('PopulationDensity'));

  
  var bandNames = ['Slope', 'Aspect', 'WindSpeed', 'TempMax', 'TempMin', 
  'Precipitation', 'SoilMoist', 'NDVI', 'NDMI','LandCover','HumanImpactIndexMean', 
  'RelativeHumidity','Elevation', 'FuelLoad', 'FuelMoistureContent', 'SolarRadiation','LightningFrequency','Evapotranspiration','PopulationDensity'];
  predictorImage = predictorImage.select(bandNames);

  // Clip the predictorImage to the clippedGrid
  var clippedPredictorImage = predictorImage.clip(clippedGrid.geometry());
  
  // Print the clipped predictorImage
  print('Clipped Predictor Image:', clippedPredictorImage);
  
  // Display the clipped predictorImage
  Map.addLayer(clippedPredictorImage, {}, 'Clipped Predictor Image',0);


  
  // Reduce the image collection to a single image (for example, using mosaic)
  var burnedAreaImage = clippedBurnedArea.mosaic();
  
  // Mask the normalized predictor image outside the burned area
  var burnedAreaMasked =predictorImage.updateMask(burnedAreaImage);
  


//***********************************\\SAMPLING POINTS//****************************************//

  //Creating an Image of non_burned hexagons using for creating points
  var unBurned = hexagonsWithBurnedPixelSum0.reduceToImage({
	properties: ['unburned'],
	reducer: ee.Reducer.sum()
  });
  unBurned = unBurned.toByte().reproject('EPSG:4326', null, 1500).clip(hexagonsWithBurnedPixelSum0);
  
  //USING A FOR LOOP TO REACH EACH SINGLE HEXAGON AND THE POINTS WITHIN EACH HEXAGON
  // single hexzagon
var finalresults = [];
for (var y=0; y<20; y++) { 
  
  var fc_1 = fc.getNumber(y);
  print('fc_1',fc_1);
  

  var HEXsingle  = hexagonsWithBurnedPixelSum0.filter(ee.Filter.eq('id', fc_1));
  Map.addLayer(HEXsingle,{},'HEXsingle');
  print('HEXsingle',HEXsingle);

	//Applying stratified sampling method
  var Sample_singleHex = unBurned.stratifiedSample({
    numPoints : 5,
    classBand: 'sum',
    region:HEXsingle,
    scale: 1500, 
    projection: 'EPSG:4326',
    seed: 1,
    geometries: true});
    
  print('Sample_singleHex',Sample_singleHex);
  Map.addLayer(Sample_singleHex, {},'Sample_singleHex');
  
  
  Sample_singleHex = Sample_singleHex.map(function(i){return i.set('idx', i.id())});
  print('U_randomSamples',Sample_singleHex);
	
	//Assigning variables to each point
  var results = predictorImage.select(['.*']).reduceRegions(Sample_singleHex,
  ee.Reducer.toCollection(['Slope', 'Aspect', 'WindSpeed', 'TempMax', 'TempMin', 
  'Precipitation', 'SoilMoist', 'NDVI', 'NDMI','LandCover','HumanImpactIndexMean', 
  'RelativeHumidity','Elevation', 'FuelLoad', 'FuelMoistureContent', 'SolarRadiation','LightningFrequency','Evapotranspiration','PopulationDensity']),1500);
  
  results = results.map(function(f) {
    return ee.FeatureCollection(f.get("features")).map(function(g) {
      // Propagate the uniqueid and region values into all the extracted values.
      return g.set(f.select(["idx"]).toDictionary());
    });
  });
  
	results = results.flatten();
  results  = results.select(['.*'], null, false);
  print('results',results);
  
  //Merging all the points we get from results for each hexagon to have a unique file for all points
  finalresults = results.merge(finalresults);
  
}
  print('finalresults',finalresults);
    
// Export results
Export.table.toDrive({
  collection: finalresults,
  folder: 'FireAnalysis2024',
  description: 'Final_Unburned_Points_Africa_' ,
  fileFormat: 'CSV'
});