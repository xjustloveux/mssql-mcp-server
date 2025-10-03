// lib/config.js - Centralized configuration management
import dotenv from 'dotenv';
import path from 'path';
import {logger} from './logger.mjs';

/**
 * Initialize environment variables from .env file
 * Supports loading different .env files based on environment parameter
 * @returns {string} - The loaded env file path
 */
export function initializeEnv() {
    const args = process.argv.slice(2);
    let envFile = '.env'; // 預設使用設定

    // 尋找是否傳入了 `-env` 參數
    const envIndex = args.findIndex(arg => arg === '-env');

    if (envIndex !== -1 && args[envIndex + 1]) {
        const envName = args[envIndex + 1]; // 獲取 `-env` 後面的值 (例如: 'sit')
        envFile = `env/${envName}`; // 構建檔案名稱 (例如: '.env.sit')
    }

    // Load environment variables
    const result = dotenv.config({path: envFile});

    if (result.error) {
        logger.warn(`Warning: Could not load ${envFile}, falling back to default environment variables`);
    } else {
        logger.info(`Configuration loaded from: ${envFile}`);
    }
}

/**
 * Get database configuration from environment variables
 * @returns {object} - Database configuration object
 */
export function getDatabaseConfig() {
    return {
        user: process.env.DB_USER || 'sa',
        password: process.env.DB_PASSWORD || 'YourStrong@Passw0rd',
        server: process.env.DB_SERVER || 'localhost',
        database: process.env.DB_DATABASE || 'master',
        port: parseInt(process.env.DB_PORT) || 1433,
        options: {
            encrypt: process.env.DB_ENCRYPT === 'true',
            trustServerCertificate: process.env.DB_TRUST_SERVER_CERT !== 'false',
            connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 15000,
            requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT) || 15000,
            pool: {
                max: parseInt(process.env.DB_POOL_MAX) || 10,
                min: parseInt(process.env.DB_POOL_MIN) || 0,
                idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT) || 30000
            }
        }
    };
}

/**
 * Get server configuration from environment variables
 * @returns {object} - Server configuration object
 */
export function getServerConfig() {
    return {
        port: process.env.PORT || 3333,
        transport: process.env.TRANSPORT || 'stdio',
        host: process.env.HOST || '0.0.0.0',
        pingInterval: process.env.PING_INTERVAL || 60000
    };
}

/**
 * Get path configuration from environment variables
 * @param {string} rootDir - Root directory path
 * @returns {object} - Paths configuration object
 */
export function getPathsConfig(rootDir) {
    return {
        queryResults: process.env.QUERY_RESULTS_PATH || path.join(rootDir, 'query_results')
    };
}

