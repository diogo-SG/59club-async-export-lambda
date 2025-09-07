const { logger } = require("./utils/logger");
const { validateInput, getEnvironmentUrls } = require("./utils/validation");
const { PuppeteerService } = require("./services/puppeteer-service");
const { UploadService } = require("./services/upload-service");
const { EmailService } = require("./services/email-service");

/**
 * AWS Lambda handler for PDF export generation
 * @param {Object} event - API Gateway event
 * @param {Object} context - Lambda context
 * @returns {Object} - API Gateway response
 */
exports.handler = async (event, context) => {
  const startTime = Date.now();
  const requestId = context.awsRequestId;

  logger.info("Lambda function started", { requestId, event: JSON.stringify(event) });

  try {
    // Parse input from API Gateway
    const input = event.body ? JSON.parse(event.body) : event;

    // Validate input parameters
    const validation = validateInput(input);
    if (!validation.isValid) {
      logger.error("Input validation failed", { requestId, errors: validation.errors });
      return {
        statusCode: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        body: JSON.stringify({
          success: false,
          error: "Invalid input parameters",
          details: validation.errors,
        }),
      };
    }

    const { surveyId, participantId, adminEmails, env, serviceEmail, servicePassword } = input;

    // Get URLs based on environment
    const { frontendUrl, backendUrl } = getEnvironmentUrls(env);

    // Use service credentials from request or fall back to environment variables
    const finalServiceEmail = serviceEmail || process.env.SERVICE_EMAIL;
    const finalServicePassword = servicePassword || process.env.SERVICE_PASSWORD;

    logger.info("Processing PDF export request", {
      requestId,
      surveyId,
      participantId,
      adminEmailCount: adminEmails.length,
      environment: env,
      frontendUrl,
      backendUrl,
      serviceEmail: finalServiceEmail,
    });

    // Initialize services (upload and email services will get access token after PDF generation)
    const puppeteerService = new PuppeteerService(requestId);

    let browser = null;
    let pdfBuffer = null;
    let pdfUrl = null;
    let accessToken = null;

    try {
      // Step 1: Generate PDF using Puppeteer (this will also perform authentication)
      logger.info("Starting PDF generation", { requestId });
      const pdfResult = await puppeteerService.generatePDF({
        surveyId,
        participantId,
        frontendUrl,
        backendUrl,
        serviceEmail: finalServiceEmail,
        servicePassword: finalServicePassword,
      });

      browser = pdfResult.browser;
      pdfBuffer = pdfResult.pdfBuffer;
      accessToken = pdfResult.accessToken;

      logger.info("PDF generated successfully", {
        requestId,
        pdfSize: pdfBuffer.length,
      });

      // Step 2: Initialize services with the access token obtained from authentication
      const uploadService = new UploadService(backendUrl, accessToken, requestId);
      const emailService = new EmailService(backendUrl, accessToken, requestId);

      // Step 3: Upload PDF to backend storage
      logger.info("Starting PDF upload", { requestId });
      pdfUrl = await uploadService.uploadPDF(pdfBuffer, `survey_${surveyId}_participant_${participantId}.pdf`);

      logger.info("PDF uploaded successfully", {
        requestId,
        pdfUrl,
      });

      // Step 4: Send email notifications
      logger.info("Starting email notifications", { requestId });
      await emailService.sendNotifications({
        adminEmails,
        pdfUrl,
        surveyId,
        participantId,
      });

      logger.info("Email notifications sent successfully", {
        requestId,
        emailCount: adminEmails.length,
      });

      const duration = Date.now() - startTime;
      logger.info("Lambda function completed successfully", {
        requestId,
        duration,
        pdfUrl,
      });

      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type,Authorization",
          "Access-Control-Allow-Methods": "POST,OPTIONS",
        },
        body: JSON.stringify({
          success: true,
          pdfUrl,
          message: "PDF generated and emails sent successfully",
          duration,
          requestId,
        }),
      };
    } catch (error) {
      logger.error("Error during PDF processing", {
        requestId,
        error: error.message,
        stack: error.stack,
      });

      throw error;
    } finally {
      // Cleanup: Close browser and cleanup temp files
      if (browser) {
        try {
          logger.info("Cleaning up browser instance", { requestId });
          await browser.close();
        } catch (cleanupError) {
          logger.error("Error closing browser", {
            requestId,
            error: cleanupError.message,
          });
        }
      }
    }
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error("Lambda function failed", {
      requestId,
      error: error.message,
      stack: error.stack,
      duration,
    });

    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
      },
      body: JSON.stringify({
        success: false,
        error: "Internal server error",
        message: error.message,
        requestId,
        duration: Date.now() - startTime,
      }),
    };
  }
};

// Handle OPTIONS requests for CORS
exports.corsHandler = async (event, context) => {
  return {
    statusCode: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type,Authorization",
      "Access-Control-Allow-Methods": "POST,OPTIONS",
    },
    body: "",
  };
};
