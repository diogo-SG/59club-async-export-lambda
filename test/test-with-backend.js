/**
 * Test script for testing Lambda function with your actual backend
 * This script allows you to test the full integration before deploying to AWS
 */

require("dotenv").config(); // Load environment variables from .env file

const { handler } = require("../src/index");
const { logger } = require("../src/utils/logger");

// Load configuration from environment variables
const config = {
  baseUrl: process.env.BASE_URL,
  backendUrl: process.env.BACKEND_URL,
  accessToken: process.env.ACCESS_TOKEN,
  testSurveyId: process.env.TEST_SURVEY_ID,
  testParticipantId: process.env.TEST_PARTICIPANT_ID,
  testAdminEmails: process.env.TEST_ADMIN_EMAILS ? process.env.TEST_ADMIN_EMAILS.split(",") : [],
};

// Validate configuration
function validateConfig() {
  const errors = [];

  if (!config.baseUrl) errors.push("BASE_URL not set in .env");
  if (!config.backendUrl) errors.push("BACKEND_URL not set in .env");
  if (!config.accessToken) errors.push("ACCESS_TOKEN not set in .env");
  if (!config.testSurveyId) errors.push("TEST_SURVEY_ID not set in .env");
  if (!config.testParticipantId) errors.push("TEST_PARTICIPANT_ID not set in .env");
  if (config.testAdminEmails.length === 0) errors.push("TEST_ADMIN_EMAILS not set in .env");

  if (errors.length > 0) {
    console.error("❌ Configuration errors:");
    errors.forEach((error) => console.error(`   - ${error}`));
    console.error("\n📝 Please copy env.example to .env and fill in your values");
    process.exit(1);
  }
}

