/**
 * Centralized logging utility for the Lambda function
 */

const LOG_LEVEL = process.env.LOG_LEVEL || "info";

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const shouldLog = (level) => {
  return LOG_LEVELS[level] <= LOG_LEVELS[LOG_LEVEL];
};

const formatLogEntry = (level, message, metadata = {}) => {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level: level.toUpperCase(),
    message,
    ...metadata,
  };

  return JSON.stringify(entry);
};

const logger = {
  error: (message, metadata = {}) => {
    if (shouldLog("error")) {
      console.error(formatLogEntry("error", message, metadata));
    }
  },

  warn: (message, metadata = {}) => {
    if (shouldLog("warn")) {
      console.warn(formatLogEntry("warn", message, metadata));
    }
  },

  info: (message, metadata = {}) => {
    if (shouldLog("info")) {
      console.log(formatLogEntry("info", message, metadata));
    }
  },

  debug: (message, metadata = {}) => {
    if (shouldLog("debug")) {
      console.log(formatLogEntry("debug", message, metadata));
    }
  },
};

module.exports = { logger };
