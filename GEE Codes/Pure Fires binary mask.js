//This code is developed by Feras Alqrinaiwi for the Geoinformatics Project



// Define the start date and set the end date to the current date.
var startDate = '2010-01-01';
var endDate = new Date().toISOString().slice(0, 10); // Current date in 'YYYY-MM-DD' format

// Load MODIS burned area collection and filter by date.
var modisBurnedArea = ee.ImageCollection('MODIS/006/MCD64A1')
                        .filterDate(startDate, endDate);

// Define the region of interest (Australia).
var australia = ee.FeatureCollection('projects/ee-burned/assets/Australia');

// Define the burn date threshold.
var burnDateThreshold = 1;

// Function to classify the pixels.
var classifyPixels = function(image) {
  var burnDate = image.select('BurnDate');
  var burned = burnDate.gt(burnDateThreshold);
  return burned.rename('Burned');
};

// Apply the classification function to each image.
var binaryMaskCollection = modisBurnedArea.map(classifyPixels);

// Create a cumulative burned area image.
var cumulativeBurnedArea = binaryMaskCollection.sum();

// Create a Pure Fires binary mask (thresholded cumulative image).
var pureFiresBinaryMask = cumulativeBurnedArea.gt(0).clip(australia);

// Display the results.
Map.centerObject(australia, 4);
Map.addLayer(cumulativeBurnedArea.clip(australia), {min: 0, max: 10, palette: ['white', 'red']}, 'Cumulative Burned Area');
Map.addLayer(pureFiresBinaryMask, {min: 0, max: 1, palette: ['white', 'red']}, 'Pure Fires Binary Mask');

// Export the results if needed.
Export.image.toDrive({
  image: pureFiresBinaryMask,
  description: 'PureFiresBinaryMask',
  scale: 500,
  region: australia.geometry(),
  maxPixels: 1e9 // Increase maxPixels value to handle larger exports
});
