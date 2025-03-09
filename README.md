# MS SQL MCP Server

An implementation of Model Context Protocol (MCP) for MS SQL Server. This project allows Large Language Models (LLMs) like Claude to interact with MS SQL databases through standardized resources, tools, and prompts.

## What is MCP?

The Model Context Protocol (MCP) is a standardized protocol that enables LLMs to interact with external tools and data. This implementation provides:

- **Resources**: Schema information, table listings
- **Tools**: SQL query execution, table details
- **Prompts**: SQL query generation templates

## Features

- Secure connection to MS SQL Server/Azure SQL databases
- Database schema exploration via resources
- SQL query execution via tools
- Safety measures to prevent destructive operations
- Multiple transport options (stdio, HTTP/SSE)
- Interactive client for testing and demonstration

## Requirements

- Node.js 14+
- MS SQL Server instance or Azure SQL Database
- Required npm packages (see package.json)

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Create an .env file based on .env.example:

```bash
cp .env.example .env
```

4. Edit the .env file with your database credentials:

```bash
DB_USER=your_username
DB_PASSWORD=your_password
DB_SERVER=your_server_name
DB_DATABASE=your_database_name
PORT=3333
TRANSPORT=stdio
SERVER_URL=http://localhost:3333
```

## Usage

This project uses ES Modules to properly work with the MCP SDK.

### Running the Server

#### Option 1: Using stdio Transport (Default)

For direct integration with Claude Desktop or when using the bundled client:

```bash
npm start
```

#### Option 2: Using HTTP/SSE Transport

For network-based integration when the server needs to be accessed remotely:

```bash
npm run start:sse
```

This will start the server on port 3333 (or the port specified in the .env file).

### Running the Client

#### Option 1: Using stdio Transport with Bundled Server

```bash
npm run client
```

This starts the interactive client and automatically launches the server as a child process.

#### Option 2: Using HTTP/SSE Transport with External Server

First, start the server in a separate terminal:

```bash
npm run start:sse
```

Then, in another terminal, run the client in SSE mode:

```bash
npm run client:sse
```

### Testing HTTP Connectivity

To verify that the server is properly listening on the configured port:

```bash
npm run test:http
```

This sends a simple HTTP request to the SSE endpoint and checks if the server responds.

### Client Menu Options

The client provides an interactive menu with the following options:

1. List available resources
2. List available tools
3. List available prompts
4. Execute SQL query
5. Get table details
6. Read database schema
7. Read tables list
8. Generate SQL query
9. Exit

## Claude Desktop Integration

To use this MCP server with Claude Desktop:

1. Make sure Claude Desktop is installed
2. Edit the Claude Desktop configuration file at `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
    "mcpServers": {
        "mssql": {
            "command": "node",
            "args": [
                "/ABSOLUTE/PATH/TO/server.mjs"
            ]
        }
    }
}
```

3. Replace `/ABSOLUTE/PATH/TO/server.mjs` with the full path to the ES Modules server file (server.mjs)
4. Restart Claude Desktop
5. You should now see the MCP tools icon in Claude Desktop

## Available MCP Resources

- `schema://database`: Shows the full database schema
- `tables://list`: Lists all tables in the database

## Available MCP Tools

- `execute-query`: Executes a read-only SQL query
- `table-details`: Gets detailed information about a specific table

## Available MCP Prompts

- `generate-query`: Helps generate SQL queries based on natural language descriptions

## Transports

The server supports two transport options:

1. **stdio**: For direct integration with Claude Desktop
2. **HTTP/SSE**: For network-based integration

Set the `TRANSPORT` environment variable to choose the transport method.

## Security

This implementation includes several security measures:

- No data modification operations allowed (DROP, DELETE, UPDATE, etc.)
- Connection parameters stored in environment variables
- Input validation for SQL queries

## Troubleshooting

### Module Resolution and Import Path Issues

If you encounter errors related to missing modules or incorrect paths, try:

1. Make sure you've properly installed dependencies:
   ```bash
   npm install
   ```

2. The postinstall script should help with initializing the MCP SDK properly. If it fails:
   ```bash
   cd node_modules/@modelcontextprotocol/sdk && npm install
   ```

3. Check if your Node.js version is 14+ (this project uses ES Modules).

4. If you see duplicate paths in error messages, it might be due to how Node resolves paths. Make sure you're using the standard ES Modules format without duplicate path segments.

### Database Connection Issues

If the server can't connect to your database:

1. Verify your connection details in the .env file
2. Ensure your SQL Server instance is running and accessible
3. Check firewall settings and network connectivity
4. For Azure SQL, make sure your IP is whitelisted

### Claude Desktop Integration

If Claude Desktop doesn't show your MCP tools:

1. Double-check your `claude_desktop_config.json` file
2. Make sure you're using absolute paths to your server file, preferably the .mjs version
3. Restart Claude Desktop completely
4. Check Claude's logs for any errors related to MCP

## Logging and Debugging

This implementation includes enhanced logging to provide better visibility into the MCP server and client operations:

### Standard Logging

- 🔌 Connection events (connect/disconnect)
- 📥 Incoming requests and responses
- 📤 Outgoing requests and responses
- 🔧 Tool execution with parameters and results
- 📚 Resource access with URI and results

### Enhanced Debugging

Set `DEBUG=true` in your .env file to enable more detailed logging:

- Full request and response objects
- Detailed error information
- Additional diagnostic messages

This can be particularly helpful when:
- Diagnosing connection issues
- Troubleshooting tool execution failures
- Understanding the flow of data between client and server

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

ISC
