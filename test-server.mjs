#!/usr/bin/env node

// Simple script to test that the HTTP server is running
import http from 'http';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Get the server port from environment variables or use default
const port = process.env.PORT || 3333;
const url = `http://localhost:${port}`;

console.log(`🔍 Testing HTTP server connection to ${url}`);
console.log('This script checks if the MCP server is running and accessible via HTTP.\n');

// Make a GET request to the server
http.get(url, (res) => {
    const { statusCode } = res;
    console.log(`📡 Connection status: ${statusCode === 200 ? '✅ Success' : '❌ Failed'}`);
    console.log(`🔢 HTTP status code: ${statusCode}`);
    
    // Handle successful response
    if (statusCode === 200) {
        console.log('🎉 The HTTP server is up and running!');
        
        // Collect response data
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        
        // Process response when complete
        res.on('end', () => {
            try {
                const parsedData = JSON.parse(rawData);
                console.log('\n📊 Server Response:');
                console.log(JSON.stringify(parsedData, null, 2));
                
                // Show next steps
                console.log('\n🚀 Next steps:');
                console.log('1. Run the client with: npm run client:sse');
                console.log('2. Check server logs for connection details');
            } catch (e) {
                console.error(`❌ Error parsing response: ${e.message}`);
                console.log('Raw response:', rawData);
            }
        });
    } else {
        console.log('❌ The server is running but returned a non-success status code.');
        console.log('   Check the server logs for more information.');
    }
}).on('error', (err) => {
    console.error(`❌ Connection error: ${err.message}`);
    console.log('\n📋 Troubleshooting:');
    console.log('1. Make sure the server is running with: npm run start:sse');
    console.log('2. Verify that port', port, 'is not in use by another application');
    console.log('3. Check for any firewall issues that might block the connection');
    console.log('\nIf the server is running but you\'re still seeing this error,');
    console.log('check the server logs for any startup errors.');
}); 