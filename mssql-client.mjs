// mssql-client.mjs
import dotenv from 'dotenv';
import sql from 'mssql';

// Load environment variables
dotenv.config();

// Get configuration from environment variables
const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
    },
    connectionTimeout: 30000,
    requestTimeout: 30000,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

// Pool for reusing connections
let pool = null;

/**
 * Get a SQL Server client with connection pooling
 * @returns {Promise<sql.ConnectionPool>} Connected SQL client
 */
export async function getSqlServerClient() {
    if (!pool) {
        try {
            console.log('🔌 Creating new SQL Server connection pool');
            pool = await sql.connect(config);
            
            // Set up event handlers for the pool
            pool.on('error', err => {
                console.error('❌ SQL Pool Error:', err);
                pool = null; // Reset the pool on error
            });
            
            console.log('✅ Connected to SQL Server database');
        } catch (err) {
            console.error('❌ Failed to connect to SQL Server:', err.message);
            // For connection errors, log additional details that might help debugging
            if (err.code) {
                console.error(`   Error code: ${err.code}`);
            }
            if (err.originalError) {
                console.error(`   Original error: ${err.originalError.message}`);
            }
            throw err;
        }
    }
    
    return pool;
}

/**
 * Execute a query and get the results
 * @param {string} query - SQL query to execute
 * @param {Object} params - Query parameters
 * @returns {Promise<Array>} Query results
 */
export async function executeQuery(query, params = {}) {
    const client = await getSqlServerClient();
    
    try {
        console.log('🔍 Executing SQL query');
        const result = await client.request()
            .input('params', sql.NVarChar, JSON.stringify(params))
            .query(query);
        
        console.log(`✅ Query executed successfully, returned ${result.recordset?.length || 0} rows`);
        return result.recordset || [];
    } catch (err) {
        console.error('❌ Query execution error:', err.message);
        throw err;
    }
}

/**
 * Close the database connection pool
 */
export async function closeConnection() {
    if (pool) {
        try {
            await pool.close();
            console.log('🔌 SQL Server connection pool closed');
            pool = null;
        } catch (err) {
            console.error('❌ Error closing SQL Server connection:', err.message);
            throw err;
        }
    }
}

// Export the sql library for direct access if needed
export { sql };

/**
 * MS SQL Server client module
 * Provides a simple wrapper around the mssql library
 */

/**
 * Creates and returns an MS SQL Server client with a specific configuration
 * @param {Object} dbConfig - Database configuration options
 * @returns {Object} SQL Server client
 */
export function createSqlClient(dbConfig) {
    return {
        /**
         * Execute a query against MS SQL Server
         * @param {string} sqlQuery - SQL query to execute
         * @returns {Promise<Object>} Query result
         */
        executeQuery: async (sqlQuery) => {
            try {
                const pool = await sql.connect(dbConfig);
                try {
                    console.log(`Executing SQL: ${sqlQuery.substring(0, 100)}${sqlQuery.length > 100 ? '...' : ''}`);
                    const result = await pool.request().query(sqlQuery);
                    return result;
                } finally {
                    await pool.close();
                }
            } catch (err) {
                console.error('Database query error:', err);
                throw err;
            }
        },
        
        /**
         * Get a list of all tables in the database
         * @returns {Promise<Array>} List of table names
         */
        getTables: async () => {
            try {
                const pool = await sql.connect(dbConfig);
                try {
                    const result = await pool.request().query(`
                        SELECT 
                            TABLE_NAME,
                            TABLE_TYPE
                        FROM 
                            INFORMATION_SCHEMA.TABLES
                        ORDER BY 
                            TABLE_NAME
                    `);
                    return result.recordset.map(t => t.TABLE_NAME);
                } finally {
                    await pool.close();
                }
            } catch (err) {
                console.error('Error getting tables:', err);
                throw err;
            }
        },
        
        /**
         * Get schema information for the database
         * @returns {Promise<Array>} Schema information
         */
        getSchema: async () => {
            try {
                const pool = await sql.connect(dbConfig);
                try {
                    const result = await pool.request().query(`
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
                    return result.recordset;
                } finally {
                    await pool.close();
                }
            } catch (err) {
                console.error('Error getting schema:', err);
                throw err;
            }
        }
    };
} 