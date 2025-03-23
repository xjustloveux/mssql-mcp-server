// lib/logger.js - Logging utilities
import winston from 'winston';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';

dotenv.config();

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, '../logs/mcp-server.log');
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '10m';
const LOG_MAX_FILES = parseInt(process.env.LOG_MAX_FILES) || 5;
const LOG_FORMAT = process.env.LOG_FORMAT || 'json';

// Create logs directory if it doesn't exist
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Define log formats
const logFormats = {
    console: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, ...metadata }) => {
            let metaStr = '';
            if (Object.keys(metadata).length > 0 && metadata.service !== 'mcp-server') {
                metaStr = JSON.stringify(metadata);
            }
            return `[${timestamp}] ${level}: ${message} ${metaStr}`;
        })
    ),
    json: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    simple: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp }) => {
            return `[${timestamp}] ${level}: ${message}`;
        })
    )
};

// Create Winston logger
export const logger = winston.createLogger({
    level: LOG_LEVEL,
    defaultMeta: { service: 'mcp-server' },
    format: logFormats[LOG_FORMAT] || logFormats.json,
    transports: [
        // Console transport
        new winston.transports.Console(),
        
        // File transport with rotation
        new winston.transports.File({
            filename: LOG_FILE,
            maxsize: LOG_MAX_SIZE,
            maxFiles: LOG_MAX_FILES,
            tailable: true
        })
    ],
    exitOnError: false // Don't crash on exception
});

// Create a stream object for Morgan HTTP logging
export const logStream = {
    write: message => {
        logger.http(message.trim());
    }
};

// Add request context middleware for Express
export const addRequestContext = (req, res, next) => {
    // Add a unique request ID if not present
    req.id = req.headers['x-request-id'] || crypto.randomUUID();
    
    // Add correlation ID for tracing
    const correlationId = req.headers['x-correlation-id'] || req.id;
    
    // Add request context to logger
    logger.defaultMeta = {
        ...logger.defaultMeta,
        requestId: req.id,
        correlationId,
        method: req.method,
        url: req.url
    };
    
    // Add response headers for tracing
    res.setHeader('X-Request-ID', req.id);
    res.setHeader('X-Correlation-ID', correlationId);
    
    next();
};

// Log uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
    logger.error(`Uncaught Exception: ${error.message}`, {
        stack: error.stack,
        name: error.name
    });
    
    // Exit with error
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', {
        promise: promise,
        reason: reason
    });
});

// Export logger
export default logger;