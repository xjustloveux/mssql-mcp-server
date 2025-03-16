// Import required dependencies
import dotenv from 'dotenv';
import express from 'express';
import bodyParser from 'body-parser';
import sql from 'mssql';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import util from 'util';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSqlClient } from './mssql-client.mjs';
import fs from 'fs';
import crypto from 'crypto';

// Load environment variables
dotenv.config();

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app to handle HTTP requests for SSE transport
const app = express();
const httpServer = http.createServer(app);
app.use(bodyParser.json());

// Add CORS headers to all responses
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Handle OPTIONS requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Add basic request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Add HTTP server status endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'ok',
        message: 'MCP Server is running',
        transport: process.env.TRANSPORT || 'stdio',
        endpoints: {
            sse: '/sse',
            messages: '/messages',
            query_results: {
                list: '/query-results',
                detail: '/query-results/:uuid'
            }
        },
        sql_server_discovery: {
            tables: "SELECT TOP 100 TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'",
            views: "SELECT TOP 50 TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS",
            procedures: "SELECT TOP 50 ROUTINE_SCHEMA, ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE'",
            functions: "SELECT TOP 50 ROUTINE_SCHEMA, ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'FUNCTION'",
            best_practice: "Always start discovery with the above commands before querying specific tables"
        },
        table_discovery_guide: {
            step1: "ALWAYS start by discovering available tables with 'mcp__discover_tables()' or 'mcp__execute_query({ sql: \"SELECT TOP 100 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'\" })'",
            step2: "NEVER query a table without first checking it exists",
            step3: "Once you have a table name, check its structure with 'mcp__table_details({ tableName: \"your_table_name\" })'",
            step4: "Finally, query with 'mcp__execute_query({ sql: \"SELECT top 1000* FROM [your_table_name]\" })'",
            recommended_resource: "Use 'mcp__discover_database()' for a complete overview of all database objects"
        },
        query_results_info: {
            path: process.env.QUERY_RESULTS_PATH || path.join(__dirname, 'query_results'),
            list_endpoint: "/query-results - Lists all saved query results",
            detail_endpoint: "/query-results/:uuid - Gets a specific query result by UUID",
            result_format: "JSON files include metadata (timestamp, query, rowCount) and the actual results",
            important_notes: "To prevent conversation overload, query results are saved to files by default and only metadata is returned. Use 'returnResults: true' parameter to see result previews directly.",
            example_usage: "mcp__execute_query({ sql: \"SELECT top 1000* FROM table_name\", returnResults: true })"
        },
        database_info: {
            server: dbConfig.server,
            database: dbConfig.database,
            user: dbConfig.user
        }
    });
});

// Database configuration
const dbConfig = {
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || 'YourStrong@Passw0rd',
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'master',
    port: parseInt(process.env.DB_PORT) || 1433, // Add the port from env with fallback to default
    options: {
        encrypt: true, // For Azure
        trustServerCertificate: true // Change to false in production
    }
};

// Log database configuration (without password)
console.log('📊 Database configuration:');
console.log(`   Server: ${dbConfig.server}`);
console.log(`   Database: ${dbConfig.database}`);
console.log(`   User: ${dbConfig.user}`);

// Create SQL client
const sqlClient = createSqlClient(dbConfig);

// Create MCP server instance
const server = new McpServer({
    name: "MSSQL-MCP-Server",
    version: "1.0.0",
    capabilities: {
        resources: {
            listChanged: true
        },
        tools: {
            listChanged: true
        },
        prompts: {
            listChanged: true
        }
    }
});

// Set up HTTP routes (used only for SSE transport)
let currentTransport = null;
let activeConnections = new Set();

// SSE endpoint for client to connect
app.get('/sse', async (req, res) => {
    console.log('📡 New SSE connection request received');
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    try {
        // Create new SSE transport for this connection
        const messagesEndpoint = `/messages`;
        console.log(`🔗 Creating SSE transport with messages endpoint: ${messagesEndpoint}`);
        
        // Create the transport with a custom message formatter to debug SSE events
        const originalWrite = res.write;
        res.write = function(data) {
            console.log(`📤 SSE Transport sending data: ${data.toString()}`);
            return originalWrite.apply(this, arguments);
        };
        
        // Create a wrapper around the SSEServerTransport.send method to debug responses
        const originalSSETransport = SSEServerTransport;
        
        // Create and wrap the transport to add debugging
        currentTransport = new SSEServerTransport(messagesEndpoint, res);
        
        // Wrap the send method to debug what's going out
        const originalSend = currentTransport.send;
        currentTransport.send = function(...args) {
            console.log('🔍 SSEServerTransport.send called with args:', JSON.stringify(args, null, 2));
            return originalSend.apply(this, args);
        };
        
        // Connect the server to this transport
        await server.connect(currentTransport);
        
        console.log('✅ SSE transport connected successfully');
        
        // Add this connection to tracking
        activeConnections.add(res);
        console.log(`📊 Active SSE connections: ${activeConnections.size}`);
        
        // Send a welcome message with discovery commands
        setTimeout(async () => {
            try {
                // Get some sample tables to help with discovery
                const tablesResult = await executeSql(`
                    SELECT top 1000
                        TABLE_NAME 
                    FROM 
                        INFORMATION_SCHEMA.TABLES 
                    WHERE 
                        TABLE_TYPE = 'BASE TABLE' 
                    ORDER BY 
                        TABLE_NAME
                `);
                
                const sampleTable = tablesResult.recordset.length > 0 ? tablesResult.recordset[0].TABLE_NAME : "example_table";
                
                // Create welcome notification in accordance with JSON-RPC 2.0
                const welcomeMessage = {
                    jsonrpc: "2.0",
                    method: "notification",
                    params: {
                        type: "info",
                        message: `# Welcome to MSSQL MCP Server! 🚀\n\n`+
                        `## SQL Server Discovery Commands\n\n`+
                        `To explore the database, use these commands first:\n\n`+
                        `1. **Discover all database objects**:\n`+
                        `\`\`\`javascript\n`+
                        `mcp__discover_database()\n`+
                        `\`\`\`\n\n`+
                        `2. **List tables only**:\n`+
                        `\`\`\`javascript\n`+
                        `mcp__execute_query({ sql: "SELECT TOP 100 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'" })\n`+
                        `\`\`\`\n\n`+
                        `3. **Get table details**:\n`+
                        `\`\`\`javascript\n`+
                        `mcp__table_details({ tableName: "${sampleTable}" })\n`+
                        `\`\`\`\n\n`+
                        `4. **Execute a safe query**:\n`+
                        `\`\`\`javascript\n`+
                        `mcp__execute_query({ sql: "SELECT top 1000* FROM ${sampleTable}" })\n`+
                        `\`\`\`\n\n`+
                        `⚠️ **IMPORTANT**:\n`+
                        `- Always discover tables first before querying!\n`+
                        `- Query results are saved to files by default to avoid overloading the conversation\n`+
                        `- To view results directly (small queries only), use: \`returnResults: true\` parameter\n`+
                        `- Example: \`mcp__execute_query({ sql: "SELECT top 1000* FROM ${sampleTable}", returnResults: true })\``
                    }
                };
                
                // Send the welcome message
                console.log('📤 Sending welcome message with discovery commands');
                currentTransport.send(welcomeMessage);
            } catch (err) {
                console.error('❌ Error sending welcome message:', err);
            }
        }, 1000); // Short delay to ensure transport is fully established
        
        // Handle client disconnect
        req.on('close', () => {
            console.log('📴 SSE client disconnected');
            activeConnections.delete(res);
            currentTransport = null;
            console.log(`📊 Active SSE connections: ${activeConnections.size}`);
        });
    } catch (error) {
        console.error(`❌ Failed to set up SSE transport: ${error.message}`);
        console.error(error.stack);
        res.status(500).end(`Error: ${error.message}`);
    }
});

