/**
 * Comprehensive error handling utilities for the Lambda function
 */

const { logger } = require("./logger");

/**
 * Custom error classes for different error types
 */
class LambdaError extends Error {
  constructor(message, statusCode = 500, errorCode = "INTERNAL_ERROR", context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.context = context;
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

class ValidationError extends LambdaError {
  constructor(message, details = [], context = {}) {
    super(message, 400, "VALIDATION_ERROR", { ...context, details });
  }
}

class AuthenticationError extends LambdaError {
  constructor(message, context = {}) {
    super(message, 401, "AUTHENTICATION_ERROR", context);
  }
}

class TimeoutError extends LambdaError {
  constructor(operation, timeoutMs, context = {}) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, 408, "TIMEOUT_ERROR", {
      ...context,
      operation,
      timeoutMs,
    });
  }
}

class ServiceUnavailableError extends LambdaError {
  constructor(service, message, context = {}) {
    super(`Service '${service}' is unavailable: ${message}`, 503, "SERVICE_UNAVAILABLE", {
      ...context,
      service,
    });
  }
}

class PDFGenerationError extends LambdaError {
  constructor(message, context = {}) {
    super(`PDF generation failed: ${message}`, 500, "PDF_GENERATION_ERROR", context);
  }
}

class UploadError extends LambdaError {
  constructor(message, context = {}) {
    super(`File upload failed: ${message}`, 500, "UPLOAD_ERROR", context);
  }
}

class EmailError extends LambdaError {
  constructor(message, context = {}) {
    super(`Email notification failed: ${message}`, 500, "EMAIL_ERROR", context);
  }
}

/**
 * Error handler utility class
 */
class ErrorHandler {
  constructor(requestId) {
    this.requestId = requestId;
  }

  /**
   * Handle and categorize errors
   * @param {Error} error - Error to handle
   * @param {Object} context - Additional context
   * @returns {Object} - Formatted error response
   */
  handleError(error, context = {}) {
    const errorContext = {
      ...context,
      requestId: this.requestId,
      timestamp: new Date().toISOString(),
    };

    // If it's already a LambdaError, just log and return
    if (error instanceof LambdaError) {
      logger.error("Lambda error occurred", {
        ...errorContext,
        error: error.toJSON(),
        stack: error.stack,
      });

      return this.formatErrorResponse(error);
    }

    // Categorize common error types
    const categorizedError = this.categorizeError(error, errorContext);

    logger.error("Error occurred and categorized", {
      ...errorContext,
      originalError: error.message,
      categorizedError: categorizedError.toJSON(),
      stack: error.stack,
    });

    return this.formatErrorResponse(categorizedError);
  }

  /**
   * Categorize unknown errors into specific error types
   * @param {Error} error - Original error
   * @param {Object} context - Error context
   * @returns {LambdaError} - Categorized error
   */
  categorizeError(error, context = {}) {
    const message = error.message.toLowerCase();

    // Timeout errors
    if (message.includes("timeout") || message.includes("timed out") || error.code === "ETIMEDOUT") {
      return new TimeoutError("operation", 180000, { originalError: error.message, ...context });
    }

    // Network/connection errors
    if (message.includes("econnrefused") || message.includes("enotfound") || message.includes("network")) {
      return new ServiceUnavailableError("external", error.message, context);
    }

    // Authentication errors
    if (message.includes("unauthorized") || message.includes("authentication") || error.code === 401) {
      return new AuthenticationError(error.message, context);
    }

    // Chrome/Puppeteer specific errors
    if (message.includes("chrome") || message.includes("browser") || message.includes("puppeteer")) {
      return new PDFGenerationError(error.message, { browserError: true, ...context });
    }

    // File system errors
    if (message.includes("enoent") || message.includes("eacces") || message.includes("file")) {
      return new LambdaError(error.message, 500, "FILE_SYSTEM_ERROR", context);
    }

    // Memory errors
    if (message.includes("out of memory") || message.includes("heap")) {
      return new LambdaError(error.message, 500, "MEMORY_ERROR", context);
    }

    // Default to internal error
    return new LambdaError(error.message, 500, "INTERNAL_ERROR", { originalError: error.message, ...context });
  }

