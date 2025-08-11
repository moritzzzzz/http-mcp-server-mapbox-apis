import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 3000;
const MAPBOX_ACCESS_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

if (!MAPBOX_ACCESS_TOKEN) {
  console.error('MAPBOX_ACCESS_TOKEN environment variable is required');
  process.exit(1);
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// MCP Tools definitions
const tools = [
  {
    name: 'geocode_forward',
    description: 'Convert an address or place name into geographic coordinates (latitude, longitude)',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The address or place name to geocode'
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results to return (1-10)',
          minimum: 1,
          maximum: 10,
          default: 5
        },
        country: {
          type: 'string',
          description: 'ISO 3166-1 alpha-2 country code to limit results'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'geocode_reverse',
    description: 'Convert geographic coordinates into a human-readable address',
    inputSchema: {
      type: 'object',
      properties: {
        longitude: {
          type: 'number',
          description: 'Longitude coordinate',
          minimum: -180,
          maximum: 180
        },
        latitude: {
          type: 'number',
          description: 'Latitude coordinate',
          minimum: -90,
          maximum: 90
        },
        types: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter results by feature types'
        }
      },
      required: ['longitude', 'latitude']
    }
  },
  {
    name: 'get_directions',
    description: 'Get directions between multiple waypoints',
    inputSchema: {
      type: 'object',
      properties: {
        coordinates: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
          minItems: 2,
          description: 'Array of [longitude, latitude] coordinate pairs'
        },
        profile: {
          type: 'string',
          enum: ['driving', 'walking', 'cycling', 'driving-traffic'],
          default: 'driving',
          description: 'Routing profile'
        },
        geometries: {
          type: 'string',
          enum: ['geojson', 'polyline', 'polyline6'],
          default: 'geojson',
          description: 'Response geometry format'
        },
        steps: {
          type: 'boolean',
          default: true,
          description: 'Include turn-by-turn instructions'
        },
        overview: {
          type: 'string',
          enum: ['full', 'simplified', 'false'],
          default: 'full',
          description: 'Type of route geometry overview'
        }
      },
      required: ['coordinates']
    }
  },
  {
    name: 'get_static_image',
    description: 'Generate a static map image with optional markers and overlays',
    inputSchema: {
      type: 'object',
      properties: {
        style: {
          type: 'string',
          default: 'mapbox/streets-v12',
          description: 'Map style ID'
        },
        width: {
          type: 'number',
          minimum: 1,
          maximum: 1280,
          default: 600,
          description: 'Image width in pixels'
        },
        height: {
          type: 'number',
          minimum: 1,
          maximum: 1280,
          default: 400,
          description: 'Image height in pixels'
        },
        zoom: {
          type: 'number',
          minimum: 0,
          maximum: 22,
          description: 'Zoom level (required if no bbox)'
        },
        center: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2,
          description: '[longitude, latitude] center point (required if no bbox)'
        },
        bbox: {
          type: 'array',
          items: { type: 'number' },
          minItems: 4,
          maxItems: 4,
          description: 'Bounding box [minLon, minLat, maxLon, maxLat]'
        },
        markers: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              longitude: { type: 'number' },
              latitude: { type: 'number' },
              size: { type: 'string', enum: ['small', 'large'], default: 'small' },
              color: { type: 'string', default: 'red' },
              label: { type: 'string' }
            },
            required: ['longitude', 'latitude']
          },
          description: 'Array of markers to place on the map'
        }
      }
    }
  },
  {
    name: 'get_route_map',
    description: 'Generate a static map image showing a route with start and end markers',
    inputSchema: {
      type: 'object',
      properties: {
        coordinates: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
          minItems: 2,
          description: 'Array of [longitude, latitude] coordinate pairs for the route'
        },
        style: {
          type: 'string',
          default: 'mapbox/streets-v12',
          description: 'Map style ID'
        },
        width: {
          type: 'number',
          minimum: 1,
          maximum: 1280,
          default: 800,
          description: 'Image width in pixels'
        },
        height: {
          type: 'number',
          minimum: 1,
          maximum: 1280,
          default: 600,
          description: 'Image height in pixels'
        },
        route_polyline: {
          type: 'string',
          description: 'Encoded polyline string from directions API (optional, for route overlay)'
        }
      },
      required: ['coordinates']
    }
  },
  {
    name: 'get_matrix',
    description: 'Calculate travel times and distances between multiple points',
    inputSchema: {
      type: 'object',
      properties: {
        coordinates: {
          type: 'array',
          items: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
          minItems: 2,
          maxItems: 25,
          description: 'Array of [longitude, latitude] coordinate pairs'
        },
        profile: {
          type: 'string',
          enum: ['driving', 'walking', 'cycling', 'driving-traffic'],
          default: 'driving',
          description: 'Routing profile'
        },
        sources: {
          type: 'array',
          items: { type: 'number' },
          description: 'Indices of coordinates to use as sources (default: all)'
        },
        destinations: {
          type: 'array',
          items: { type: 'number' },
          description: 'Indices of coordinates to use as destinations (default: all)'
        },
        annotations: {
          type: 'array',
          items: { type: 'string', enum: ['duration', 'distance', 'speed'] },
          default: ['duration', 'distance'],
          description: 'Annotations to include in response'
        }
      },
      required: ['coordinates']
    }
  }
];

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'mapbox-mcp-server'
  });
});