// Messages endpoint for client to send messages
app.post('/messages', (req, res) => {
    console.log('📩 Received message from client');
    console.log('Headers:', JSON.stringify(req.headers));
    console.log('Body:', JSON.stringify(req.body));
    console.log('Query params:', JSON.stringify(req.query));
    
    if (!currentTransport) {
        console.error('❌ No SSE transport available to process message');
        return res.status(500).json({ error: 'Server transport not initialized' });
    }
    
    try {
        // Extract the request ID for better debugging
        const requestId = req.body.id;
        console.log(`🔄 Processing message with ID: ${requestId}`);
        
        // Log the request method for debugging
        const method = req.body.method;
        console.log(`🔄 Request method: ${method}`);
        
        // Special handling for resources/read
        if (method === 'resources/read') {
            if (req.body.params === 'tables://list') {
                // Existing tables handler
                console.log('🔍 Directly handling tables list request');
                
                // Get the list of tables from the database
                try {
                    // This is the same logic as in the resource handler
                    executeSql(`
                        SELECT 
                            TABLE_NAME,
                            TABLE_TYPE
                        FROM 
                            INFORMATION_SCHEMA.TABLES
                        ORDER BY 
                            TABLE_NAME
                    `).then(result => {
                        const tableList = result.recordset.map(t => t.TABLE_NAME).join('\n');
                        console.log(`✅ Retrieved ${result.recordset.length} tables`);
                        
                        // Format response according to MCP protocol
                        const resourceResponse = {
                            contents: [{
                                uri: 'tables://list',
                                text: `# Database Tables\n\n${tableList}`
                            }]
                        };
                        
                        // Create a JSON-RPC 2.0 response
                        const jsonRpcResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            result: resourceResponse
                        };
                        
                        console.log('📤 Sending JSON-RPC response:', JSON.stringify(jsonRpcResponse, null, 2));
                        
                        // Send the response with the SSE transport
                        currentTransport.send(jsonRpcResponse);
                        
                        // Return successful response to the HTTP request
                        res.status(200).json({ success: true });
                    }).catch(err => {
                        console.error(`❌ Error retrieving tables: ${err.message}`);
                        
                        // Create a proper JSON-RPC error response
                        const errorResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            error: {
                                code: -32603,
                                message: `Internal error: ${err.message}`
                            }
                        };
                        
                        currentTransport.send(errorResponse);
                        res.status(200).json({ success: true });
                    });
                    
                    return; // Exit early as we're handling the response asynchronously
                } catch (err) {
                    console.error(`❌ Error in direct handling: ${err.message}`);
                    throw err; // Let the regular error handling take over
                }
            } else if (req.body.params === 'procedures://list') {
                // Custom handling for procedures list
                console.log('🔍 Directly handling stored procedures list request');
                
                try {
                    executeSql(`
                        SELECT 
                            ROUTINE_NAME
                        FROM 
                            INFORMATION_SCHEMA.ROUTINES
                        WHERE 
                            ROUTINE_TYPE = 'PROCEDURE'
                        ORDER BY 
                            ROUTINE_NAME
                    `).then(result => {
                        const procList = result.recordset.map(p => p.ROUTINE_NAME).join('\n');
                        console.log(`✅ Retrieved ${result.recordset.length} stored procedures`);
                        
                        // Format response according to MCP protocol
                        const resourceResponse = {
                            contents: [{
                                uri: 'procedures://list',
                                text: `# Database Stored Procedures\n\n${procList}`
                            }]
                        };
                        
                        // Create a JSON-RPC 2.0 response
                        const jsonRpcResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            result: resourceResponse
                        };
                        
                        console.log('📤 Sending JSON-RPC response for procedures list');
                        
                        // Send the response with the SSE transport
                        currentTransport.send(jsonRpcResponse);
                        
                        // Return successful response to the HTTP request
                        res.status(200).json({ success: true });
                    }).catch(err => {
                        console.error(`❌ Error retrieving procedures: ${err.message}`);
                        
                        // Create a proper JSON-RPC error response
                        const errorResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            error: {
                                code: -32603,
                                message: `Internal error: ${err.message}`
                            }
                        };
                        
                        currentTransport.send(errorResponse);
                        res.status(200).json({ success: true });
                    });
                    
                    return; // Exit early as we're handling the response asynchronously
                } catch (err) {
                    console.error(`❌ Error in direct handling: ${err.message}`);
                    throw err;
                }
            } else if (req.body.params === 'functions://list') {
                // Custom handling for functions list
                console.log('🔍 Directly handling functions list request');
                
                try {
                    executeSql(`
                        SELECT 
                            ROUTINE_NAME
                        FROM 
                            INFORMATION_SCHEMA.ROUTINES
                        WHERE 
                            ROUTINE_TYPE = 'FUNCTION'
                        ORDER BY 
                            ROUTINE_NAME
                    `).then(result => {
                        const funcList = result.recordset.map(f => f.ROUTINE_NAME).join('\n');
                        console.log(`✅ Retrieved ${result.recordset.length} functions`);
                        
                        // Format response according to MCP protocol
                        const resourceResponse = {
                            contents: [{
                                uri: 'functions://list',
                                text: `# Database Functions\n\n${funcList}`
                            }]
                        };
                        
                        // Create a JSON-RPC 2.0 response
                        const jsonRpcResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            result: resourceResponse
                        };
                        
                        console.log('📤 Sending JSON-RPC response for functions list');
                        
                        // Send the response with the SSE transport
                        currentTransport.send(jsonRpcResponse);
                        
                        // Return successful response to the HTTP request
                        res.status(200).json({ success: true });
                    }).catch(err => {
                        console.error(`❌ Error retrieving functions: ${err.message}`);
                        
                        // Create a proper JSON-RPC error response
                        const errorResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            error: {
                                code: -32603,
                                message: `Internal error: ${err.message}`
                            }
                        };
                        
                        currentTransport.send(errorResponse);
                        res.status(200).json({ success: true });
                    });
                    
                    return; // Exit early as we're handling the response asynchronously
                } catch (err) {
                    console.error(`❌ Error in direct handling: ${err.message}`);
                    throw err;
                }
            } else if (req.body.params === 'views://list') {
                // Custom handling for views list
                console.log('🔍 Directly handling views list request');
                
                try {
                    executeSql(`
                        SELECT 
                            TABLE_NAME
                        FROM 
                            INFORMATION_SCHEMA.VIEWS
                        ORDER BY 
                            TABLE_NAME
                    `).then(result => {
                        const viewList = result.recordset.map(v => v.TABLE_NAME).join('\n');
                        console.log(`✅ Retrieved ${result.recordset.length} views`);
                        
                        // Format response according to MCP protocol
                        const resourceResponse = {
                            contents: [{
                                uri: 'views://list',
                                text: `# Database Views\n\n${viewList}`
                            }]
                        };
                        
                        // Create a JSON-RPC 2.0 response
                        const jsonRpcResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            result: resourceResponse
                        };
                        
                        console.log('📤 Sending JSON-RPC response for views list');
                        
                        // Send the response with the SSE transport
                        currentTransport.send(jsonRpcResponse);
                        
                        // Return successful response to the HTTP request
                        res.status(200).json({ success: true });
                    }).catch(err => {
                        console.error(`❌ Error retrieving views: ${err.message}`);
                        
                        // Create a proper JSON-RPC error response
                        const errorResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            error: {
                                code: -32603,
                                message: `Internal error: ${err.message}`
                            }
                        };
                        
                        currentTransport.send(errorResponse);
                        res.status(200).json({ success: true });
                    });
                    
                    return; // Exit early as we're handling the response asynchronously
                } catch (err) {
                    console.error(`❌ Error in direct handling: ${err.message}`);
                    throw err;
                }
            } else if (req.body.params === 'indexes://list') {
                // Custom handling for indexes list
                console.log('🔍 Directly handling indexes list request');
                
                try {
                    executeSql(`
                        SELECT 
                            t.name AS TableName,
                            i.name AS IndexName,
                            i.type_desc AS IndexType
                        FROM 
                            sys.indexes i
                        INNER JOIN 
                            sys.tables t ON i.object_id = t.object_id
                        WHERE 
                            i.name IS NOT NULL
                        ORDER BY 
                            t.name, i.name
                    `).then(result => {
                        // Format as markdown table
                        let indexList = "| Table | Index | Type |\n|-------|-------|------|\n";
                        result.recordset.forEach(idx => {
                            indexList += `| ${idx.TableName} | ${idx.IndexName} | ${idx.IndexType} |\n`;
                        });
                        
                        console.log(`✅ Retrieved ${result.recordset.length} indexes`);
                        
                        // Format response according to MCP protocol
                        const resourceResponse = {
                            contents: [{
                                uri: 'indexes://list',
                                text: `# Database Indexes\n\n${indexList}`
                            }]
                        };
                        
                        // Create a JSON-RPC 2.0 response
                        const jsonRpcResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            result: resourceResponse
                        };
                        
                        console.log('📤 Sending JSON-RPC response for indexes list');
                        
                        // Send the response with the SSE transport
                        currentTransport.send(jsonRpcResponse);
                        
                        // Return successful response to the HTTP request
                        res.status(200).json({ success: true });
                    }).catch(err => {
                        console.error(`❌ Error retrieving indexes: ${err.message}`);
                        
                        // Create a proper JSON-RPC error response
                        const errorResponse = {
                            jsonrpc: "2.0",
                            id: requestId,
                            error: {
                                code: -32603,
                                message: `Internal error: ${err.message}`
                            }
                        };
                        
                        currentTransport.send(errorResponse);
                        res.status(200).json({ success: true });
                    });
                    
                    return; // Exit early as we're handling the response asynchronously
                } catch (err) {
                    console.error(`❌ Error in direct handling: ${err.message}`);
                    throw err;
                }
            }
        }
        
        // For all other methods, use the standard handler
        try {
            currentTransport.handlePostMessage(req, res, req.body);
            console.log(`✅ Message processed successfully for request ID: ${requestId}`);
        } catch (serializationError) {
            console.error('❌ Error in message serialization:', serializationError);
            // Properly format error according to JSON-RPC 2.0 spec
            if (req.body.id) {
                return res.status(400).json({
                    jsonrpc: "2.0",
                    id: req.body.id,
                    error: {
                        code: -32700,
                        message: "Parse error: " + serializationError.message
                    }
                });
            } else {
                return res.status(400).json({
                    error: 'Message serialization error: ' + serializationError.message
                });
            }
        }
    } catch (error) {
        console.error('❌ Error processing message:', error);
        console.error(error.stack);
        
        // Properly format error according to JSON-RPC 2.0 spec
        if (req.body.id) {
            return res.status(500).json({
                jsonrpc: "2.0",
                id: req.body.id,
                error: {
                    code: -32603,
                    message: "Internal server error: " + error.message
                }
            });
        } else {
            return res.status(500).json({ error: 'Failed to process message' });
        }
    }
});

// Helper function to get a DB connection
async function getDbConnection() {
    try {
        console.log('🔌 Connecting to database...');
        const pool = await sql.connect(dbConfig);
        console.log('✅ Connected to database');
        return pool;
    } catch (err) {
        console.error('❌ Database connection failed:', err);
        console.error(err.stack);
        throw err;
    }
}

// Helper to safely execute SQL
async function executeSql(sqlQuery) {
    console.log(`🔍 Executing SQL: ${sqlQuery.substring(0, 100)}${sqlQuery.length > 100 ? '...' : ''}`);
    const pool = await getDbConnection();
    try {
        const result = await pool.request().query(sqlQuery);
        console.log(`✅ SQL executed successfully, returned ${result.recordset ? result.recordset.length : 0} rows`);
        return result;
    } catch (err) {
        console.error(`❌ SQL execution failed: ${err.message}`);
        console.error(err.stack);
        throw err;
    } finally {
        console.log('🔌 Closing database connection');
        await pool.close();
    }
}

