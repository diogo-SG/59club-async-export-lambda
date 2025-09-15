/**
 * Input validation utilities
 */

/**
 * Validates the input parameters for the Lambda function
 * @param {Object} input - Input parameters
 * @returns {Object} - Validation result
 */
const validateInput = (input) => {
  const errors = [];

  // Check required fields
  const requiredFields = ["surveyId", "participantId", "adminEmails", "env"];

  for (const field of requiredFields) {
    if (!input[field]) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // Check service credentials - use environment variables as fallback
  if (!input.serviceEmail && !process.env.SERVICE_EMAIL) {
    errors.push("serviceEmail must be provided in request or SERVICE_EMAIL environment variable must be set");
  }

  if (!input.servicePassword && !process.env.SERVICE_PASSWORD) {
    errors.push("servicePassword must be provided in request or SERVICE_PASSWORD environment variable must be set");
  }

  // Validate environment
  if (input.env) {
    const validEnvironments = ["local", "dev", "qa", "staging", "prod"];
    if (!validEnvironments.includes(input.env)) {
      errors.push(`Invalid environment: ${input.env}. Must be one of: ${validEnvironments.join(", ")}`);
    }
  }

  // Validate specific field types and formats
  if (input.surveyId && typeof input.surveyId !== "string") {
    errors.push("surveyId must be a string");
  }

  if (input.participantId && typeof input.participantId !== "string") {
    errors.push("participantId must be a string");
  }

  if (input.adminEmails) {
    if (!Array.isArray(input.adminEmails)) {
      errors.push("adminEmails must be an array");
    } else if (input.adminEmails.length === 0) {
      errors.push("adminEmails array cannot be empty");
    } else {
      // Validate email formats
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const email of input.adminEmails) {
        if (typeof email !== "string" || !emailRegex.test(email)) {
          errors.push(`Invalid email format: ${email}`);
        }
      }
    }
  }

  // Environment validation is handled above

  if (input.serviceEmail && typeof input.serviceEmail !== "string") {
    errors.push("serviceEmail must be a string");
  }

  if (input.servicePassword && typeof input.servicePassword !== "string") {
    errors.push("servicePassword must be a string");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Sanitizes input by removing potentially dangerous characters
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
const sanitizeString = (input) => {
  if (typeof input !== "string") return input;

  // Remove potentially dangerous characters for file names and URLs
  return input.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
};

/**
 * Get frontend and backend URLs based on environment
 * @param {string} env - Environment name (local, dev, qa, staging, prod)
 * @returns {Object} - URLs for frontend and backend
 */
const getEnvironmentUrls = (env) => {
  const urlMappings = {
    local: {
      frontendUrl: "https://dev.survey.59club.studiographene.xyz",
      backendUrl: "https://dev.surveyapi.59club.studiographene.xyz/api",
    },
    dev: {
      frontendUrl: "https://dev.survey.59club.studiographene.xyz",
      backendUrl: "https://dev.surveyapi.59club.studiographene.xyz/api",
    },
    qa: {
      frontendUrl: "https://qa.survey.59club.studiographene.xyz",
      backendUrl: "https://qa.surveyapi.59club.studiographene.xyz/api",
    },
    staging: {
      frontendUrl: "https://staging.surveys.59club.com",
      backendUrl: "https://staging.api.surveys.59club.com/api",
    },
    prod: {
      frontendUrl: "https://staging.surveys.59club.com", // TBC, using staging for now
      backendUrl: "https://staging.api.surveys.59club.com/api", // TBC, using staging for now
    },
  };

  return urlMappings[env] || urlMappings.staging; // Default to staging if unknown env
};

/**
 * Validates URL is from allowed domains (security measure)
 * @param {string} url - URL to validate
 * @param {Array} allowedDomains - Array of allowed domain patterns
 * @returns {boolean} - Whether URL is allowed
 */
const isAllowedDomain = (url, allowedDomains = []) => {
  if (!allowedDomains.length) return true; // If no restrictions, allow all

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    return allowedDomains.some((domain) => {
      if (domain.startsWith("*.")) {
        // Wildcard subdomain matching
        const baseDomain = domain.slice(2);
        return hostname === baseDomain || hostname.endsWith("." + baseDomain);
      }
      return hostname === domain.toLowerCase();
    });
  } catch (e) {
    return false;
  }
};

module.exports = {
  validateInput,
  sanitizeString,
  getEnvironmentUrls,
  isAllowedDomain,
};