// Get available tools
app.get('/tools', (req, res) => {
  res.json({ tools });
});

// Forward Geocoding
app.post('/geocode_forward', async (req, res) => {
  try {
    const { query, limit = 5, country } = req.body.arguments || req.body;
    
    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json`;
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN,
      limit: limit.toString()
    });
    
    if (country) {
      params.append('country', country);
    }
    
    url += `?${params}`;
    
    const response = await axios.get(url);
    
    const results = response.data.features.map(feature => ({
      place_name: feature.place_name,
      center: feature.center,
      place_type: feature.place_type,
      relevance: feature.relevance,
      properties: feature.properties,
      context: feature.context
    }));
    
    res.json({
      success: true,
      results,
      total: results.length
    });
  } catch (error) {
    console.error('Geocoding error:', error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Reverse Geocoding
app.post('/geocode_reverse', async (req, res) => {
  try {
    const { longitude, latitude, types } = req.body.arguments || req.body;
    
    let url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json`;
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN
    });
    
    if (types && types.length > 0) {
      params.append('types', types.join(','));
    }
    
    url += `?${params}`;
    
    const response = await axios.get(url);
    
    const results = response.data.features.map(feature => ({
      place_name: feature.place_name,
      center: feature.center,
      place_type: feature.place_type,
      relevance: feature.relevance,
      properties: feature.properties,
      context: feature.context
    }));
    
    res.json({
      success: true,
      results,
      total: results.length
    });
  } catch (error) {
    console.error('Reverse geocoding error:', error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Directions
app.post('/get_directions', async (req, res) => {
  try {
    const { coordinates, profile = 'driving', geometries = 'geojson', steps = true, overview = 'full' } = req.body.arguments || req.body;
    
    const coordinateString = coordinates.map(coord => coord.join(',')).join(';');
    
    // Get both geojson and polyline formats for different use cases
    const geojsonUrl = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinateString}?` + 
      new URLSearchParams({
        access_token: MAPBOX_ACCESS_TOKEN,
        geometries: 'geojson',
        steps: steps.toString(),
        overview
      });
    
    const polylineUrl = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinateString}?` + 
      new URLSearchParams({
        access_token: MAPBOX_ACCESS_TOKEN,
        geometries: 'polyline',
        steps: 'false',
        overview: 'full'
      });
    
    const [geojsonResponse, polylineResponse] = await Promise.all([
      axios.get(geojsonUrl),
      axios.get(polylineUrl)
    ]);
    
    const result = {
      success: true,
      routes: geojsonResponse.data.routes,
      waypoints: geojsonResponse.data.waypoints,
      code: geojsonResponse.data.code
    };
    
    // Add polyline data for map visualization
    if (polylineResponse.data.routes && polylineResponse.data.routes[0]) {
      result.polyline = polylineResponse.data.routes[0].geometry;
    }
    
    res.json(result);
  } catch (error) {
    console.error('Directions error:', error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Static Images
app.post('/get_static_image', async (req, res) => {
  try {
    const { 
      style = 'mapbox/streets-v12', 
      width = 600, 
      height = 400, 
      zoom, 
      center, 
      bbox, 
      markers = [] 
    } = req.body.arguments || req.body;
    
    let url = `https://api.mapbox.com/styles/v1/${style}/static`;
    
    // Add markers if provided
    if (markers.length > 0) {
      const markerString = markers.map(marker => {
        let markerStr = `pin-${marker.size || 'small'}`;
        if (marker.label) markerStr += `-${marker.label}`;
        markerStr += `+${marker.color || 'red'}(${marker.longitude},${marker.latitude})`;
        return markerStr;
      }).join(',');
      url += `/${markerString}`;
    }
    
    // Add geometry (center/zoom or bbox)
    if (bbox) {
      url += `/[${bbox.join(',')}]`;
    } else if (center && zoom !== undefined) {
      url += `/${center.join(',')},${zoom}`;
    }
    
    url += `/${width}x${height}`;
    
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN
    });
    
    url += `?${params}`;
    
    res.json({
      success: true,
      image_url: url,
      width,
      height
    });
  } catch (error) {
    console.error('Static image error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Route Map
app.post('/get_route_map', async (req, res) => {
  try {
    const { 
      coordinates,
      style = 'mapbox/streets-v12', 
      width = 800, 
      height = 600,
      route_polyline
    } = req.body.arguments || req.body;
    
    let url = `https://api.mapbox.com/styles/v1/${style}/static`;
    
    // Create start and end markers
    const startCoord = coordinates[0];
    const endCoord = coordinates[coordinates.length - 1];
    
    const markers = [
      `pin-s-a+00ff00(${startCoord[0]},${startCoord[1]})`,
      `pin-s-b+ff0000(${endCoord[0]},${endCoord[1]})`
    ];
    
    // Add route polyline if provided
    if (route_polyline) {
      // Use proper path syntax: path-{stroke width}+{color}-{opacity}({polyline})
      const pathOverlay = `path-5+0080ff-0.75(${encodeURIComponent(route_polyline)})`;
      url += `/${pathOverlay},${markers.join(',')}`;
    } else {
      url += `/${markers.join(',')}`;
    }
    
    // Calculate bounding box from coordinates with padding
    const lons = coordinates.map(coord => coord[0]);
    const lats = coordinates.map(coord => coord[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    
    // Add 10% padding
    const lonPadding = (maxLon - minLon) * 0.1;
    const latPadding = (maxLat - minLat) * 0.1;
    
    const bbox = [
      minLon - lonPadding,
      minLat - latPadding,
      maxLon + lonPadding,
      maxLat + latPadding
    ];
    
    url += `/[${bbox.join(',')}]`;
    url += `/${width}x${height}`;
    
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN
    });
    
    url += `?${params}`;
    
    res.json({
      success: true,
      image_url: url,
      width,
      height,
      start_coordinates: startCoord,
      end_coordinates: endCoord,
      bounding_box: bbox
    });
  } catch (error) {
    console.error('Route map error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Matrix API
app.post('/get_matrix', async (req, res) => {
  try {
    const { 
      coordinates, 
      profile = 'driving', 
      sources, 
      destinations, 
      annotations = ['duration', 'distance'] 
    } = req.body.arguments || req.body;
    
    const coordinateString = coordinates.map(coord => coord.join(',')).join(';');
    let url = `https://api.mapbox.com/directions-matrix/v1/mapbox/${profile}/${coordinateString}`;
    
    const params = new URLSearchParams({
      access_token: MAPBOX_ACCESS_TOKEN,
      annotations: annotations.join(',')
    });
    
    if (sources) {
      params.append('sources', sources.join(';'));
    }
    
    if (destinations) {
      params.append('destinations', destinations.join(';'));
    }
    
    url += `?${params}`;
    
    const response = await axios.get(url);
    
    res.json({
      success: true,
      durations: response.data.durations,
      distances: response.data.distances,
      sources: response.data.sources,
      destinations: response.data.destinations,
      code: response.data.code
    });
  } catch (error) {
    console.error('Matrix error:', error.message);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Mapbox MCP server running on port ${PORT}`);
  console.log(`Health check available at: http://localhost:${PORT}/health`);
});