  /**
   * Format error for API Gateway response
   * @param {LambdaError} error - Error to format
   * @returns {Object} - API Gateway response object
   */
  formatErrorResponse(error) {
    const isProduction = process.env.NODE_ENV === "production";

    return {
      statusCode: error.statusCode,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
      body: JSON.stringify({
        success: false,
        error: error.errorCode,
        message: error.message,
        requestId: this.requestId,
        timestamp: error.timestamp,
        ...(isProduction
          ? {}
          : {
              context: error.context,
              stack: error.stack,
            }),
      }),
    };
  }

  /**
   * Wrap async operations with timeout and error handling
   * @param {Function} operation - Async operation to wrap
   * @param {number} timeoutMs - Timeout in milliseconds
   * @param {string} operationName - Name for logging
   * @returns {Promise} - Wrapped operation
   */
  async withTimeout(operation, timeoutMs, operationName) {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new TimeoutError(operationName, timeoutMs, { requestId: this.requestId }));
      }, timeoutMs);

      try {
        const result = await operation();
        clearTimeout(timeout);
        resolve(result);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Retry operation with exponential backoff
   * @param {Function} operation - Operation to retry
   * @param {number} maxRetries - Maximum retry attempts
   * @param {string} operationName - Name for logging
   * @param {Function} shouldRetry - Function to determine if error should be retried
   * @returns {Promise} - Operation result
   */
  async withRetry(operation, maxRetries = 3, operationName = "operation", shouldRetry = null) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info(`Attempting ${operationName}`, {
          requestId: this.requestId,
          attempt,
          maxRetries,
        });

        const result = await operation();

        if (attempt > 1) {
          logger.info(`${operationName} succeeded on retry`, {
            requestId: this.requestId,
            attempt,
            totalAttempts: attempt,
          });
        }

        return result;
      } catch (error) {
        lastError = error;

        logger.error(`${operationName} attempt failed`, {
          requestId: this.requestId,
          attempt,
          maxRetries,
          error: error.message,
        });

        // Check if we should retry this error
        if (shouldRetry && !shouldRetry(error)) {
          logger.info(`Not retrying ${operationName} due to error type`, {
            requestId: this.requestId,
            errorType: error.constructor.name,
          });
          throw error;
        }

        // Don't retry on authentication or validation errors
        if (error instanceof AuthenticationError || error instanceof ValidationError) {
          throw error;
        }

        // Wait before retry with exponential backoff
        if (attempt < maxRetries) {
          const delay = Math.min(Math.pow(2, attempt - 1) * 1000, 10000); // Max 10s

          logger.info(`Waiting before retry`, {
            requestId: this.requestId,
            attempt,
            delay,
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    logger.error(`${operationName} failed after all retries`, {
      requestId: this.requestId,
      totalAttempts: maxRetries,
      finalError: lastError.message,
    });

    throw new LambdaError(
      `${operationName} failed after ${maxRetries} attempts: ${lastError.message}`,
      500,
      "RETRY_EXHAUSTED",
      { operationName, maxRetries, originalError: lastError.message }
    );
  }

  /**
   * Create a safe operation wrapper that catches and categorizes all errors
   * @param {Function} operation - Operation to wrap
   * @param {string} operationName - Name for logging
   * @param {Object} context - Additional context
   * @returns {Promise} - Wrapped operation
   */
  async safeOperation(operation, operationName, context = {}) {
    try {
      logger.info(`Starting ${operationName}`, {
        requestId: this.requestId,
        ...context,
      });

      const result = await operation();

      logger.info(`Completed ${operationName}`, {
        requestId: this.requestId,
        ...context,
      });

      return result;
    } catch (error) {
      logger.error(`${operationName} failed`, {
        requestId: this.requestId,
        error: error.message,
        ...context,
      });

      throw this.categorizeError(error, { operationName, ...context });
    }
  }
}

/**
 * Global error handler for uncaught exceptions
 */
const setupGlobalErrorHandling = () => {
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught exception", {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled promise rejection", {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });
    process.exit(1);
  });
};

module.exports = {
  ErrorHandler,
  LambdaError,
  ValidationError,
  AuthenticationError,
  TimeoutError,
  ServiceUnavailableError,
  PDFGenerationError,
  UploadError,
  EmailError,
  setupGlobalErrorHandling,
};
