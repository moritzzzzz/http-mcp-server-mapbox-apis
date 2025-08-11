# Mapbox MCP HTTP Server

A complete solution that provides Mapbox API services through a Model Context Protocol (MCP) server with HTTP endpoints, featuring an AI-powered chat interface using Claude Sonnet 4.

## Architecture

The application consists of two main services:

1. **Mapbox MCP Server** (`mapbox-mcp-server/`) - Core service that wraps Mapbox APIs
2. **HTTP Bridge** (`http-bridge/`) - Bridges HTTP requests to the MCP server and provides chat interface

## Features

### Mapbox API Integration
- **Geocoding API**: Forward and reverse geocoding
- **Directions API**: Route planning with multiple profiles (driving, walking, cycling)
- **Static Images API**: Generate custom map images with markers
- **Matrix API**: Calculate travel times and distances between multiple points

### AI Chat Interface
- Claude Sonnet 4 integration for natural language queries
- Real-time chat interface with typing indicators
- Automatic tool selection based on user requests
- Responsive design with Tailwind CSS

## Prerequisites

- Docker and Docker Compose
- Mapbox Access Token ([Get one here](https://account.mapbox.com/access-tokens/))
- Anthropic API Key ([Get one here](https://console.anthropic.com/))

## Quick Start

1. **Clone and setup environment**:
   ```bash
   git clone <your-repo>
   cd mapbox_mcp_http
   cp .env.example .env
   ```

2. **Configure environment variables**:
   Edit `.env` and add your API keys:
   ```env
   MAPBOX_ACCESS_TOKEN=your_mapbox_access_token_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   ```

3. **Start the services**:
   ```bash
   docker-compose up -d
   ```

4. **Access the application**:
   - Chat Interface: http://localhost:3001
   - HTTP Bridge Health: http://localhost:3001/health
   - MCP Server Health: http://localhost:3000/health

## API Endpoints

### Mapbox MCP Server (Port 3000)

#### GET `/tools`
Get list of available MCP tools

#### POST `/geocode_forward`
Convert address to coordinates
```json
{
  "arguments": {
    "query": "Times Square, New York",
    "limit": 5,
    "country": "us"
  }
}
```

#### POST `/geocode_reverse`
Convert coordinates to address
```json
{
  "arguments": {
    "longitude": -73.985,
    "latitude": 40.758
  }
}
```

#### POST `/get_directions`
Get directions between waypoints
```json
{
  "arguments": {
    "coordinates": [[-73.985, 40.758], [-74.006, 40.712]],
    "profile": "driving",
    "steps": true
  }
}
```

#### POST `/get_static_image`
Generate static map image
```json
{
  "arguments": {
    "center": [-73.985, 40.758],
    "zoom": 12,
    "width": 600,
    "height": 400,
    "markers": [{"longitude": -73.985, "latitude": 40.758, "color": "red"}]
  }
}
```

#### POST `/get_matrix`
Calculate travel matrix
```json
{
  "arguments": {
    "coordinates": [[-73.985, 40.758], [-74.006, 40.712], [-73.968, 40.785]],
    "profile": "driving"
  }
}
```

### HTTP Bridge (Port 3001)

#### GET `/`
Chat interface

#### POST `/api/chat`
Send message to AI assistant
```json
{
  "message": "Find the coordinates for Times Square",
  "conversationHistory": []
}
```

#### GET `/api/tools`
Get available tools from MCP server

## Development

### Running without Docker

1. **Start MCP Server**:
   ```bash
   cd mapbox-mcp-server
   npm install
   MAPBOX_ACCESS_TOKEN=your_token npm start
   ```

2. **Start HTTP Bridge**:
   ```bash
   cd http-bridge
   npm install
   ANTHROPIC_API_KEY=your_key MCP_SERVER_URL=http://localhost:3000 npm start
   ```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MAPBOX_ACCESS_TOKEN` | Yes | - | Mapbox API access token |
| `ANTHROPIC_API_KEY` | Yes | - | Anthropic API key for Claude |
| `CORS_ORIGIN` | No | `*` | CORS origin setting |
| `MCP_SERVER_URL` | No | `http://localhost:3000` | MCP server URL for HTTP bridge |

## Usage Examples

### Chat Interface Examples

1. **Geocoding**: "What are the coordinates for the Eiffel Tower?"
2. **Directions**: "Get driving directions from Paris to Lyon"
3. **Static Maps**: "Generate a map image of downtown San Francisco with a marker"
4. **Matrix**: "Calculate travel times between New York, Boston, and Philadelphia"

### Direct API Usage

```bash
# Geocode an address
curl -X POST http://localhost:3000/geocode_forward \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"query": "Empire State Building"}}'

# Get directions
curl -X POST http://localhost:3000/get_directions \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"coordinates": [[-73.985, 40.758], [-74.006, 40.712]], "profile": "walking"}}'
```

## Docker Services

### Health Checks
Both services include health checks that verify:
- Service is responding
- Required environment variables are set
- Dependencies are accessible

### Networking
Services communicate through a Docker network (`mapbox-network`) with proper service discovery.

### Volumes and Persistence
No persistent volumes are required as this is a stateless application.

## Security Considerations

- API keys are passed as environment variables
- Rate limiting is implemented on both services
- Helmet.js provides security headers
- CORS is configurable
- Services run as non-root users in containers

## Troubleshooting

### Common Issues

1. **MCP Server not starting**: Check `MAPBOX_ACCESS_TOKEN` is set correctly
2. **HTTP Bridge can't connect**: Ensure MCP server is healthy before bridge starts
3. **Chat not working**: Verify `ANTHROPIC_API_KEY` is valid
4. **Rate limiting**: Default limits are 100 requests per 15 minutes per IP

### Logs
```bash
# View all logs
docker-compose logs

# View specific service logs
docker-compose logs mapbox-mcp-server
docker-compose logs http-bridge

# Follow logs
docker-compose logs -f
```

### Health Checks
```bash
# Check service health
curl http://localhost:3000/health
curl http://localhost:3001/health
```

## License

This project is provided as-is for educational and development purposes. Make sure to comply with Mapbox and Anthropic API terms of service.