const axios = require("axios");
const { logger } = require("../utils/logger");

/**
 * Service for sending email notifications via backend API
 */
class EmailService {
  constructor(backendUrl, accessToken, requestId) {
    this.backendUrl = backendUrl;
    this.accessToken = accessToken;
    this.requestId = requestId;
    this.emailEndpoint = `${backendUrl}/notifications/email`;
    this.timeout = 30000; // 30 seconds for email sending
  }

  /**
   * Send email notifications to admin recipients
   * @param {Object} params - Email parameters
   * @returns {Object} - Email sending result
   */
  async sendNotifications(params) {
    const { adminEmails, pdfUrl, surveyId, participantId } = params;

    logger.info("Starting email notifications", {
      requestId: this.requestId,
      recipientCount: adminEmails.length,
      surveyId,
      participantId,
      pdfUrl,
    });

    try {
      // Prepare email data
      const emailData = {
        recipients: adminEmails,
        subject: `Survey Export Ready - Survey ${surveyId}`,
        template: "survey_export_notification",
        data: {
          surveyId,
          participantId,
          pdfUrl,
          exportDate: new Date().toISOString(),
          downloadLink: pdfUrl,
        },
      };

      // Send email via backend API
      const response = await axios.post(this.emailEndpoint, emailData, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: this.timeout,
      });

      // Validate response
      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Email API returned status: ${response.status}`);
      }

      const result = response.data;

      logger.info("Email notifications sent successfully", {
        requestId: this.requestId,
        emailsSent: result.sent || adminEmails.length,
        messageId: result.messageId,
        responseStatus: response.status,
      });

      return {
        success: true,
        emailsSent: result.sent || adminEmails.length,
        messageId: result.messageId,
        recipients: adminEmails,
      };
    } catch (error) {
      logger.error("Email notifications failed", {
        requestId: this.requestId,
        error: error.message,
        endpoint: this.emailEndpoint,
        recipientCount: adminEmails.length,
        errorCode: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
      });

      // Provide more specific error messages
      if (error.code === "ECONNREFUSED") {
        throw new Error("Unable to connect to email service");
      } else if (error.code === "ETIMEDOUT") {
        throw new Error("Email service timeout exceeded");
      } else if (error.response?.status === 401) {
        throw new Error("Email service authentication failed");
      } else if (error.response?.status === 429) {
        throw new Error("Email service rate limit exceeded");
      } else if (error.response?.status >= 500) {
        throw new Error("Email service temporarily unavailable");
      } else {
        throw new Error(`Email sending failed: ${error.message}`);
      }
    }
  }

  /**
   * Send individual email notification
   * @param {string} email - Recipient email
   * @param {Object} emailData - Email content data
   * @returns {Object} - Email sending result
   */
  async sendSingleNotification(email, emailData) {
    try {
      logger.info("Sending individual email notification", {
        requestId: this.requestId,
        recipient: email,
        subject: emailData.subject,
      });

      const response = await axios.post(
        this.emailEndpoint,
        {
          ...emailData,
          recipients: [email],
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: this.timeout,
        }
      );

      const success = response.status < 400;

      logger.info("Individual email notification result", {
        requestId: this.requestId,
        recipient: email,
        success,
        status: response.status,
      });

      return {
        success,
        email,
        messageId: response.data?.messageId,
        status: response.status,
      };
    } catch (error) {
      logger.error("Individual email notification failed", {
        requestId: this.requestId,
        recipient: email,
        error: error.message,
      });

      return {
        success: false,
        email,
        error: error.message,
      };
    }
  }

  /**
   * Send email notifications with retry logic
   * @param {Object} params - Email parameters
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Object} - Email sending result with retry info
   */
  async sendNotificationsWithRetry(params, maxRetries = 3) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.info("Email notification attempt", {
          requestId: this.requestId,
          attempt,
          maxRetries,
        });

        const result = await this.sendNotifications(params);

        logger.info("Email notifications succeeded on attempt", {
          requestId: this.requestId,
          attempt,
          emailsSent: result.emailsSent,
        });

        return {
          ...result,
          attempt,
          totalAttempts: attempt,
        };
      } catch (error) {
        lastError = error;

        logger.error("Email notification attempt failed", {
          requestId: this.requestId,
          attempt,
          maxRetries,
          error: error.message,
        });

        // Don't retry on authentication errors
        if (error.message.includes("authentication") || error.message.includes("401")) {
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s...
          logger.info("Waiting before retry", {
            requestId: this.requestId,
            attempt,
            delay,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries failed
    logger.error("All email notification attempts failed", {
      requestId: this.requestId,
      totalAttempts: maxRetries,
      finalError: lastError.message,
    });

    throw new Error(`Email notifications failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Verify email service is accessible
   * @returns {boolean} - Whether service is accessible
   */
  async verifyEmailService() {
    try {
      logger.info("Verifying email service", {
        requestId: this.requestId,
        endpoint: this.emailEndpoint,
      });

      const response = await axios.head(this.emailEndpoint, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 10000,
      });

      const isAccessible = response.status < 400;

      logger.info("Email service verification result", {
        requestId: this.requestId,
        isAccessible,
        status: response.status,
      });

      return isAccessible;
    } catch (error) {
      logger.error("Email service verification failed", {
        requestId: this.requestId,
        error: error.message,
        status: error.response?.status,
      });

      return false;
    }
  }

  /**
   * Get email template preview
   * @param {string} templateName - Template name
   * @param {Object} templateData - Template data
   * @returns {Object} - Template preview
   */
  async getTemplatePreview(templateName, templateData) {
    try {
      const previewEndpoint = `${this.backendUrl}/notifications/email/preview`;

      const response = await axios.post(
        previewEndpoint,
        {
          template: templateName,
          data: templateData,
        },
        {
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      return response.data;
    } catch (error) {
      logger.error("Failed to get email template preview", {
        requestId: this.requestId,
        templateName,
        error: error.message,
      });

      return null;
    }
  }
}

module.exports = { EmailService };
