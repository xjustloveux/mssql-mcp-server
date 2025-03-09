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
DEBUG=false                     # Set to 'true' for detailed logging (helpful for troubleshooting)
QUERY_RESULTS_PATH=/path/to/query_results  # Directory where query results will be saved as JSON files
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

## 🧠 Guide to Effective AI Prompts for Database Exploration

When working with Claude or other AI assistants through this MCP server, the way you phrase your requests significantly impacts the results. Here's how to help the AI use the database tools effectively:

### Essential Commands for AI Database Interaction

The AI can use these MCP commands when prompted properly:

#### 1. Database Discovery
```javascript
mcp__discover_database()
```
**When to suggest:** Start with this when the AI is unfamiliar with your database.
**Example prompt:** "Use the discover database tool to see what tables are available."

#### 2. Table Details
```javascript
mcp__table_details({ tableName: "YourTableName" })
```
**When to suggest:** When focusing on a specific table.
**Example prompt:** "Check the structure of the Orders table before querying it."

#### 3. Query Execution
```javascript
mcp__execute_query({ 
  sql: "SELECT * FROM YourTable WHERE Condition", 
  returnResults: true 
})
```
**When to suggest:** When you want to see query results directly in the conversation.
**Example prompt:** "Run a query to show me the most recent orders, and display the results here."

### Effective Prompting Patterns

#### Start with Structure, Then Query
```
First, discover what tables exist in my database. Then, look at the structure
of the Customers table. Finally, show me the top 10 customers by total purchase amount.
```

#### Guide the AI Through Complex Analysis
```
I need to analyze our sales data. First, check the structure of the Sales and Products tables.
Then, write a query that shows monthly sales totals by product category for the last quarter.
```

#### Ask for Explanations
```
Query the top 5 underperforming products based on sales vs. forecasts,
and explain your approach to writing this query.
```

### Advanced MCP Features

#### Viewing Large Result Sets
For large query results, the server saves them as JSON files. The AI will provide a UUID to access these results.

```javascript
mcp__get_query_results({ uuid: "provided-uuid-here" })
```
**Example prompt:** "Use the UUID from the previous query to show me the first 20 rows of that result set."

#### Generating Complex Queries
```
Help me create a query that shows customer retention rates by month, comparing
new vs. returning customers as a percentage of total sales.
```

#### Combining Multiple Tables
```
I need to analyze data across multiple tables. First, check the structure of
Orders, OrderDetails, and Products tables. Then create a query that shows
our top-selling products by revenue for each geographical region.
```

### Troubleshooting Through Prompts

If the AI is struggling with a database task, try these approaches:

1. **Be more specific about tables:** "Before writing that query, please check if the CustomerOrders table exists and what columns it has."

2. **Break complex tasks into steps:** "Let's approach this step by step. First, look at the Products table structure. Then, check the Orders table..."

3. **Ask for intermediate results:** "Run a simple query on that table first so we can verify the data format before trying more complex analysis."

4. **Request query explanations:** "After writing this query, explain what each part does so I can verify it's doing what I need."

## ⚙️ Environment Configuration Explained

The `.env` file controls how the MS SQL MCP Server connects to your database and operates. Here's a detailed explanation of each setting:

```
# Database Connection Settings
DB_USER=your_username           # SQL Server username
DB_PASSWORD=your_password       # SQL Server password
DB_SERVER=your_server_name      # Server hostname or IP address (example: localhost, 10.0.0.1, myserver.database.windows.net)
DB_DATABASE=your_database_name  # Name of the database to connect to

# Server Configuration
PORT=3333                       # Port for the HTTP/SSE server to listen on
TRANSPORT=stdio                 # Connection method: 'stdio' (for Claude Desktop) or 'sse' (for network connections)
SERVER_URL=http://localhost:3333 # Base URL when using SSE transport (must match your PORT setting)

# Advanced Settings
DEBUG=false                     # Set to 'true' for detailed logging (helpful for troubleshooting)
QUERY_RESULTS_PATH=/path/to/query_results  # Directory where query results will be saved as JSON files
```

### Connection Types Explained

#### stdio Transport
- Use when connecting directly with Claude Desktop
- Communication happens through standard input/output streams
- Set `TRANSPORT=stdio` in your .env file
- Run with `npm start`

#### HTTP/SSE Transport
- Use when connecting over a network (like with Cursor IDE)
- Uses Server-Sent Events (SSE) for real-time communication
- Set `TRANSPORT=sse` in your .env file
- Configure `SERVER_URL` to match your server address
- Run with `npm run start:sse`

### SQL Server Connection Examples

#### Local SQL Server
```
DB_USER=sa
DB_PASSWORD=YourStrongPassword
DB_SERVER=localhost
DB_DATABASE=AdventureWorks
```

#### Azure SQL Database
```
DB_USER=azure_admin@myserver
DB_PASSWORD=YourStrongPassword
DB_SERVER=myserver.database.windows.net
DB_DATABASE=AdventureWorks
```

### Query Results Storage

Query results are saved as JSON files in the directory specified by `QUERY_RESULTS_PATH`. This prevents large result sets from overwhelming the conversation. You can:

- Leave this blank to use the default `query-results` directory in the project
- Set a custom path like `/Users/username/Documents/query-results`
- Access saved results using the provided UUID in the tool response