// Format schema data into human-readable text
function formatSchemaData(records) {
    const tables = {};
    
    // Group columns by table
    records.forEach(record => {
        if (!tables[record.TABLE_NAME]) {
            tables[record.TABLE_NAME] = [];
        }
        
        tables[record.TABLE_NAME].push({
            name: record.COLUMN_NAME,
            type: record.DATA_TYPE,
            nullable: record.IS_NULLABLE === 'YES'
        });
    });
    
    // Format as text
    let output = '# Database Schema\n\n';
    
    for (const [tableName, columns] of Object.entries(tables)) {
        output += `## Table: ${tableName}\n\n`;
        output += '| Column | Type | Nullable |\n';
        output += '|--------|------|----------|\n';
        
        columns.forEach(col => {
            output += `| ${col.name} | ${col.type} | ${col.nullable ? 'Yes' : 'No'} |\n`;
        });
        
        output += '\n';
    }
    
    return output;
}

// Enhance tool logging
const originalTool = server.tool.bind(server);
server.tool = function(name, schema, handler) {
    const wrappedHandler = async function(...args) {
        console.log(`🔧 Executing tool: ${name}`);
        console.log(`   Parameters: ${JSON.stringify(args[0])}`);
        try {
            const result = await handler(...args);
            console.log(`✅ Tool ${name} completed successfully`);
            return result;
        } catch (err) {
            console.error(`❌ Tool ${name} failed:`, err);
            console.error(err.stack);
            throw err;
        }
    };
    
    return originalTool(name, schema, wrappedHandler);
};

// Enhance resource logging
const originalResource = server.resource.bind(server);
server.resource = function(name, uriPattern, handler) {
    const wrappedHandler = async function(...args) {
        console.log(`📚 Reading resource: ${name}`);
        console.log(`   URI: ${args[0]?.href}`);
        try {
            const result = await handler(...args);
            console.log(`✅ Resource ${name} read successfully`);
            return result;
        } catch (err) {
            console.error(`❌ Resource ${name} read failed:`, err);
            console.error(err.stack);
            throw err;
        }
    };
    
    return originalResource(name, uriPattern, wrappedHandler);
};

// Define resources after we've enhanced the resource function
// RESOURCE: Database Schema
server.resource(
    "schema",
    "schema://database",
    async (uri) => {
        try {
            console.log('🔍 Fetching database schema...');
            const result = await executeSql(`
                SELECT 
                    TABLE_NAME,
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE
                FROM 
                    INFORMATION_SCHEMA.COLUMNS
                ORDER BY 
                    TABLE_NAME, ORDINAL_POSITION
            `);
            
            const formattedSchema = formatSchemaData(result.recordset);
            console.log('✅ Schema retrieved successfully');
            
            return {
                contents: [{
                    uri: uri.href,
                    text: formattedSchema
                }]
            };
        } catch (err) {
            console.error(`❌ Error retrieving schema: ${err.message}`);
            return {
                contents: [{
                    uri: uri.href,
                    text: `Error retrieving schema: ${err.message}`
                }]
            };
        }
    }
);

// RESOURCE: List Tables
server.resource(
    "tables",
    "tables://list",
    async (uri) => {
        try {
            console.log('🔍 Fetching tables list...');
            const result = await executeSql(`
                SELECT 
                    TABLE_NAME,
                    TABLE_TYPE
                FROM 
                    INFORMATION_SCHEMA.TABLES
                ORDER BY 
                    TABLE_NAME
            `);
            
            const tableList = result.recordset.map(t => t.TABLE_NAME).join('\n');
            console.log(`✅ Retrieved ${result.recordset.length} tables`);
            
            // Create a proper response according to MCP spec
            const response = {
                contents: [{
                    uri: uri.href,
                    text: `# Database Tables\n\n${tableList}`
                }]
            };
            
            // Debug the exact response to see what might be causing serialization issues
            console.log('📤 Response object structure:', JSON.stringify(response, null, 2));
            console.log('📤 Response object type:', typeof response);
            
            // Return the response - the McpServer will format this into a proper JSON-RPC response
            return response;
        } catch (err) {
            console.error(`❌ Error retrieving tables: ${err.message}`);
            
            // Create a proper error response according to MCP spec
            const errorResponse = {
                contents: [{
                    uri: uri.href,
                    text: `Error retrieving tables: ${err.message}`
                }]
            };
            
            return errorResponse;
        }
    }
);

// RESOURCE: List Stored Procedures
server.resource(
    "procedures",
    "procedures://list",
    async (uri) => {
        try {
            console.log('🔍 Fetching stored procedures list...');
            const result = await executeSql(`
                SELECT 
                    ROUTINE_NAME
                FROM 
                    INFORMATION_SCHEMA.ROUTINES
                WHERE 
                    ROUTINE_TYPE = 'PROCEDURE'
                ORDER BY 
                    ROUTINE_NAME
            `);
            
            const procList = result.recordset.map(p => p.ROUTINE_NAME).join('\n');
            console.log(`✅ Retrieved ${result.recordset.length} stored procedures`);
            
            return {
                contents: [{
                    uri: uri.href,
                    text: `# Database Stored Procedures\n\n${procList}`
                }]
            };
        } catch (err) {
            console.error(`❌ Error retrieving stored procedures: ${err.message}`);
            return {
                contents: [{
                    uri: uri.href,
                    text: `Error retrieving stored procedures: ${err.message}`
                }]
            };
        }
    }
);

// RESOURCE: List Functions
server.resource(
    "functions",
    "functions://list",
    async (uri) => {
        try {
            console.log('🔍 Fetching functions list...');
            const result = await executeSql(`
                SELECT 
                    ROUTINE_NAME
                FROM 
                    INFORMATION_SCHEMA.ROUTINES
                WHERE 
                    ROUTINE_TYPE = 'FUNCTION'
                ORDER BY 
                    ROUTINE_NAME
            `);
            
            const funcList = result.recordset.map(f => f.ROUTINE_NAME).join('\n');
            console.log(`✅ Retrieved ${result.recordset.length} functions`);
            
            return {
                contents: [{
                    uri: uri.href,
                    text: `# Database Functions\n\n${funcList}`
                }]
            };
        } catch (err) {
            console.error(`❌ Error retrieving functions: ${err.message}`);
            return {
                contents: [{
                    uri: uri.href,
                    text: `Error retrieving functions: ${err.message}`
                }]
            };
        }
    }
);

// RESOURCE: List Views
server.resource(
    "views",
    "views://list",
    async (uri) => {
        try {
            console.log('🔍 Fetching views list...');
            const result = await executeSql(`
                SELECT 
                    TABLE_NAME
                FROM 
                    INFORMATION_SCHEMA.VIEWS
                ORDER BY 
                    TABLE_NAME
            `);
            
            const viewList = result.recordset.map(v => v.TABLE_NAME).join('\n');
            console.log(`✅ Retrieved ${result.recordset.length} views`);
            
            return {
                contents: [{
                    uri: uri.href,
                    text: `# Database Views\n\n${viewList}`
                }]
            };
        } catch (err) {
            console.error(`❌ Error retrieving views: ${err.message}`);
            return {
                contents: [{
                    uri: uri.href,
                    text: `Error retrieving views: ${err.message}`
                }]
            };
        }
    }
);

