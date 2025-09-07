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
  const requiredFields = [
    "surveyId",
    "participantId",
    "adminEmails",
    "frontendUrl",
    "backendUrl",
    "serviceEmail",
    "servicePassword",
  ];

  for (const field of requiredFields) {
    if (!input[field]) {
      errors.push(`Missing required field: ${field}`);
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

  if (input.frontendUrl) {
    try {
      new URL(input.frontendUrl);
    } catch (e) {
      errors.push("frontendUrl must be a valid URL");
    }
  }

  if (input.backendUrl) {
    try {
      new URL(input.backendUrl);
    } catch (e) {
      errors.push("backendUrl must be a valid URL");
    }
  }

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
  isAllowedDomain,
};
