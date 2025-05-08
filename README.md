# MS SQL MCP Server 1.1

An easy-to-use bridge that lets AI assistants like Claude directly query and explore Microsoft SQL Server databases. No coding experience required!

## What Does This Tool Do?

This tool allows AI assistants to:
1. **Discover** tables in your SQL Server database
2. **View** table structures (columns, data types, etc.)
3. **Execute** read-only SQL queries safely
4. **Generate** SQL queries from natural language requests

## 🌟 Why You Need This Tool

### Bridge the Gap Between Your Data and AI
- **No Coding Required**: Give Claude and other AI assistants direct access to your SQL Server databases without writing complex integration code
- **Maintain Control**: All queries are read-only by default, ensuring your data remains safe
- **Private & Secure**: Your database credentials stay local and are never sent to external services

### Practical Benefits
- **Save Hours of Manual Work**: No more copy-pasting data or query results to share with AI
- **Deeper Analysis**: AI can navigate your entire database schema and provide insights across multiple tables
- **Natural Language Interface**: Ask questions about your data in plain English
- **End the Context Limit Problem**: Access large datasets that would exceed normal AI context windows

### Perfect For
- **Data Analysts** who want AI help interpreting SQL data without sharing credentials
- **Developers** looking for a quick way to explore database structure through natural conversation
- **Business Analysts** who need insights without SQL expertise
- **Database Administrators** who want to provide controlled access to AI tools

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
HOST=0.0.0.0                    # Host for the server to listen on, e.g., 'localhost' or '0.0.0.0'
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
   mcp_SQL_mcp_discover_database()
   ```

2. **Get detailed information about a specific table**
   ```javascript
   mcp_SQL_mcp_table_details({ tableName: "Customers" })
   ```

3. **Run a safe query**
   ```javascript
   mcp_SQL_mcp_execute_query({ sql: "SELECT TOP 10 * FROM Customers", returnResults: true })
   ```

4. **Find tables by name pattern**
   ```javascript
   mcp_SQL_mcp_discover_tables({ namePattern: "%user%" })
   ```

5. **Use pagination to navigate large result sets**
   ```javascript
   // First page
   mcp_SQL_mcp_execute_query({ 
     sql: "SELECT * FROM Users ORDER BY Username OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY", 
     returnResults: true 
   })
   
   // Next page
   mcp_SQL_mcp_execute_query({ 
     sql: "SELECT * FROM Users ORDER BY Username OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY", 
     returnResults: true 
   })
   ```

6. **Cursor-based pagination for optimal performance**
   ```javascript
   // First page
   mcp_SQL_mcp_execute_query({ 
     sql: "SELECT TOP 10 * FROM Users ORDER BY Username", 
     returnResults: true 
   })
   
   // Next page using the last value as cursor
   mcp_SQL_mcp_execute_query({ 
     sql: "SELECT TOP 10 * FROM Users WHERE Username > 'last_username' ORDER BY Username", 
     returnResults: true 
   })
   ```

7. **Ask natural language questions**
   ```
   "Show me the top 5 customers with the most orders in the last month"
   ```

## 💡 Real-World Applications

### For Business Intelligence
- **Sales Performance Analysis**: "Show me monthly sales trends for the past year and identify our top-performing products by region."
- **Customer Segmentation**: "Analyze our customer base by purchase frequency, average order value, and geographical location."
- **Financial Reporting**: "Create a quarterly profit and loss report comparing this year to last year."

### For Database Management
- **Schema Optimization**: "Help me identify tables with missing indexes by examining query performance data."
- **Data Quality Auditing**: "Find all customer records with incomplete information or invalid values."
- **Usage Analysis**: "Show me which tables are most frequently accessed and what queries are most resource-intensive."

### For Development
- **API Exploration**: "I'm building an API - help me analyze the database schema to design appropriate endpoints."
- **Query Optimization**: "Review this complex query and suggest performance improvements."
- **Database Documentation**: "Create comprehensive documentation of our database structure with explanations of relationships."

## 🖥️ Interactive Client Features

The bundled client provides an easy menu-driven interface:

1. **List available resources** - See what information is available
2. **List available tools** - See what actions you can perform
3. **Execute SQL query** - Run a read-only SQL query
4. **Get table details** - View structure of any table
5. **Read database schema** - See all tables and their relationships
6. **Generate SQL query** - Convert natural language to SQL

## 🧠 Effective Prompting & Tool Usage Guide

When working with Claude or other AI assistants through this MCP server, the way you phrase your requests significantly impacts the results. Here's how to help the AI use the database tools effectively:

### Basic Tool Call Format

When prompting an AI to use this tool, follow this structure:

```
Can you use the SQL MCP tools to [your goal]?