// RESOURCE: List Indexes
server.resource(
    "indexes",
    "indexes://list",
    async (uri) => {
        try {
            console.log('🔍 Fetching indexes list...');
            const result = await executeSql(`
                SELECT 
                    t.name AS TableName,
                    i.name AS IndexName,
                    i.type_desc AS IndexType
                FROM 
                    sys.indexes i
                INNER JOIN 
                    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                INNER JOIN 
                    sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                INNER JOIN 
                    sys.tables t ON i.object_id = t.object_id
                WHERE 
                    t.name = '${tableName}' AND
                    i.name = '${indexName}'
                ORDER BY 
                    ic.key_ordinal
            `);
            
            if (result.recordset.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Index '${indexName}' on table '${tableName}' not found.`
                    }],
                    isError: true
                };
            }
            
            let markdown = `# Index: ${indexName}\n\n`;
            markdown += `**Table**: ${tableName}\n\n`;
            markdown += `**Type**: ${result.recordset[0].IndexType}\n\n`;
            markdown += `**Unique**: ${result.recordset[0].IsUnique ? 'Yes' : 'No'}\n\n`;
            markdown += `**Primary Key**: ${result.recordset[0].IsPrimaryKey ? 'Yes' : 'No'}\n\n`;
            
            markdown += '## Columns\n\n';
            markdown += '| Column |\n';
            markdown += '|--------|\n';
            
            result.recordset.forEach(idx => {
                markdown += `| ${idx.ColumnName} |\n`;
            });
            
            return {
                content: [{
                    type: "text",
                    text: markdown
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting index details: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// RESOURCE: Database Schema for AI Assistants
server.resource(
    "ai-schema",
    "ai-schema://database",
    async (uri) => {
        try {
            console.log('🤖 Generating AI-friendly database schema...');
            
            // Get tables
            const tablesResult = await executeSql(`
                SELECT 
                    TABLE_NAME
                FROM 
                    INFORMATION_SCHEMA.TABLES
                WHERE
                    TABLE_TYPE = 'BASE TABLE'
                ORDER BY 
                    TABLE_NAME
            `);
            
            // Generate a comprehensive schema description for AI
            let aiSchemaText = '# AI Assistant Database Guide\n\n';
            aiSchemaText += 'This is a guide for AI assistants to interact with this SQL Server database.\n\n';
            
            // Add tables section
            aiSchemaText += '## Available Tables\n\n';
            aiSchemaText += 'When querying the database, use these table names:\n\n';
            aiSchemaText += '```\n';
            for (const table of tablesResult.recordset) {
                aiSchemaText += `${table.TABLE_NAME}\n`;
            }
            aiSchemaText += '```\n\n';
            
            // Add usage examples
            aiSchemaText += '## Usage Examples\n\n';
            aiSchemaText += '### Listing Tables\n';
            aiSchemaText += 'To list tables, use the `tables://list` resource:\n';
            aiSchemaText += '```json\n{"method":"resources/read","params":"tables://list"}\n```\n\n';
            
            aiSchemaText += '### Executing Queries\n';
            aiSchemaText += 'To execute a SQL query, use the `execute-query` tool:\n';
            aiSchemaText += '```json\n';
            aiSchemaText += '{"method":"tools/call","params":{"name":"execute-query","arguments":{"sql":"SELECT top 1000* FROM [table_name]"}}}\n';
            aiSchemaText += '```\n\n';
            
            aiSchemaText += '### Getting Table Details\n';
            aiSchemaText += 'To get details about a specific table, use the `table-details` tool:\n';
            aiSchemaText += '```json\n';
            aiSchemaText += '{"method":"tools/call","params":{"name":"table-details","arguments":{"tableName":"[table_name]"}}}\n';
            aiSchemaText += '```\n\n';
            
            aiSchemaText += '## Best Practices for AI Assistants\n\n';
            aiSchemaText += '1. Always check table existence before querying\n';
            aiSchemaText += '2. Use `SELECT TOP N` for safety when exploring large tables\n';
            aiSchemaText += '3. Explore table schema with `table-details` before constructing complex queries\n';
            
            console.log('✅ AI-friendly schema generated');
            
            return {
                contents: [{
                    uri: uri.href,
                    text: aiSchemaText
                }]
            };
        } catch (err) {
            console.error(`❌ Error generating AI schema: ${err.message}`);
            return {
                contents: [{
                    uri: uri.href,
                    text: `Error generating AI schema: ${err.message}`
                }]
            };
        }
    }
);

// RESOURCE: Table Discovery Guide for Cursor
server.resource(
    "discovery",
    "discovery://tables",
    async (uri) => {
        try {
            console.log('📋 Generating table discovery guide for Cursor...');
            
            // Get tables with sample data for better understanding
            const tablesResult = await executeSql(`
                SELECT 
                    TABLE_NAME,
                    TABLE_TYPE
                FROM 
                    INFORMATION_SCHEMA.TABLES
                WHERE
                    TABLE_TYPE = 'BASE TABLE'
                ORDER BY 
                    TABLE_NAME
            `);
            
            // Get a sample of common tables with row counts for context
            const sampleTablesWithRowCounts = [];
            
            // Get row counts for the first 5 tables (limited to avoid performance issues)
            for (let i = 0; i < Math.min(5, tablesResult.recordset.length); i++) {
                const tableName = tablesResult.recordset[i].TABLE_NAME;
                try {
                    const countResult = await executeSql(`SELECT COUNT(*) AS RowCount FROM [${tableName}]`);
                    const rowCount = countResult.recordset[0].RowCount;
                    sampleTablesWithRowCounts.push({ name: tableName, rowCount });
                } catch (err) {
                    console.error(`Error getting row count for ${tableName}: ${err.message}`);
                    sampleTablesWithRowCounts.push({ name: tableName, rowCount: "Unknown" });
                }
            }
            
            // Generate a comprehensive table discovery guide
            let discoveryText = '# Table Discovery Guide for Cursor\n\n';
            discoveryText += 'This guide will help you discover and explore tables in this SQL Server database.\n\n';
            
            // Step 1: List all tables
            discoveryText += '## Step 1: List All Tables\n\n';
            discoveryText += 'To get a complete list of all tables in the database, use this command:\n\n';
            discoveryText += '```javascript\n';
            discoveryText += 'mcp__execute_query({ sql: "SELECT TOP 100 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = \'BASE TABLE\' ORDER BY TABLE_NAME" })\n';
            discoveryText += '```\n\n';
            
            // Step 2: Explore table structure
            discoveryText += '## Step 2: Explore Table Structure\n\n';
            discoveryText += 'Once you have table names, explore their structure using either table-details or SQL:\n\n';
            discoveryText += '```javascript\n';
            discoveryText += '// Option 1: Using the dedicated tool\n';
            discoveryText += `mcp__table_details({ tableName: "example_table_name" })\n\n`;
            discoveryText += '// Option 2: Using SQL query\n';
            discoveryText += 'mcp__execute_query({ sql: "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = \'example_table_name\' ORDER BY ORDINAL_POSITION" })\n';
            discoveryText += '```\n\n';
            
            // Step 3: Query with example
            discoveryText += '## Step 3: Execute Safe Queries\n\n';
            discoveryText += 'After discovering tables and their structure, execute queries with TOP clause for safety:\n\n';
            discoveryText += '```javascript\n';
            discoveryText += `// Example query for a sample table\n`;
            if (sampleTablesWithRowCounts.length > 0) {
                discoveryText += `mcp__execute_query({ sql: "SELECT top 1000* FROM [${sampleTablesWithRowCounts[0].name}]" })\n`;
            } else {
                discoveryText += `mcp__execute_query({ sql: "SELECT top 1000* FROM [your_table_name]" })\n`;
            }
            discoveryText += '```\n\n';
            
            // Sample information about tables
            discoveryText += '## Sample Tables Information\n\n';
            discoveryText += 'Here are some tables in this database with approximate row counts:\n\n';
            discoveryText += '| Table Name | Approximate Row Count |\n';
            discoveryText += '|------------|----------------------|\n';
            
            sampleTablesWithRowCounts.forEach(table => {
                discoveryText += `| ${table.name} | ${table.rowCount} |\n`;
            });
            
            discoveryText += '\n## Total Tables Count\n\n';
            discoveryText += `This database contains ${tablesResult.recordset.length} tables in total.\n\n`;
            
            discoveryText += '## Best Practices for Table Discovery\n\n';
            discoveryText += '1. Always start with listing available tables\n';
            discoveryText += '2. Examine table structure before querying\n';
            discoveryText += '3. Use TOP clauses for initial queries to avoid performance issues\n';
            discoveryText += '4. For large tables, filter with WHERE clauses when possible\n';
            
            console.log('✅ Table discovery guide generated');
            
            return {
                contents: [{
                    uri: uri.href,
                    text: discoveryText
                }]
            };
        } catch (err) {
            console.error(`❌ Error generating table discovery guide: ${err.message}`);
            return {
                contents: [{
                    uri: uri.href,
                    text: `Error generating table discovery guide: ${err.message}`
                }]
            };
        }
    }
);

// Define tools after we've enhanced the tool function
// TOOL: Execute SQL Query
server.tool(
    "execute-query",
    { 
        sql: z.string(),
        returnResults: z.boolean().optional().default(false)  // Default to not returning results
    },
    async ({ sql, returnResults = false }) => {
        // Basic validation to prevent destructive operations
        const lowerSql = sql.toLowerCase();
        const prohibitedOperations = ['drop ', 'delete ', 'truncate ', 'update ', 'alter '];
        
        if (prohibitedOperations.some(op => lowerSql.includes(op))) {
            return {
                content: [{
                    type: "text",
                    text: "⚠️ Error: Data modification operations (DROP, DELETE, UPDATE, TRUNCATE, ALTER) are not allowed for safety reasons."
                }],
                isError: true
            };
        }
        
        try {
            // Extract potential table names from query for validation
            const tableNameRegex = /\bfrom\s+(\[?[\w_.]+\]?)/gi;
            const matches = [...lowerSql.matchAll(tableNameRegex)];
            
            if (matches.length > 0) {
                // Extract potential table names
                const potentialTables = matches.map(match => {
                    // Remove brackets if present and trim
                    let tableName = match[1].replace(/^\[|\]$/g, '').trim();
                    
                    // Handle schema.table format
                    if (tableName.includes('.')) {
                        tableName = tableName.split('.').pop();
                    }
                    
                    return tableName;
                });
                
                console.log(`🔍 Validating tables in query: ${potentialTables.join(', ')}`);
                
                // List of allowed system tables/views for discovery
                const allowedSystemObjects = [
                    'tables', 'columns', 'objects', 'sysobjects', 'sysusers', 'systypes',
                    'information_schema.tables', 'information_schema.columns', 'information_schema.routines',
                    'information_schema.views', 'sys.tables', 'sys.columns', 'sys.objects',
                    'sys.types', 'sys.schemas', 'sys.indexes', 'sys.procedures', 'sys.views'
                ];
                
                // Check if tables exist, allowing system objects
                for (const tableName of potentialTables) {
                    // Skip validation for system objects
                    const lowerTableName = tableName.toLowerCase();
                    if (allowedSystemObjects.some(obj => lowerTableName === obj || lowerTableName.endsWith('.' + obj))) {
                        console.log(`🔍 Allowing system object: ${tableName}`);
                        continue;
                    }
                    
                    const tableCheckResult = await executeSql(`
                        SELECT COUNT(*) AS TableCount
                        FROM INFORMATION_SCHEMA.TABLES
                        WHERE TABLE_NAME = '${tableName}'
                    `);
                    
                    if (tableCheckResult.recordset[0].TableCount === 0) {
                        return {
                            content: [{
                                type: "text",
                                text: `⚠️ Error: Table '${tableName}' does not exist in the database. 
                                
For table discovery, use these SQL Server commands:

1. List all user tables: 
   SELECT TOP 100 TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'

2. List tables with name pattern:
   SELECT name FROM sys.objects WHERE type = 'U' AND name LIKE '%user%'
   
3. Get table you just found:
   SELECT top 1000* FROM Users
                                
Or use our discover-tables tool for formatted results.`
                            }],
                            isError: true
                        };
                    }
                }
            }
            
            // If validation passes, execute the query
            const result = await executeSql(sql);
            const rowCount = result.recordset ? result.recordset.length : 0;
            
            // Create results directory if it doesn't exist
            const resultsDir = process.env.QUERY_RESULTS_PATH ? 
                path.resolve(process.env.QUERY_RESULTS_PATH) : 
                path.join(__dirname, 'query_results');
            
            if (!fs.existsSync(resultsDir)) {
                fs.mkdirSync(resultsDir, { recursive: true });
                console.log(`📁 Created results directory: ${resultsDir}`);
            }
            
            // Generate UUID for the output file
            const uuid = crypto.randomUUID();
            const filename = `${uuid}.json`;
            const filepath = path.join(resultsDir, filename);
            
            // Add metadata to results
            const resultWithMetadata = {
                metadata: {
                    uuid: uuid,
                    timestamp: new Date().toISOString(),
                    query: sql,
                    rowCount: rowCount,
                    executionTimeMs: result.durationMs || 0
                },
                results: result.recordset || []
            };
            
            // Save results to a JSON file
            if (result.recordset && result.recordset.length > 0) {
                try {
                    fs.writeFileSync(filepath, JSON.stringify(resultWithMetadata, null, 2));
                    console.log(`✅ Query results saved to ${filepath}`);
                } catch (writeError) {
                    console.error(`❌ Error saving query results to file: ${writeError.message}`);
                }
            }
            
            // Create the response
            let responseText = '';
            
            if (rowCount === 0) {
                responseText = "Query executed successfully, but returned no rows.";
            } else {
                // Basic result summary
                responseText = `Query executed successfully and returned ${rowCount} rows.\n\n`;
                responseText += `📄 Results have been saved as JSON to: ${filepath}\n\n`;
                
                // Add sample of column names
                if (result.recordset && result.recordset.length > 0) {
                    responseText += `Columns: ${Object.keys(result.recordset[0]).join(', ')}\n\n`;
                }
                
                // Add instructions for viewing the results
                responseText += `To view these results within the MCP, use:\n`;
                responseText += `\`\`\`javascript\n`;
                responseText += `mcp__get_query_results({ uuid: "${uuid}" })\n`;
                responseText += `\`\`\`\n\n`;
                
                // Only include actual result data if explicitly requested
                if (returnResults) {
                    responseText += `Result Preview:\n\n`;
                    
                    // Format as markdown table (limited to 10 rows for preview)
                    const previewRows = result.recordset.slice(0, 10);
                    let markdown = '| ' + Object.keys(result.recordset[0]).join(' | ') + ' |\n';
                    markdown += '| ' + Object.keys(result.recordset[0]).map(() => '---').join(' | ') + ' |\n';
                    
                    previewRows.forEach(row => {
                        markdown += '| ' + Object.values(row).map(v => String(v || '')).join(' | ') + ' |\n';
                    });
                    
                    responseText += markdown;
                    
                    if (result.recordset.length > 10) {
                        responseText += `\n_Showing first 10 of ${result.recordset.length} rows. Full results in saved file._\n`;
                    }
                } else {
                    // Just tell them how to get a preview
                    responseText += `To execute query and see results preview in the same call (only for small result sets):\n`;
                    responseText += `\`\`\`javascript\n`;
                    responseText += `mcp__execute_query({ sql: "YOUR QUERY HERE", returnResults: true })\n`;
                    responseText += `\`\`\``;
                }
            }
            
            return {
                content: [{
                    type: "text",
                    text: responseText
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error executing query: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// TOOL: Get table details
server.tool(
    "table-details",
    { tableName: z.string() },
    async ({ tableName }) => {
        try {
            const result = await executeSql(`
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    CHARACTER_MAXIMUM_LENGTH,
                    IS_NULLABLE,
                    COLUMN_DEFAULT
                FROM 
                    INFORMATION_SCHEMA.COLUMNS
                WHERE 
                    TABLE_NAME = '${tableName}'
                ORDER BY 
                    ORDINAL_POSITION
            `);
            
            if (result.recordset.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Table '${tableName}' not found.`
                    }],
                    isError: true
                };
            }
            
            // Format as markdown
            let markdown = `# Table: ${tableName}\n\n`;
            markdown += '| Column | Type | Length | Nullable | Default |\n';
            markdown += '|--------|------|--------|----------|--------|\n';
            
            result.recordset.forEach(col => {
                const length = col.CHARACTER_MAXIMUM_LENGTH ? col.CHARACTER_MAXIMUM_LENGTH : 'N/A';
                const nullable = col.IS_NULLABLE === 'YES' ? 'Yes' : 'No';
                const defaultVal = col.COLUMN_DEFAULT ? col.COLUMN_DEFAULT : 'N/A';
                
                markdown += `| ${col.COLUMN_NAME} | ${col.DATA_TYPE} | ${length} | ${nullable} | ${defaultVal} |\n`;
            });
            
            return {
                content: [{
                    type: "text",
                    text: markdown
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting table details: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// TOOL: Get stored procedure details
server.tool(
    "procedure-details",
    { procedureName: z.string() },
    async ({ procedureName }) => {
        try {
            const result = await executeSql(`
                SELECT 
                    ROUTINE_DEFINITION
                FROM 
                    INFORMATION_SCHEMA.ROUTINES
                WHERE 
                    ROUTINE_TYPE = 'PROCEDURE' AND
                    ROUTINE_NAME = '${procedureName}'
            `);
            
            if (result.recordset.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Stored procedure '${procedureName}' not found.`
                    }],
                    isError: true
                };
            }
            
            // Get parameters
            const paramResult = await executeSql(`
                SELECT 
                    PARAMETER_NAME,
                    DATA_TYPE,
                    PARAMETER_MODE
                FROM 
                    INFORMATION_SCHEMA.PARAMETERS
                WHERE 
                    SPECIFIC_NAME = '${procedureName}'
                ORDER BY 
                    ORDINAL_POSITION
            `);
            
            let markdown = `# Stored Procedure: ${procedureName}\n\n`;
            
            if (paramResult.recordset.length > 0) {
                markdown += '## Parameters\n\n';
                markdown += '| Name | Type | Mode |\n';
                markdown += '|------|------|------|\n';
                
                paramResult.recordset.forEach(param => {
                    markdown += `| ${param.PARAMETER_NAME} | ${param.DATA_TYPE} | ${param.PARAMETER_MODE} |\n`;
                });
                
                markdown += '\n';
            }
            
            markdown += '## Definition\n\n';
            markdown += '```sql\n';
            markdown += result.recordset[0].ROUTINE_DEFINITION;
            markdown += '\n```\n';
            
            return {
                content: [{
                    type: "text",
                    text: markdown
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting procedure details: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// TOOL: Get function details
server.tool(
    "function-details",
    { functionName: z.string() },
    async ({ functionName }) => {
        try {
            const result = await executeSql(`
                SELECT 
                    ROUTINE_DEFINITION
                FROM 
                    INFORMATION_SCHEMA.ROUTINES
                WHERE 
                    ROUTINE_TYPE = 'FUNCTION' AND
                    ROUTINE_NAME = '${functionName}'
            `);
            
            if (result.recordset.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Function '${functionName}' not found.`
                    }],
                    isError: true
                };
            }
            
            // Get parameters
            const paramResult = await executeSql(`
                SELECT 
                    PARAMETER_NAME,
                    DATA_TYPE,
                    PARAMETER_MODE
                FROM 
                    INFORMATION_SCHEMA.PARAMETERS
                WHERE 
                    SPECIFIC_NAME = '${functionName}'
                ORDER BY 
                    ORDINAL_POSITION
            `);
            
            let markdown = `# Function: ${functionName}\n\n`;
            
            if (paramResult.recordset.length > 0) {
                markdown += '## Parameters\n\n';
                markdown += '| Name | Type | Mode |\n';
                markdown += '|------|------|------|\n';
                
                paramResult.recordset.forEach(param => {
                    markdown += `| ${param.PARAMETER_NAME} | ${param.DATA_TYPE} | ${param.PARAMETER_MODE} |\n`;
                });
                
                markdown += '\n';
            }
            
            markdown += '## Definition\n\n';
            markdown += '```sql\n';
            markdown += result.recordset[0].ROUTINE_DEFINITION;
            markdown += '\n```\n';
            
            return {
                content: [{
                    type: "text",
                    text: markdown
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting function details: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// TOOL: Get view details
server.tool(
    "view-details",
    { viewName: z.string() },
    async ({ viewName }) => {
        try {
            const result = await executeSql(`
                SELECT 
                    VIEW_DEFINITION
                FROM 
                    INFORMATION_SCHEMA.VIEWS
                WHERE 
                    TABLE_NAME = '${viewName}'
            `);
            
            if (result.recordset.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `View '${viewName}' not found.`
                    }],
                    isError: true
                };
            }
            
            // Get columns
            const columnResult = await executeSql(`
                SELECT 
                    COLUMN_NAME,
                    DATA_TYPE,
                    IS_NULLABLE
                FROM 
                    INFORMATION_SCHEMA.COLUMNS
                WHERE 
                    TABLE_NAME = '${viewName}'
                ORDER BY 
                    ORDINAL_POSITION
            `);
            
            let markdown = `# View: ${viewName}\n\n`;
            
            if (columnResult.recordset.length > 0) {
                markdown += '## Columns\n\n';
                markdown += '| Name | Type | Nullable |\n';
                markdown += '|------|------|----------|\n';
                
                columnResult.recordset.forEach(col => {
                    markdown += `| ${col.COLUMN_NAME} | ${col.DATA_TYPE} | ${col.IS_NULLABLE} |\n`;
                });
                
                markdown += '\n';
            }
            
            markdown += '## Definition\n\n';
            markdown += '```sql\n';
            markdown += result.recordset[0].VIEW_DEFINITION;
            markdown += '\n```\n';
            
            return {
                content: [{
                    type: "text",
                    text: markdown
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting view details: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// TOOL: Get index details
server.tool(
    "index-details",
    { 
        tableName: z.string(),
        indexName: z.string() 
    },
    async ({ tableName, indexName }) => {
        try {
            const result = await executeSql(`
                SELECT 
                    i.name AS IndexName,
                    i.type_desc AS IndexType,
                    i.is_unique AS IsUnique,
                    i.is_primary_key AS IsPrimaryKey,
                    c.name AS ColumnName
                FROM 
                    sys.indexes i
                INNER JOIN 
                    sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
                INNER JOIN 
                    sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
                INNER JOIN 
                    sys.tables t ON i.object_id = t.object_id
                WHERE 
                    t.name = '${tableName}' AND
                    i.name = '${indexName}'
                ORDER BY 
                    ic.key_ordinal
            `);
            
            if (result.recordset.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `Index '${indexName}' on table '${tableName}' not found.`
                    }],
                    isError: true
                };
            }
            
            let markdown = `# Index: ${indexName}\n\n`;
            markdown += `**Table**: ${tableName}\n\n`;
            markdown += `**Type**: ${result.recordset[0].IndexType}\n\n`;
            markdown += `**Unique**: ${result.recordset[0].IsUnique ? 'Yes' : 'No'}\n\n`;
            markdown += `**Primary Key**: ${result.recordset[0].IsPrimaryKey ? 'Yes' : 'No'}\n\n`;
            
            markdown += '## Columns\n\n';
            markdown += '| Column |\n';
            markdown += '|--------|\n';
            
            result.recordset.forEach(idx => {
                markdown += `| ${idx.ColumnName} |\n`;
            });
            
            return {
                content: [{
                    type: "text",
                    text: markdown
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error getting index details: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// PROMPT: Generate SQL Query
server.prompt(
    "generate-query",
    { 
        description: z.string(),
        tables: z.array(z.string()).optional()
    },
    ({ description, tables }) => ({
        messages: [{
            role: "user",
            content: {
                type: "text",
                text: `Please help me write a SQL query for Microsoft SQL Server that ${description}. ${tables ? `The query should involve these tables: ${tables.join(', ')}.` : ''} Please provide just the SQL query without explanations.`
            }
        }]
    })
);

// TOOL: AI Assistant Database Help
server.tool(
    "cursor-guide",
    {},
    async () => {
        try {
            console.log('🤖 Generating Cursor MCP guide...');
            
            // Get a summary of database objects
            const tablesCount = (await executeSql(`SELECT COUNT(*) AS Count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`)).recordset[0].Count;
            const viewsCount = (await executeSql(`SELECT COUNT(*) AS Count FROM INFORMATION_SCHEMA.VIEWS`)).recordset[0].Count;
            const procsCount = (await executeSql(`SELECT COUNT(*) AS Count FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE'`)).recordset[0].Count;
            const functionsCount = (await executeSql(`SELECT COUNT(*) AS Count FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'FUNCTION'`)).recordset[0].Count;
            
            // Get a sample of common tables
            const sampleTables = (await executeSql(`
                SELECT top 1000TABLE_NAME 
                FROM INFORMATION_SCHEMA.TABLES 
                WHERE TABLE_TYPE = 'BASE TABLE' 
                ORDER BY TABLE_NAME
            `)).recordset.map(t => t.TABLE_NAME);
            
            let guideText = `# MCP SQL Server Guide for Cursor AI\n\n`;
            guideText += `## Database Summary\n\n`;
            guideText += `This SQL Server database contains:\n`;
            guideText += `- ${tablesCount} tables\n`;
            guideText += `- ${viewsCount} views\n`;
            guideText += `- ${procsCount} stored procedures\n`;
            guideText += `- ${functionsCount} functions\n\n`;
            
            guideText += `## Sample Tables\n\n`;
            guideText += `Here are some tables you can query (first 10 alphabetically):\n`;
            guideText += `\`\`\`\n${sampleTables.join('\n')}\n\`\`\`\n\n`;
            
            guideText += `## Correct Usage Sequence\n\n`;
            guideText += `1. **First, browse available tables**: Use \`resources/read\` with \`tables://list\` to see all tables\n`;
            guideText += `2. **Explore table structure**: Use the \`table-details\` tool with a specific table name\n`;
            guideText += `3. **Execute safe queries**: Use the \`execute-query\` tool with valid table names from step 1\n\n`;
            
            guideText += `## Example Queries\n\n`;
            guideText += `### List all tables:\n`;
            guideText += `\`\`\`javascript\n{\n  "method": "resources/read",\n  "params": "tables://list"\n}\n\`\`\`\n\n`;
            
            guideText += `### Get details for a table:\n`;
            guideText += `\`\`\`javascript\n{\n  "method": "tools/call",\n  "params": {\n    "name": "table-details",\n    "arguments": {\n      "tableName": "${sampleTables[0]}"\n    }\n  }\n}\n\`\`\`\n\n`;
            
            guideText += `### Execute a query (with a valid table):\n`;
            guideText += `\`\`\`javascript\n{\n  "method": "tools/call",\n  "params": {\n    "name": "execute-query",\n    "arguments": {\n      "sql": "SELECT top 1000* FROM ${sampleTables[0]}"\n    }\n  }\n}\n\`\`\`\n\n`;
            
            guideText += `## Common Mistakes to Avoid\n\n`;
            guideText += `1. ❌ Don't query tables without checking they exist first\n`;
            guideText += `2. ❌ Don't execute potentially expensive queries without LIMIT/TOP clauses\n`;
            guideText += `3. ❌ Don't use data modification statements (not allowed by the server)\n\n`;
            
            guideText += `✅ Always browse tables first, then explore structure, then query safely.`;
            
            return {
                content: [{
                    type: "text",
                    text: guideText
                }]
            };
        } catch (err) {
            console.error(`❌ Error generating Cursor guide: ${err.message}`);
            return {
                content: [{
                    type: "text",
                    text: `Error generating Cursor guide: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// TOOL: Table Discovery Helper
server.tool(
    "discover-tables",
    { 
        namePattern: z.string().optional(),
        limit: z.number().min(1).max(1000).optional()
    },
    async ({ namePattern, limit = 100 }) => {
        try {
            console.log('🔍 Running table discovery helper...');
            
            // Build query based on parameters
            let query = `
                SELECT TOP ${limit}
                    TABLE_NAME,
                    TABLE_TYPE,
                    TABLE_SCHEMA
                FROM 
                    INFORMATION_SCHEMA.TABLES
                WHERE 
                    TABLE_TYPE = 'BASE TABLE'
            `;
            
            // Add name pattern filter if provided
            if (namePattern) {
                query += ` AND TABLE_NAME LIKE '%${namePattern}%'`;
            }
            
            // Add order
            query += ` ORDER BY TABLE_NAME`;
            
            const result = await executeSql(query);
            
            if (result.recordset.length === 0) {
                return {
                    content: [{
                        type: "text",
                        text: `No tables found${namePattern ? ` matching pattern '${namePattern}'` : ''}.`
                    }]
                };
            }
            
            // Format results as markdown
            let markdown = `# Database Tables${namePattern ? ` Matching '${namePattern}'` : ''}\n\n`;
            markdown += `Found ${result.recordset.length} tables.\n\n`;
            
            markdown += '| Table Name | Schema |\n';
            markdown += '|------------|--------|\n';
            
            result.recordset.forEach(table => {
                markdown += `| ${table.TABLE_NAME} | ${table.TABLE_SCHEMA} |\n`;
            });
            
            markdown += '\n## Next Steps\n\n';
            markdown += '1. To view a table\'s structure, use:\n';
            markdown += '```\nmcp__table_details({ tableName: "table_name_here" })\n```\n\n';
            
            markdown += '2. To query a table, use:\n';
            markdown += '```\nmcp__execute_query({ sql: "SELECT top 1000* FROM [table_name_here]" })\n```\n\n';
            
            return {
                content: [{
                    type: "text",
                    text: markdown
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error discovering tables: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// TOOL: SQL Server Database Discovery
server.tool(
    "discover-database",
    { type: z.enum(['tables', 'views', 'procedures', 'functions', 'all']).default('all') },
    async ({ type }) => {
        try {
            console.log('🔍 Running SQL Server database discovery tool...');
            
            let markdown = `# SQL Server Database Discovery\n\n`;
            
            // Discover tables
            if (type === 'tables' || type === 'all') {
                const tablesQuery = `
                    SELECT TOP 100 
                        TABLE_SCHEMA,
                        TABLE_NAME
                    FROM 
                        INFORMATION_SCHEMA.TABLES
                    WHERE 
                        TABLE_TYPE = 'BASE TABLE'
                    ORDER BY 
                        TABLE_SCHEMA, TABLE_NAME
                `;
                
                const tablesResult = await executeSql(tablesQuery);
                
                markdown += `## Tables (${tablesResult.recordset.length})\n\n`;
                
                if (tablesResult.recordset.length > 0) {
                    markdown += '| Schema | Table Name |\n';
                    markdown += '|--------|------------|\n';
                    
                    tablesResult.recordset.forEach(table => {
                        markdown += `| ${table.TABLE_SCHEMA} | ${table.TABLE_NAME} |\n`;
                    });
                    
                    markdown += '\n### Example Query:\n';
                    markdown += '```sql\n';
                    markdown += `-- Get sample data from a table\n`;
                    markdown += `SELECT top 1000* FROM [${tablesResult.recordset[0].TABLE_SCHEMA}].[${tablesResult.recordset[0].TABLE_NAME}]\n`;
                    markdown += '```\n\n';
                } else {
                    markdown += 'No tables found.\n\n';
                }
            }
            
            // Discover views
            if (type === 'views' || type === 'all') {
                const viewsQuery = `
                    SELECT TOP 50
                        TABLE_SCHEMA,
                        TABLE_NAME
                    FROM 
                        INFORMATION_SCHEMA.VIEWS
                    ORDER BY 
                        TABLE_SCHEMA, TABLE_NAME
                `;
                
                const viewsResult = await executeSql(viewsQuery);
                
                markdown += `## Views (${viewsResult.recordset.length})\n\n`;
                
                if (viewsResult.recordset.length > 0) {
                    markdown += '| Schema | View Name |\n';
                    markdown += '|--------|----------|\n';
                    
                    viewsResult.recordset.forEach(view => {
                        markdown += `| ${view.TABLE_SCHEMA} | ${view.TABLE_NAME} |\n`;
                    });
                    
                    markdown += '\n### Example Query:\n';
                    markdown += '```sql\n';
                    if (viewsResult.recordset.length > 0) {
                        markdown += `-- Get data from a view\n`;
                        markdown += `SELECT top 1000* FROM [${viewsResult.recordset[0].TABLE_SCHEMA}].[${viewsResult.recordset[0].TABLE_NAME}]\n`;
                    }
                    markdown += '```\n\n';
                } else {
                    markdown += 'No views found.\n\n';
                }
            }
            
            // Discover stored procedures
            if (type === 'procedures' || type === 'all') {
                const procsQuery = `
                    SELECT TOP 50
                        ROUTINE_SCHEMA,
                        ROUTINE_NAME
                    FROM 
                        INFORMATION_SCHEMA.ROUTINES
                    WHERE 
                        ROUTINE_TYPE = 'PROCEDURE'
                    ORDER BY 
                        ROUTINE_SCHEMA, ROUTINE_NAME
                `;
                
                const procsResult = await executeSql(procsQuery);
                
                markdown += `## Stored Procedures (${procsResult.recordset.length})\n\n`;
                
                if (procsResult.recordset.length > 0) {
                    markdown += '| Schema | Procedure Name |\n';
                    markdown += '|--------|---------------|\n';
                    
                    procsResult.recordset.forEach(proc => {
                        markdown += `| ${proc.ROUTINE_SCHEMA} | ${proc.ROUTINE_NAME} |\n`;
                    });
                    
                    markdown += '\n### Example:\n';
                    markdown += '```sql\n';
                    if (procsResult.recordset.length > 0) {
                        markdown += `-- Get procedure definition\n`;
                        markdown += `EXEC sp_helptext '${procsResult.recordset[0].ROUTINE_SCHEMA}.${procsResult.recordset[0].ROUTINE_NAME}'\n`;
                    }
                    markdown += '```\n\n';
                } else {
                    markdown += 'No stored procedures found.\n\n';
                }
            }
            
            // Discover functions
            if (type === 'functions' || type === 'all') {
                const funcsQuery = `
                    SELECT TOP 50
                        ROUTINE_SCHEMA,
                        ROUTINE_NAME
                    FROM 
                        INFORMATION_SCHEMA.ROUTINES
                    WHERE 
                        ROUTINE_TYPE = 'FUNCTION'
                    ORDER BY 
                        ROUTINE_SCHEMA, ROUTINE_NAME
                `;
                
                const funcsResult = await executeSql(funcsQuery);
                
                markdown += `## Functions (${funcsResult.recordset.length})\n\n`;
                
                if (funcsResult.recordset.length > 0) {
                    markdown += '| Schema | Function Name |\n';
                    markdown += '|--------|--------------||\n';
                    
                    funcsResult.recordset.forEach(func => {
                        markdown += `| ${func.ROUTINE_SCHEMA} | ${func.ROUTINE_NAME} |\n`;
                    });
                    
                    markdown += '\n### Example:\n';
                    markdown += '```sql\n';
                    if (funcsResult.recordset.length > 0) {
                        markdown += `-- Get function definition\n`;
                        markdown += `EXEC sp_helptext '${funcsResult.recordset[0].ROUTINE_SCHEMA}.${funcsResult.recordset[0].ROUTINE_NAME}'\n`;
                    }
                    markdown += '```\n\n';
                } else {
                    markdown += 'No functions found.\n\n';
                }
            }
            
            // Add summary and next steps
            markdown += '## Next Steps\n\n';
            markdown += '1. To query a table:\n';
            markdown += '```javascript\n';
            markdown += 'mcp__execute_query({ sql: "SELECT top 1000* FROM [table_name]" })\n';
            markdown += '```\n\n';
            
            markdown += '2. To view table structure:\n';
            markdown += '```javascript\n';
            markdown += 'mcp__table_details({ tableName: "table_name" })\n';
            markdown += '```\n\n';
            
            return {
                content: [{
                    type: "text",
                    text: markdown
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error discovering database: ${err.message}`
                }],
                isError: true
            };
        }
    }
);

// Setup transports based on environment variable
async function setupTransport() {
    const transportType = process.env.TRANSPORT || 'stdio';
    console.log(`🚀 Starting MCP server with ${transportType} transport`);
    
    try {
        // Get the server port from environment variables or use default
        const port = process.env.PORT || 3333;
        
        if (transportType === 'sse') {
            console.log(`📡 Setting up SSE transport on port ${port}`);
            
            // Start HTTP server for SSE transport
            await new Promise((resolve, reject) => {
                httpServer.listen(port, () => {
                    console.log(`✅ HTTP server listening on port ${port}`);
                    console.log(`   - SSE endpoint: http://localhost:${port}/sse`);
                    console.log(`   - Messages endpoint: http://localhost:${port}/messages`);
                    resolve();
                });
                
                httpServer.on('error', (error) => {
                    console.error(`❌ Failed to start HTTP server: ${error.message}`);
                    reject(error);
                });
            });
            
            // The actual SSE transport will be created when a client connects
            console.log('⏳ Waiting for SSE client connection...');
        } else if (transportType === 'stdio') {
            console.log('📝 Setting up STDIO transport');
            
            // For stdio transport, we can set up and connect immediately
            const transport = new StdioServerTransport();
            await server.connect(transport);
            
            console.log('✅ STDIO transport ready');
        } else {
            throw new Error(`Unsupported transport type: ${transportType}`);
        }
    } catch (error) {
        console.error(`❌ Failed to setup transport: ${error.message}`);
        process.exit(1);
    }
}

// Setup and start server
try {
    console.log('🚀 Starting MS SQL MCP Server...');
    
    // Add SQL Server discovery guidance at the very top
    console.log('\n🔍 SQL SERVER OBJECT DISCOVERY COMMANDS:');
    console.log('   ✓ Tables:      SELECT TOP 100 TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = \'BASE TABLE\'');
    console.log('   ✓ Views:       SELECT TOP 50 TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.VIEWS');
    console.log('   ✓ Procedures:  SELECT TOP 50 ROUTINE_SCHEMA, ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = \'PROCEDURE\'');
    console.log('   ✓ Functions:   SELECT TOP 50 ROUTINE_SCHEMA, ROUTINE_NAME FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = \'FUNCTION\'');
    console.log('   ✓ Easiest:     mcp__discover_database() - Shows all database objects with examples\n');
    
    // Log table discovery guidance prominently at the top
    console.log('📋 TABLE DISCOVERY SEQUENCE FOR CURSOR:');
    console.log('   1️⃣ FIRST: List tables with "mcp__discover_database()" or SQL Server discovery commands above');
    console.log('   2️⃣ SECOND: Check table structure with "mcp__table_details({ tableName: \"table_name\" })');
    console.log('   3️⃣ THIRD: Query safely with "mcp__execute_query({ sql: \"SELECT top 1000* FROM [table_name]\" })');
    console.log('   ⚠️ IMPORTANT: NEVER query a table without first verifying it exists!\n');
    
    console.log('📋 Available commands:');
    console.log('   - Info: get-info');
    console.log('   - Prompts: generate-query');
    
    // Log available resources with improved guidance
    console.log('📋 Available resources:');
    console.log('   - tables://list            List all tables in the database (USE THIS FIRST!)');
    console.log('   - discovery://tables       Table discovery guide with examples (RECOMMENDED FOR CURSOR)');
    console.log('   - schema://database        Show database schema with all tables and columns');
    console.log('   - procedures://list        List all stored procedures');
    console.log('   - functions://list         List all functions');
    console.log('   - views://list             List all views');
    console.log('   - indexes://list           List all indexes');
    console.log('   - ai-schema://database     AI assistant guide with examples');
    
    // Log available tools with improved guidance
    console.log('📋 Available tools:');
    console.log('   - discover-tables          Find tables in the database (START HERE FIRST!)');
    console.log('   - table-details            Get details about a specific table (use after finding tables)');
    console.log('   - execute-query            Execute SELECT queries against the database (check tables first)');
    console.log('   - procedure-details        Get details about a specific stored procedure');
    console.log('   - function-details         Get details about a specific function');
    console.log('   - view-details             Get details about a specific view');
    console.log('   - index-details            Get details about a specific index');
    
    // Add recommended sequence for using the MCP tools
    console.log('🔍 Recommended sequence for MCP tools:');
    console.log('   1. First use "discover-tables" tool to find available tables');
    console.log('   2. For AI assistants, read "discovery://tables" for a complete guide');
    console.log('   3. Use "table-details" to explore the structure of a table before querying');
    console.log('   4. Then use "execute-query" with valid table names from step 1');
    
    // Start the server with the configured transport
    await setupTransport();
    
    // Add graceful shutdown handler
    process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down server gracefully...');
        
        // Close active connections
        if (activeConnections.size > 0) {
            console.log(`📴 Closing ${activeConnections.size} active SSE connections`);
            for (const connection of activeConnections) {
                try {
                    connection.end();
                } catch (error) {
                    console.error(`Error closing SSE connection: ${error.message}`);
                }
            }
            activeConnections.clear();
        }
        
        // Close HTTP server if it's running
        if (httpServer && httpServer.listening) {
            console.log('🔌 Closing HTTP server');
            await new Promise(resolve => httpServer.close(resolve));
        }
        
        console.log('👋 Server shutdown complete');
        process.exit(0);
    });
} catch (err) {
    console.error('❌ Failed to start MCP server:', err);
    process.exit(1);
} 

// TOOL: First-Run Auto Discovery 
server.tool(
    "discover",
    {},  // No arguments needed - just mcp__discover()
    async () => {
        try {
            console.log('🔍 Running first-run auto-discovery...');
            
            // Get database summary counts
            const tablesCount = (await executeSql(`SELECT COUNT(*) AS Count FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`)).recordset[0].Count;
            const viewsCount = (await executeSql(`SELECT COUNT(*) AS Count FROM INFORMATION_SCHEMA.VIEWS`)).recordset[0].Count;
            const procsCount = (await executeSql(`SELECT COUNT(*) AS Count FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'PROCEDURE'`)).recordset[0].Count;
            const funcsCount = (await executeSql(`SELECT COUNT(*) AS Count FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_TYPE = 'FUNCTION'`)).recordset[0].Count;
            
            // Get top tables for display
            const popularTables = (await executeSql(`
                SELECT TOP 10
                    TABLE_SCHEMA,
                    TABLE_NAME
                FROM 
                    INFORMATION_SCHEMA.TABLES
                WHERE 
                    TABLE_TYPE = 'BASE TABLE'
                ORDER BY
                    TABLE_NAME
            `)).recordset;
            
            // Format the discovery results
            let discoveryText = `# SQL Server Quick Discovery\n\n`;
            discoveryText += `## Database Summary\n\n`;
            discoveryText += `This SQL Server database (${dbConfig.database}) contains:\n\n`;
            discoveryText += `- **Tables**: ${tablesCount}\n`;
            discoveryText += `- **Views**: ${viewsCount}\n`;
            discoveryText += `- **Stored Procedures**: ${procsCount}\n`;
            discoveryText += `- **Functions**: ${funcsCount}\n\n`;
            
            // Show popular tables
            discoveryText += `## top 1000Tables\n\n`;
            discoveryText += `| Schema | Table Name |\n`;
            discoveryText += `|--------|------------|\n`;
            
            popularTables.forEach(table => {
                discoveryText += `| ${table.TABLE_SCHEMA} | ${table.TABLE_NAME} |\n`;
            });
            
            // Sample SQL table query
            const sampleTable = popularTables.length > 0 ? 
                `[${popularTables[0].TABLE_SCHEMA}].[${popularTables[0].TABLE_NAME}]` : "example_table";
            
            // Add examples
            discoveryText += `\n## Next Steps\n\n`;
            discoveryText += `### 1. Get table details:\n`;
            discoveryText += "```javascript\n";
            discoveryText += `mcp__table_details({ tableName: "${popularTables[0].TABLE_NAME}" })\n`;
            discoveryText += "```\n\n";
            
            discoveryText += `### 2. Execute a safe query:\n`;
            discoveryText += "```javascript\n";
            discoveryText += `mcp__execute_query({ sql: "SELECT top 1000* FROM ${sampleTable}" })\n`;
            discoveryText += "```\n\n";
            
            discoveryText += `### 3. Explore all database objects:\n`;
            discoveryText += "```javascript\n";
            discoveryText += `mcp__discover_database()\n`;
            discoveryText += "```\n\n";
            
            discoveryText += `⚠️ **SQL Server System Views for Custom Discovery**\n\n`;
            discoveryText += "```sql\n";
            discoveryText += `-- List all tables\nSELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'\n\n`;
            discoveryText += `-- Find tables by pattern\nSELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%user%'\n`;
            discoveryText += "```\n";
            
            return {
                content: [{
                    type: "text",
                    text: discoveryText
                }]
            };
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error running auto-discovery: ${err.message}`
                }],
                isError: true
            };
        }
    }
); 

// Add HTTP endpoints to list and retrieve saved query results
app.get('/query-results', (req, res) => {
    const resultsDir = process.env.QUERY_RESULTS_PATH ? 
        path.resolve(process.env.QUERY_RESULTS_PATH) : 
        path.join(__dirname, 'query_results');
    
    if (!fs.existsSync(resultsDir)) {
        return res.status(200).json({ results: [] });
    }
    
    try {
        // Read all JSON files in the results directory
        const files = fs.readdirSync(resultsDir).filter(file => file.endsWith('.json'));
        const results = files.map(file => {
            try {
                const filepath = path.join(resultsDir, file);
                const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                return {
                    uuid: data.metadata.uuid,
                    timestamp: data.metadata.timestamp,
                    query: data.metadata.query,
                    rowCount: data.metadata.rowCount,
                    filename: file
                };
            } catch (err) {
                console.error(`Error reading file ${file}: ${err.message}`);
                return {
                    uuid: file.replace('.json', ''),
                    error: 'Could not read file metadata'
                };
            }
        });
        
        res.status(200).json({ results });
    } catch (err) {
        console.error(`Error listing query results: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

app.get('/query-results/:uuid', (req, res) => {
    const { uuid } = req.params;
    const resultsDir = process.env.QUERY_RESULTS_PATH ? 
        path.resolve(process.env.QUERY_RESULTS_PATH) : 
        path.join(__dirname, 'query_results');
    const filepath = path.join(resultsDir, `${uuid}.json`);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: `Result with UUID ${uuid} not found` });
    }
    
    try {
        const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        res.status(200).json(data);
    } catch (err) {
        console.error(`Error retrieving query result ${uuid}: ${err.message}`);
        res.status(500).json({ error: err.message });
    }
});

// TOOL: Get Saved Query Results
server.tool(
    "get-query-results",
    { 
        uuid: z.string().optional(),
        limit: z.number().min(1).max(100).optional()
    },
    async ({ uuid, limit = 10 }) => {
        try {
            console.log('🔍 Retrieving saved query results...');
            
            const resultsDir = process.env.QUERY_RESULTS_PATH ? 
                path.resolve(process.env.QUERY_RESULTS_PATH) : 
                path.join(__dirname, 'query_results');
            
            // If directory doesn't exist, return empty list
            if (!fs.existsSync(resultsDir)) {
                return {
                    content: [{
                        type: "text",
                        text: "No query results directory found."
                    }]
                };
            }
            
            // If UUID is provided, return that specific result
            if (uuid) {
                const filepath = path.join(resultsDir, `${uuid}.json`);
                
                if (!fs.existsSync(filepath)) {
                    return {
                        content: [{
                            type: "text",
                            text: `Query result with UUID ${uuid} not found.`
                        }],
                        isError: true
                    };
                }
                
                try {
                    // Read the specific result file
                    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                    
                    // Format the response
                    let markdown = `# Query Result: ${uuid}\n\n`;
                    markdown += `**Executed**: ${data.metadata.timestamp}\n\n`;
                    markdown += `**Query**: \`\`\`sql\n${data.metadata.query}\n\`\`\`\n\n`;
                    markdown += `**Row Count**: ${data.metadata.rowCount}\n\n`;
                    
                    if (data.results && data.results.length > 0) {
                        markdown += `## Results Preview\n\n`;
                        
                        // Create markdown table for preview (first 10 rows)
                        const previewRows = data.results.slice(0, 10);
                        
                        // Table headers
                        markdown += '| ' + Object.keys(previewRows[0]).join(' | ') + ' |\n';
                        markdown += '| ' + Object.keys(previewRows[0]).map(() => '---').join(' | ') + ' |\n';
                        
                        // Table rows
                        previewRows.forEach(row => {
                            markdown += '| ' + Object.values(row).map(v => String(v || '')).join(' | ') + ' |\n';
                        });
                        
                        if (data.results.length > 10) {
                            markdown += `\n_Showing first 10 of ${data.results.length} rows_\n`;
                        }
                    }
                    
                    return {
                        content: [{
                            type: "text",
                            text: markdown
                        }]
                    };
                } catch (err) {
                    return {
                        content: [{
                            type: "text",
                            text: `Error reading query result: ${err.message}`
                        }],
                        isError: true
                    };
                }
            } else {
                // List recent results
                try {
                    // Get all JSON files in the directory
                    const files = fs.readdirSync(resultsDir)
                        .filter(file => file.endsWith('.json'))
                        .map(file => {
                            try {
                                const filepath = path.join(resultsDir, file);
                                const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                                return {
                                    uuid: data.metadata.uuid,
                                    timestamp: data.metadata.timestamp,
                                    query: data.metadata.query,
                                    rowCount: data.metadata.rowCount
                                };
                            } catch (err) {
                                return {
                                    uuid: file.replace('.json', ''),
                                    error: 'Could not read file metadata'
                                };
                            }
                        })
                        // Sort by timestamp (most recent first)
                        .sort((a, b) => {
                            if (!a.timestamp) return 1;
                            if (!b.timestamp) return -1;
                            return new Date(b.timestamp) - new Date(a.timestamp);
                        })
                        // Limit to requested number
                        .slice(0, limit);
                    
                    // Format the response
                    let markdown = `# Recent Query Results\n\n`;
                    
                    if (files.length === 0) {
                        markdown += 'No saved query results found.\n';
                    } else {
                        markdown += '| UUID | Timestamp | Query | Row Count |\n';
                        markdown += '|------|-----------|-------|----------|\n';
                        
                        files.forEach(result => {
                            const queryPreview = result.query ? 
                                (result.query.length > 50 ? result.query.substring(0, 50) + '...' : result.query) : 
                                'N/A';
                            
                            markdown += `| ${result.uuid} | ${result.timestamp || 'N/A'} | \`${queryPreview}\` | ${result.rowCount || 'N/A'} |\n`;
                        });
                        
                        markdown += `\n## Viewing Specific Results\n\n`;
                        markdown += `To view details for a specific result, use:\n\n`;
                        markdown += `\`\`\`javascript\n`;
                        markdown += `mcp__get_query_results({ uuid: "${files[0].uuid}" })\n`;
                        markdown += `\`\`\`\n`;
                    }
                    
                    return {
                        content: [{
                            type: "text",
                            text: markdown
                        }]
                    };
                } catch (err) {
                    return {
                        content: [{
                            type: "text",
                            text: `Error listing query results: ${err.message}`
                        }],
                        isError: true
                    };
                }
            }
        } catch (err) {
            return {
                content: [{
                    type: "text",
                    text: `Error processing query results: ${err.message}`
                }],
                isError: true
            };
        }
    }
);