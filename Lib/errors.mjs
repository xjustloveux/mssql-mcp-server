// lib/errors.js - Error handling utilities
import { logger } from './logger.mjs';

/**
 * JSON-RPC 2.0 error codes
 * @see https://www.jsonrpc.org/specification#error_object
 */
export const JsonRpcErrorCodes = {
    PARSE_ERROR: -32700,         // Invalid JSON was received
    INVALID_REQUEST: -32600,     // The JSON sent is not a valid Request object
    METHOD_NOT_FOUND: -32601,    // The method does not exist / is not available
    INVALID_PARAMS: -32602,      // Invalid method parameter(s)
    INTERNAL_ERROR: -32603,      // Internal JSON-RPC error
    
    // Server error codes (reserved from -32000 to -32099)
    SERVER_ERROR_START: -32099,
    SERVER_ERROR_END: -32000,
    
    // Custom error codes (below -32100)
    AUTHENTICATION_ERROR: -32100,
    AUTHORIZATION_ERROR: -32101,
    RATE_LIMIT_EXCEEDED: -32102,
    RESOURCE_NOT_FOUND: -32103,
    TOOL_EXECUTION_ERROR: -32104,
    DATABASE_ERROR: -32105,
    VALIDATION_ERROR: -32106
};

/**
 * Create a JSON-RPC 2.0 error object
 * @param {number} code - Error code
 * @param {string} message - Error message
 * @param {*} data - Additional data (optional)
 * @returns {object} - JSON-RPC error object
 */
export function createJsonRpcError(code, message, data = undefined) {
    const error = {
        code,
        message
    };
    
    if (data !== undefined) {
        error.data = data;
    }
    
    return error;
}

/**
 * Create a standard error response for HTTP endpoints
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {*} details - Additional details (optional)
 * @returns {object} - Error response object
 */
export function createErrorResponse(statusCode, message, details = undefined) {
    const response = {
        error: {
            status: statusCode,
            message
        }
    };
    
    if (details !== undefined) {
        response.error.details = details;
    }
    
    return response;
}

/**
 * Get a readable error message from any error
 * @param {Error} error - Error object
 * @returns {string} - Human-readable error message
 */
export function getReadableErrorMessage(error) {
    if (!error) {
        return 'Unknown error occurred';
    }
    
    // Handle specific types of errors
    if (error.code === 'ECONNREFUSED') {
        return 'Unable to connect to the database. Please check your database configuration.';
    }
    
    if (error.code === 'ETIMEDOUT') {
        return 'Connection to the database timed out. Please try again later.';
    }
    
    if (error.name === 'ValidationError') {
        return `Validation error: ${error.message}`;
    }
    
    if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
        return 'Invalid JSON format in the request';
    }
    
    return error.message || 'An unknown error occurred';
}

/**
 * Custom error class for MCP server errors
 */
export class McpError extends Error {
    /**
     * Create a new MCP error
     * @param {string} message - Error message
     * @param {number} code - Error code
     * @param {*} data - Additional data
     */
    constructor(message, code = JsonRpcErrorCodes.INTERNAL_ERROR, data = undefined) {
        super(message);
        this.name = 'McpError';
        this.code = code;
        this.data = data;
    }
    
    /**
     * Convert to JSON-RPC error object
     * @returns {object} - JSON-RPC error object
     */
    toJsonRpcError() {
        return createJsonRpcError(this.code, this.message, this.data);
    }
}

/**
 * Custom error for validation failures
 */
export class ValidationError extends McpError {
    /**
     * Create a new validation error
     * @param {string} message - Error message
     * @param {*} validationDetails - Validation details
     */
    constructor(message, validationDetails = undefined) {
        super(message, JsonRpcErrorCodes.VALIDATION_ERROR, validationDetails);
        this.name = 'ValidationError';
    }
}

/**
 * Custom error for resource not found
 */
export class ResourceNotFoundError extends McpError {
    /**
     * Create a new resource not found error
     * @param {string} resourceType - Type of resource
     * @param {string} resourceId - ID of the resource
     */
    constructor(resourceType, resourceId) {
        super(
            `Resource not found: ${resourceType} with ID ${resourceId}`,
            JsonRpcErrorCodes.RESOURCE_NOT_FOUND,
            { resourceType, resourceId }
        );
        this.name = 'ResourceNotFoundError';
    }
}

/**
 * Custom error for tool execution failures
 */
export class ToolExecutionError extends McpError {
    /**
     * Create a new tool execution error
     * @param {string} toolName - Name of the tool
     * @param {string} message - Error message
     * @param {*} details - Additional details
     */
    constructor(toolName, message, details = undefined) {
        super(
            `Tool execution failed: ${toolName} - ${message}`,
            JsonRpcErrorCodes.TOOL_EXECUTION_ERROR,
            { toolName, details }
        );
        this.name = 'ToolExecutionError';
    }
}

/**
 * Global error handler middleware for Express
 * @param {Error} err - Error object
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Express next function
 */
export function errorHandler(err, req, res, next) {
    // Log the error
    logger.error(`Error processing request: ${err.message}`, {
        stack: err.stack,
        path: req.path,
        method: req.method,
        requestId: req.id
    });
    
    // Determine if this is a JSON-RPC request
    const isJsonRpc = req.headers['content-type']?.includes('application/json') && 
                     (req.body?.jsonrpc === '2.0' || req.body?.id);
    
    if (isJsonRpc) {
        // Handle as JSON-RPC error
        const jsonRpcId = req.body?.id || null;
        
        // Determine error code and message
        let errorCode = JsonRpcErrorCodes.INTERNAL_ERROR;
        let errorMessage = getReadableErrorMessage(err);
        let errorData = undefined;
        
        // Handle specific error types
        if (err instanceof McpError) {
            errorCode = err.code;
            errorData = err.data;
        } else if (err.name === 'SyntaxError' && err.message.includes('JSON')) {
            errorCode = JsonRpcErrorCodes.PARSE_ERROR;
        } else if (err.name === 'ValidationError') {
            errorCode = JsonRpcErrorCodes.INVALID_PARAMS;
        }
        
        // Send JSON-RPC error response
        res.status(200).json({
            jsonrpc: '2.0',
            id: jsonRpcId,
            error: createJsonRpcError(errorCode, errorMessage, errorData)
        });
    } else {
        // Handle as regular HTTP error
        const statusCode = err.statusCode || 500;
        
        // Send HTTP error response
        res.status(statusCode).json(
            createErrorResponse(statusCode, getReadableErrorMessage(err))
        );
    }
}