// Create test event
function createTestEvent() {
  return {
    body: JSON.stringify({
      surveyId: config.testSurveyId,
      participantId: config.testParticipantId,
      adminEmails: config.testAdminEmails,
      baseUrl: config.baseUrl,
      backendUrl: config.backendUrl,
      accessToken: config.accessToken,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    httpMethod: "POST",
    requestContext: {
      requestId: "local-test-request",
    },
  };
}

// Create mock context
function createMockContext() {
  return {
    awsRequestId: "local-test-aws-request",
    functionName: "pdf-export-lambda-local",
    functionVersion: "$LATEST",
    invokedFunctionArn: "arn:aws:lambda:local:123456789:function:pdf-export-lambda-local",
    memoryLimitInMB: "2048",
    remainingTimeInMS: () => 180000,
  };
}

// Test backend connectivity
async function testBackendConnectivity() {
  console.log("🔗 Testing backend connectivity...");

  try {
    const axios = require("axios");

    // Test backend health
    console.log(`   Testing ${config.backendUrl}...`);
    const healthResponse = await axios.get(`${config.backendUrl}/health`, {
      timeout: 10000,
    });
    console.log(`   ✅ Backend health check: ${healthResponse.status}`);

    // Test authentication
    console.log("   Testing authentication...");
    const authResponse = await axios.post(
      `${config.backendUrl}/auth/verify`,
      {},
      {
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );
    console.log(`   ✅ Authentication: ${authResponse.status}`);

    // Test frontend connectivity
    console.log(`   Testing ${config.baseUrl}...`);
    const frontendResponse = await axios.get(config.baseUrl, {
      timeout: 10000,
    });
    console.log(`   ✅ Frontend connectivity: ${frontendResponse.status}`);

    return true;
  } catch (error) {
    console.error(`   ❌ Backend connectivity test failed: ${error.message}`);
    console.error(`   💡 Check your BASE_URL, BACKEND_URL, and ACCESS_TOKEN in .env`);
    return false;
  }
}

// Run full integration test
async function runIntegrationTest() {
  console.log("🧪 Running full integration test with your backend...\n");

  try {
    // Set environment for testing
    process.env.NODE_ENV = "development";
    process.env.IS_LOCAL = "true";
    process.env.MOCK_SERVICES = "false"; // Use real services

    console.log("📋 Test Configuration:");
    console.log(`   Survey ID: ${config.testSurveyId}`);
    console.log(`   Participant ID: ${config.testParticipantId}`);
    console.log(`   Admin Emails: ${config.testAdminEmails.join(", ")}`);
    console.log(`   Base URL: ${config.baseUrl}`);
    console.log(`   Backend URL: ${config.backendUrl}`);
    console.log(`   Token: ${config.accessToken.substring(0, 20)}...`);
    console.log();

    // Test backend connectivity first
    const backendOk = await testBackendConnectivity();
    if (!backendOk) {
      throw new Error("Backend connectivity test failed");
    }
    console.log();

    // Run the Lambda function
    console.log("🚀 Executing Lambda function...");
    const startTime = Date.now();

    const event = createTestEvent();
    const context = createMockContext();

    const result = await handler(event, context);
    const duration = Date.now() - startTime;

    console.log(`⏱️  Execution completed in ${duration}ms\n`);

    // Parse and display results
    const response = JSON.parse(result.body);

    if (result.statusCode === 200 && response.success) {
      console.log("🎉 Integration test SUCCESSFUL!");
      console.log(`📄 PDF URL: ${response.pdfUrl}`);
      console.log(`📧 Email Status: ${response.message}`);
      console.log(`🆔 Request ID: ${response.requestId}`);
      console.log(`⏱️  Duration: ${response.duration}ms`);
    } else {
      console.error("❌ Integration test FAILED");
      console.error(`Status: ${result.statusCode}`);
      console.error(`Error: ${response.error || response.message}`);
      if (response.details) {
        console.error("Details:", response.details);
      }
    }

    return { success: result.statusCode === 200, response };
  } catch (error) {
    console.error("💥 Integration test failed with error:");
    console.error(`Error: ${error.message}`);
    if (error.stack) {
      console.error(`Stack: ${error.stack}`);
    }
    return { success: false, error: error.message };
  }
}

// Test specific components
async function testComponent(component) {
  const tests = {
    auth: async () => {
      console.log("🔐 Testing authentication...");
      const { PuppeteerService } = require("../src/services/puppeteer-service");
      const service = new PuppeteerService("test-auth");

      // This would require a real browser launch which might not work locally
      console.log("   ⚠️  Authentication test requires full Lambda environment");
      console.log("   💡 Use the full integration test instead");
    },

    upload: async () => {
      console.log("📤 Testing upload service...");
      const { UploadService } = require("../src/services/upload-service");
      const service = new UploadService(config.backendUrl, config.accessToken, "test-upload");

      const isAccessible = await service.verifyEndpoint();
      console.log(`   Upload endpoint accessible: ${isAccessible ? "✅" : "❌"}`);
    },

    email: async () => {
      console.log("📧 Testing email service...");
      const { EmailService } = require("../src/services/email-service");
      const service = new EmailService(config.backendUrl, config.accessToken, "test-email");

      const isAccessible = await service.verifyEmailService();
      console.log(`   Email endpoint accessible: ${isAccessible ? "✅" : "❌"}`);
    },
  };

  if (tests[component]) {
    await tests[component]();
  } else {
    console.error(`Unknown component: ${component}`);
    console.log("Available components:", Object.keys(tests).join(", "));
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  console.log("🧪 59Club PDF Export Lambda - Backend Integration Test\n");

  // Load and validate configuration
  validateConfig();

  if (command === "check") {
    // Just check backend connectivity
    await testBackendConnectivity();
  } else if (command && ["auth", "upload", "email"].includes(command)) {
    // Test specific component
    await testComponent(command);
  } else if (!command || command === "all") {
    // Run full integration test
    const result = await runIntegrationTest();
    process.exit(result.success ? 0 : 1);
  } else {
    console.log("Usage:");
    console.log("  node test/test-with-backend.js           # Run full integration test");
    console.log("  node test/test-with-backend.js all       # Run full integration test");
    console.log("  node test/test-with-backend.js check     # Check backend connectivity");
    console.log("  node test/test-with-backend.js auth      # Test authentication");
    console.log("  node test/test-with-backend.js upload    # Test upload service");
    console.log("  node test/test-with-backend.js email     # Test email service");
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("💥 Test script failed:", error.message);
    process.exit(1);
  });
}

module.exports = {
  runIntegrationTest,
  testBackendConnectivity,
  testComponent,
};
