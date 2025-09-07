/**
 * Environment configuration and validation
 */

const { logger } = require("../utils/logger");

/**
 * Load and validate environment configuration
 * @returns {Object} - Validated configuration object
 */
const loadConfig = () => {
  const config = {
    // Lambda configuration
    logLevel: process.env.LOG_LEVEL || "info",
    timeout: parseInt(process.env.TIMEOUT_MS) || 150000, // 2.5 minutes
    region: process.env.AWS_REGION || "us-east-1",

    // Chrome configuration
    chromeArgs: process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(",") : [],
    downloadPath: process.env.DOWNLOAD_PATH || "/tmp",

    // Service configuration
    maxRetries: parseInt(process.env.MAX_RETRIES) || 3,
    uploadTimeout: parseInt(process.env.UPLOAD_TIMEOUT_MS) || 60000,
    emailTimeout: parseInt(process.env.EMAIL_TIMEOUT_MS) || 30000,

    // Security configuration
    allowedDomains: process.env.ALLOWED_DOMAINS ? process.env.ALLOWED_DOMAINS.split(",") : [],
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE_MB) || 50,

    // Development configuration
    isDevelopment: process.env.NODE_ENV === "development",
    isLocal: process.env.IS_LOCAL === "true",
    mockServices: process.env.MOCK_SERVICES === "true",

    // Testing configuration
    testFrontendUrl: process.env.TEST_FRONTEND_URL || "https://app.test.com",
    testBackendUrl: process.env.TEST_BACKEND_URL || "https://api.test.com",
    testServiceEmail: process.env.TEST_SERVICE_EMAIL || "",
    testServicePassword: process.env.TEST_SERVICE_PASSWORD || "",
  };

  // Validate required configuration in production
  if (!config.isDevelopment && !config.isLocal) {
    const requiredEnvVars = ["AWS_REGION"];

    const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
    }
  }

  return config;
};

/**
 * Get Lambda memory configuration based on environment
 * @returns {Object} - Memory and timeout settings
 */
const getLambdaSettings = () => {
  const config = loadConfig();

  return {
    memorySize: 2048, // MB - Required for Chrome binary extraction
    timeout: Math.ceil(config.timeout / 1000), // Convert to seconds
    ephemeralStorageSize: 1024, // MB - For /tmp files
    runtime: "nodejs22.x",
    environment: {
      LOG_LEVEL: config.logLevel,
      TIMEOUT_MS: config.timeout.toString(),
      CHROME_ARGS: config.chromeArgs.join(","),
      MAX_RETRIES: config.maxRetries.toString(),
      UPLOAD_TIMEOUT_MS: config.uploadTimeout.toString(),
      EMAIL_TIMEOUT_MS: config.emailTimeout.toString(),
      MAX_FILE_SIZE_MB: config.maxFileSize.toString(),
      NODE_ENV: config.isDevelopment ? "development" : "production",
    },
  };
};

/**
 * Validate runtime environment for Lambda execution
 * @returns {Object} - Validation result
 */
const validateRuntimeEnvironment = () => {
  const issues = [];

  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.split(".")[0].substring(1));
  if (majorVersion < 18) {
    issues.push(`Node.js version ${nodeVersion} is not supported. Requires Node.js 18+`);
  }

  // Check memory limits
  if (process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE) {
    const memorySize = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE);
    if (memorySize < 2048) {
      issues.push(`Lambda memory ${memorySize}MB is insufficient. Requires 2048MB+ for Chrome`);
    }
  }

  // Check /tmp directory availability and space
  const fs = require("fs");
  const path = require("path");

  try {
    const tmpDir = "/tmp";
    const stats = fs.statSync(tmpDir);
    if (!stats.isDirectory()) {
      issues.push("/tmp is not available as a directory");
    }

    // Try to write a test file
    const testFile = path.join(tmpDir, "lambda-test-write");
    fs.writeFileSync(testFile, "test");
    fs.unlinkSync(testFile);
  } catch (error) {
    issues.push(`/tmp directory is not writable: ${error.message}`);
  }

  // Check environment variables format
  const config = loadConfig();
  if (config.chromeArgs.some((arg) => typeof arg !== "string")) {
    issues.push("CHROME_ARGS contains non-string values");
  }

  if (isNaN(config.timeout) || config.timeout <= 0) {
    issues.push("TIMEOUT_MS must be a positive number");
  }

  return {
    isValid: issues.length === 0,
    issues,
    nodeVersion,
    memorySize: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || "unknown",
  };
};

/**
 * Get optimized Chrome arguments for Lambda environment
 * @returns {Array} - Chrome arguments array
 */
const getChromeArgs = () => {
  const config = loadConfig();

  const baseArgs = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-chrome-extensions",
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=TranslateUI",
    "--disable-ipc-flooding-protection",
    "--single-process",
    "--no-zygote",
    "--disable-web-security",
    "--disable-features=VizDisplayCompositor",
  ];

  // Add custom args from environment
  return [...baseArgs, ...config.chromeArgs];
};

/**
 * Log current configuration (without sensitive data)
 */
const logConfiguration = () => {
  const config = loadConfig();
  const lambdaSettings = getLambdaSettings();

  logger.info("Lambda configuration loaded", {
    logLevel: config.logLevel,
    timeout: config.timeout,
    memorySize: lambdaSettings.memorySize,
    isDevelopment: config.isDevelopment,
    isLocal: config.isLocal,
    mockServices: config.mockServices,
    maxRetries: config.maxRetries,
    maxFileSize: config.maxFileSize,
    chromeArgsCount: config.chromeArgs.length,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  });
};

module.exports = {
  loadConfig,
  getLambdaSettings,
  validateRuntimeEnvironment,
  getChromeArgs,
  logConfiguration,
};