For example:
- Check what tables exist in my database
- Query the Customers table and show me the first 10 records
- Find all orders from the past month
```

### Essential Commands & Syntax

Here are the main tools and their correct syntax:

```javascript
// Discover the database structure
mcp_SQL_mcp_discover_database()

// Get detailed information about a specific table
mcp_SQL_mcp_table_details({ tableName: "YourTableName" })

// Execute a query and return results
mcp_SQL_mcp_execute_query({ 
  sql: "SELECT * FROM YourTable WHERE Condition", 
  returnResults: true 
})

// Find tables by name pattern
mcp_SQL_mcp_discover_tables({ namePattern: "%pattern%" })

// Access saved query results (for large result sets)
mcp_SQL_mcp_get_query_results({ uuid: "provided-uuid-here" })
```

**When to use each tool:**
- **Database Discovery**: Start with this when the AI is unfamiliar with your database structure.
- **Table Details**: Use when focusing on a specific table before writing queries.
- **Query Execution**: When you need to retrieve or analyze actual data.
- **Table Discovery by Pattern**: When looking for tables related to a specific domain.

### Effective Prompting Patterns

#### Step-by-Step Workflows
For complex tasks, guide the AI through a series of steps:

```
I'd like to analyze our sales data. Please:
1. First use mcp_SQL_mcp_discover_tables to find tables related to sales
2. Use mcp_SQL_mcp_table_details to examine the structure of relevant tables
3. Create a query with mcp_SQL_mcp_execute_query that shows monthly sales by product category
```

#### Structure First, Then Query
```
First, discover what tables exist in my database. Then, look at the structure
of the Customers table. Finally, show me the top 10 customers by total purchase amount.
```

#### Ask for Explanations
```
Query the top 5 underperforming products based on sales vs. forecasts,
and explain your approach to writing this query.
```

### SQL Server Dialect Notes

Remind the AI about SQL Server's specific syntax:

```
Please use SQL Server syntax for pagination:
- For offset/fetch: "OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY"
- For cursor-based: "WHERE ID > last_id ORDER BY ID"
```

### Correcting Tool Usage

If the AI uses incorrect syntax, you can help it with:

```
That's not quite right. Please use this format for the tool call:
mcp_SQL_mcp_execute_query({ 
  sql: "SELECT * FROM Customers WHERE Region = 'West'",
  returnResults: true
})
```

### Troubleshooting Through Prompts

If the AI is struggling with a database task, try these approaches:

1. **Be more specific about tables:** "Before writing that query, please check if the CustomerOrders table exists and what columns it has."

2. **Break complex tasks into steps:** "Let's approach this step by step. First, look at the Products table structure. Then, check the Orders table..."

3. **Ask for intermediate results:** "Run a simple query on that table first so we can verify the data format before trying more complex analysis."

4. **Request query explanations:** "After writing this query, explain what each part does so I can verify it's doing what I need."

## 🔎 Advanced Query Capabilities

### Table Discovery & Exploration

The MCP Server provides powerful tools for exploring your database structure:

- **Pattern-based table discovery**: Find tables matching specific patterns
  ```javascript
  mcp_SQL_mcp_discover_tables({ namePattern: "%order%" })
  ```

- **Schema overview**: Get a high-level view of tables by schema
  ```javascript
  mcp_SQL_mcp_execute_query({ 
    sql: "SELECT TABLE_SCHEMA, COUNT(*) AS TableCount FROM INFORMATION_SCHEMA.TABLES GROUP BY TABLE_SCHEMA" 
  })
  ```

- **Column exploration**: Examine column metadata for any table
  ```javascript
  mcp_SQL_mcp_table_details({ tableName: "dbo.Users" })
  ```

### Pagination Techniques

The server supports multiple pagination methods for handling large datasets:

1. **Offset/Fetch Pagination**: Standard SQL pagination using OFFSET and FETCH
   ```javascript
   mcp_SQL_mcp_execute_query({ 
     sql: "SELECT * FROM Users ORDER BY Username OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY" 
   })
   ```

2. **Cursor-Based Pagination**: More efficient for large datasets
   ```javascript
   // Get first page
   mcp_SQL_mcp_execute_query({ 
     sql: "SELECT TOP 10 * FROM Users ORDER BY Username" 
   })
   
   // Get next page using last value as cursor
   mcp_SQL_mcp_execute_query({ 
     sql: "SELECT TOP 10 * FROM Users WHERE Username > 'last_username' ORDER BY Username" 
   })
   ```

3. **Count with Data**: Retrieve total count alongside paginated data
   ```javascript
   mcp_SQL_mcp_execute_query({ 
     sql: "WITH TotalCount AS (SELECT COUNT(*) AS Total FROM Users) SELECT TOP 10 u.*, t.Total FROM Users u CROSS JOIN TotalCount t ORDER BY Username" 
   })
   ```

### Complex Joins & Relationships

Explore relationships between tables with join operations:

```javascript
mcp_SQL_mcp_execute_query({ 
  sql: "SELECT u.Username, u.Email, r.RoleName FROM Users u JOIN UserRoles ur ON u.Username = ur.Username JOIN Roles r ON ur.RoleId = r.RoleId ORDER BY u.Username"
})
```

### Analytical Queries

Run aggregations and analytical queries to gain insights:

```javascript
mcp_SQL_mcp_execute_query({ 
  sql: "SELECT UserType, COUNT(*) AS UserCount, SUM(CASE WHEN IsActive = 1 THEN 1 ELSE 0 END) AS ActiveUsers FROM Users GROUP BY UserType"
})
```

### Using SQL Server Features

The MCP server supports SQL Server-specific features:

- **Common Table Expressions (CTEs)**
- **Window functions**
- **JSON operations**
- **Hierarchical queries**
- **Full-text search** (when configured in your database)

## 🔗 Integration Options

### Claude Desktop Integration

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

### Connecting with Cursor IDE

Cursor is an AI-powered code editor that can leverage this tool for advanced database interactions. Here's how to set it up:

#### Setup in Cursor

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

#### Using Database Commands in Cursor

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

#### Troubleshooting Cursor Connection

- Make sure the MS SQL MCP Server is running with the HTTP/SSE transport
- Check that the port is correct and matches what's in your .env file
- Ensure your firewall isn't blocking the connection
- If using a different IP/hostname, update the SERVER_URL in your .env file

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

## 🏗️ Architecture & Core Modules

The MS SQL MCP Server is built with a modular architecture that separates concerns for maintainability and extensibility:

### Core Modules

#### `database.mjs` - Database Connectivity
- Manages SQL Server connection pooling
- Provides query execution with retry logic and error handling
- Handles database connections, transactions, and configuration
- Includes utilities for sanitizing SQL and formatting errors

#### `tools.mjs` - Tool Registration
- Registers all database tools with the MCP server
- Implements tool validation and parameter checking
- Provides core functionality for SQL queries, table exploration, and database discovery
- Maps tool calls to database operations

#### `resources.mjs` - Database Resources
- Exposes database metadata through resource endpoints
- Provides schema information, table listings, and procedure documentation
- Formats database structure information for AI consumption
- Includes discovery utilities for database exploration

#### `pagination.mjs` - Results Navigation
- Implements cursor-based pagination for large result sets
- Provides utilities for generating next/previous page cursors
- Transforms SQL queries to support pagination
- Handles SQL Server's OFFSET/FETCH pagination syntax

#### `errors.mjs` - Error Handling
- Defines custom error types for different failure scenarios
- Implements JSON-RPC error formatting
- Provides human-readable error messages
- Includes middleware for global error handling

#### `logger.mjs` - Logging System
- Configures Winston logging with multiple transports
- Provides context-aware request logging
- Handles log rotation and formatting
- Captures uncaught exceptions and unhandled rejections

### How These Modules Work Together

1. When a tool call is received, the MCP server routes it to the appropriate handler in `tools.mjs`
2. The tool handler validates parameters and constructs a database query
3. The query is executed via functions in `database.mjs`, with possible pagination from `pagination.mjs`
4. Results are formatted and returned to the client
5. Any errors are caught and processed through `errors.mjs`
6. All operations are logged via `logger.mjs`

This architecture ensures:
- Clean separation of concerns
- Consistent error handling
- Comprehensive logging
- Efficient database connection management
- Scalable query execution

## ⚙️ Environment Configuration Explained

The `.env` file controls how the MS SQL MCP Server connects to your database and operates. Here's a detailed explanation of each setting:

```
# Database Connection Settings
DB_USER=your_username           # SQL Server username
DB_PASSWORD=your_password       # SQL Server password
DB_SERVER=your_server_name_or_ip
DB_DATABASE=your_database_name

# Server Configuration
PORT=3333                       # Port for the HTTP/SSE server to listen on
HOST=0.0.0.0                    # Host for the server to listen on, e.g., 'localhost' or '0.0.0.0'
TRANSPORT=stdio                 # Connection method: 'stdio' (for Claude Desktop) or 'sse' (for network connections)
SERVER_URL=http://localhost:3333 # Base URL when using SSE transport. If HOST is '0.0.0.0', external clients use http://<your-machine-ip>:${PORT}

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

## 📝 License

ISC
