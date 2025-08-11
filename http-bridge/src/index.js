import express from 'express';
import axios from 'axios';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      "style-src": ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      "font-src": ["'self'", "https://cdnjs.cloudflare.com"],
      "img-src": ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '..', 'public')));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Store available tools
let availableTools = [];

// Validate environment variables
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable is required');
  process.exit(1);
}

// Initialize by fetching tools from Mapbox MCP server
async function initializeMCPTools() {
  try {
    console.log(`Connecting to MCP server at: ${MCP_SERVER_URL}`);
    const response = await axios.get(`${MCP_SERVER_URL}/tools`, {
      timeout: 10000
    });
    
    availableTools = response.data.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema
    }));
    
    console.log(`Loaded ${availableTools.length} tools from MCP server:`, 
                availableTools.map(t => t.name));
  } catch (error) {
    console.error('Failed to fetch MCP tools:', error.message);
    console.warn('Starting server without MCP tools. Will retry on first request.');
  }
}

// Route to serve the chat interface
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, '..', 'public', 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    mcpToolsLoaded: availableTools.length,
    service: 'mapbox-http-bridge'
  });
});

// Get available tools endpoint
app.get('/api/tools', (req, res) => {
  res.json({ tools: availableTools });
});

app.post('/api/chat', async (req, res) => {
  const { message, conversationHistory = [] } = req.body;
  
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required and must be a string' });
  }

  // Retry loading tools if they're not available
  if (availableTools.length === 0) {
    await initializeMCPTools();
  }
  
  try {
    // Prepare messages for LLM
    const messages = [
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    console.log('Sending request to Claude API...');

    // Call Claude API with tool definitions
    const claudePayload = {
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: messages,
      system: `You are a helpful AI assistant with access to Mapbox mapping and location services. You can help with:
               - Geocoding: Convert addresses to coordinates and vice versa
               - Directions: Get driving, walking, or cycling routes between locations
               - Static Maps: Generate map images with markers and custom styling
               - Route Maps: Generate visual route maps showing start/end points and route paths
               - Matrix: Calculate travel times and distances between multiple points
               
               When users ask to "show" a route or want to "see" directions, first use get_directions to get route details, then use get_route_map with the same coordinates and the polyline from the directions response to create visual maps.
               IMPORTANT: When you use get_route_map or get_static_image tools, always include the image_url from the response in your final answer so users can see the map. Simply include the full URL in your response text.
               Always provide helpful, accurate responses about mapping and location-based queries.
               When using tools, explain what you're doing and interpret the results clearly for the user.
               Image URLs from Mapbox will be automatically displayed as images in the chat interface.`
    };

    // Only add tools if they're available
    if (availableTools.length > 0) {
      claudePayload.tools = availableTools;
      claudePayload.tool_choice = { type: 'auto' };
    }

    const claudeResponse = await axios.post('https://api.anthropic.com/v1/messages', claudePayload, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      timeout: 60000
    });

    let currentMessages = messages;
    let finalResponse = claudeResponse.data;
    let totalUsage = finalResponse.usage;

    // Handle multiple rounds of tool calls
    while (finalResponse.content.some(block => block.type === 'tool_use')) {
      console.log('Processing tool calls...');
      const toolResults = await handleToolCalls(finalResponse.content);
      
      // Add the assistant's response with tool calls and user's tool results
      currentMessages = [
        ...currentMessages,
        { role: 'assistant', content: finalResponse.content },
        { role: 'user', content: toolResults }
      ];

      console.log('Sending follow-up request to Claude API...');

      // Send tool results back to Claude for the next response
      const followUpResponse = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: currentMessages,
        tools: availableTools,
        system: `You are a helpful AI assistant with access to Mapbox mapping and location services. You can help with:
                 - Geocoding: Convert addresses to coordinates and vice versa
                 - Directions: Get driving, walking, or cycling routes between locations
                 - Static Maps: Generate map images with markers and custom styling
                 - Route Maps: Generate visual route maps showing start/end points and route paths
                 - Matrix: Calculate travel times and distances between multiple points
                 
                 When users ask to "show" a route or want to "see" directions, first use get_directions to get route details, then use get_route_map with the same coordinates and the polyline from the directions response to create visual maps.
                 IMPORTANT: When you use get_route_map or get_static_image tools, always include the image_url from the response in your final answer so users can see the map. Simply include the full URL in your response text.
                 Always provide helpful, accurate responses about mapping and location-based queries.
                 When using tools, explain what you're doing and interpret the results clearly for the user.
                 Image URLs from Mapbox will be automatically displayed as images in the chat interface.`
      }, {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        timeout: 60000
      });

      finalResponse = followUpResponse.data;
      
      // Accumulate usage stats
      if (followUpResponse.data.usage) {
        totalUsage.input_tokens += followUpResponse.data.usage.input_tokens || 0;
        totalUsage.output_tokens += followUpResponse.data.usage.output_tokens || 0;
      }
    }

    // Return simplified conversation history for the frontend
    // Only include the user message and final assistant response for conversation continuity
    res.json({
      response: finalResponse.content,
      conversationHistory: [
        ...conversationHistory,
        { role: 'user', content: message },
        { role: 'assistant', content: finalResponse.content }
      ],
      usage: totalUsage
    });

  } catch (error) {
    console.error('Chat error:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      res.status(401).json({ error: 'Invalid API key' });
    } else if (error.response?.status === 429) {
      res.status(429).json({ error: 'Rate limit exceeded' });
    } else {
      res.status(500).json({ error: 'Failed to process chat message' });
    }
  }
});

// Handle tool calls to Mapbox MCP server
async function handleToolCalls(content) {
  const toolResults = [];

  for (const block of content) {
    if (block.type === 'tool_use') {
      console.log(`Calling MCP tool: ${block.name}`);
      console.log(`with arguments: ${JSON.stringify(block.input)}`);
      try {
        // Call Mapbox MCP server
        const mcpResponse = await axios.post(`${MCP_SERVER_URL}/${block.name}`, {
          arguments: block.input
        }, {
          timeout: 15000,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        const response_content = JSON.stringify(mcpResponse.data);
        console.log(`MCP tool response: ${response_content}`);

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(mcpResponse.data)
        });
      } catch (error) {
        console.error(`Tool call error for ${block.name}:`, error.message);
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Error calling tool ${block.name}: ${error.message}`,
          is_error: true
        });
      }
    }
  }

  return toolResults;
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Initialize and start server
async function startServer() {
  await initializeMCPTools();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Mapbox HTTP Bridge server running on port ${PORT}`);
    console.log(`Health check available at: http://localhost:${PORT}/health`);
    console.log(`MCP Server URL: ${MCP_SERVER_URL}`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});