# MS SQL MCP Server

An easy-to-use bridge that lets AI assistants like Claude directly query and explore Microsoft SQL Server databases. No coding experience required!

## What Does This Tool Do?

This tool allows AI assistants to:
1. **Discover** tables in your SQL Server database
2. **View** table structures (columns, data types, etc.)
3. **Execute** read-only SQL queries safely
4. **Generate** SQL queries from natural language requests

## 🚀 Quick Start Guide

### Step 1: Install Prerequisites
- Install [Node.js](https://nodejs.org/) (version 14 or higher)
- Have access to a Microsoft SQL Server database (on-premises or Azure)

### Step 2: Clone and Setup
```bash
# Clone this repository
git clone https://github.com/dperussina/mssql-mcp-server.git

# Navigate to the project directory
cd mssql-mcp-server

# Install dependencies
npm install

# Copy the example environment file
cp .env.example .env
```

### Step 3: Configure Your Database Connection
Edit the `.env` file with your database credentials:
```
DB_USER=your_username
DB_PASSWORD=your_password
DB_SERVER=your_server_name_or_ip
DB_DATABASE=your_database_name
PORT=3333
TRANSPORT=stdio
SERVER_URL=http://localhost:3333
```

### Step 4: Start the Server
```bash
# Start with default stdio transport
npm start

# OR start with HTTP/SSE transport for network access
npm run start:sse
```

### Step 5: Try it out!
```bash
# Run the interactive client
npm run client
```

## 📊 Example Use Cases

1. **Explore your database structure without writing SQL**
   ```javascript
   mcp__discover_database()
   ```

2. **Get detailed information about a specific table**
   ```javascript
   mcp__table_details({ tableName: "Customers" })
   ```

3. **Run a safe query**
   ```javascript
   mcp__execute_query({ sql: "SELECT TOP 10 * FROM Customers" })
   ```

4. **Ask natural language questions**
   ```
   "Show me the top 5 customers with the most orders in the last month"
   ```

## 🔄 Transport Methods Explained

### Option 1: stdio Transport (Default)
Best for: Using directly with Claude Desktop or the bundled client
```bash
npm start
```

### Option 2: HTTP/SSE Transport
Best for: Network access or when used with web applications
```bash
npm run start:sse
```

## 🖥️ Interactive Client Features

The bundled client provides an easy menu-driven interface:

1. **List available resources** - See what information is available
2. **List available tools** - See what actions you can perform
3. **Execute SQL query** - Run a read-only SQL query
4. **Get table details** - View structure of any table
5. **Read database schema** - See all tables and their relationships
6. **Generate SQL query** - Convert natural language to SQL

## 🔗 Claude Desktop Integration

Connect this tool directly to Claude Desktop in a few easy steps:

1. Install Claude Desktop from [anthropic.com](https://www.anthropic.com/)
2. Edit Claude's configuration file:
   - Location: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Add this configuration:

```json
{
    "mcpServers": {
        "mssql": {
            "command": "node",
            "args": [
                "/FULL/PATH/TO/mssql-mcp-server/server.mjs"
            ]
        }
    }
}
```
3. Replace `/FULL/PATH/TO/` with the actual path to where you cloned this repository
4. Restart Claude Desktop
5. Look for the tools icon in Claude Desktop - you can now use database commands directly!

## 🔌 Connecting with Cursor IDE

Cursor is an AI-powered code editor that can leverage this tool for advanced database interactions. Here's how to set it up:

### Setup in Cursor

1. Open Cursor IDE (download from [cursor.sh](https://cursor.sh) if you don't have it)
2. Start the MS SQL MCP Server using the HTTP/SSE transport:
   ```bash
   npm run start:sse
   ```
3. Create a new workspace or open an existing project in Cursor
4. Enter Cursor Settings
5. Click MCP
6. Add new MCP server
7. Name your MCP server, select type: sse
8. Enter server URL as: localhost:3333/sse (or the port you have it running on)


### Using Database Commands in Cursor

Once connected, you can use MCP commands directly in Cursor's AI chat:

1. Ask Claude in Cursor to explore your database:
   ```
   Can you show me the tables in my database?
   ```

2. Execute specific queries:
   ```
   Query the top 10 records from the Customers table
   ```

3. Generate and run complex queries:
   ```
   Find all orders from the last month with a value over $1000
   ```

### Troubleshooting Cursor Connection

- Make sure the MS SQL MCP Server is running with the HTTP/SSE transport
- Check that the port is correct and matches what's in your .env file
- Ensure your firewall isn't blocking the connection
- If using a different IP/hostname, update the SERVER_URL in your .env file

## 🛡️ Security Features

- **Read-only by default**: No risk of data modification
- **Private credentials**: Database connection details stay in your `.env` file
- **SQL injection protection**: Built-in validation for SQL queries

## 🔎 Troubleshooting for New Users

### "Cannot connect to database"
- Check your `.env` file for correct database credentials
- Make sure your SQL Server is running and accepting connections
- For Azure SQL, verify your IP is allowed in the firewall settings

### "Module not found" errors
- Run `npm install` again to ensure all dependencies are installed
- Make sure you're using Node.js version 14 or higher

### "Transport error" or "Connection refused"
- For HTTP/SSE transport, verify the PORT in your .env is available
- Make sure no firewall is blocking the connection

### Claude Desktop can't connect
- Double-check the path in your `claude_desktop_config.json`
- Ensure you're using absolute paths, not relative ones
- Restart Claude Desktop completely after making changes

## 📚 Understanding SQL Server Basics

If you're new to SQL Server, here are some key concepts:

- **Tables**: Store your data in rows and columns
- **Schemas**: Logical groupings of tables (like folders)
- **Queries**: Commands to retrieve or analyze data
- **Views**: Pre-defined queries saved for easy access

This tool helps you explore all of these without needing to be a SQL expert!

## 📝 License

ISC