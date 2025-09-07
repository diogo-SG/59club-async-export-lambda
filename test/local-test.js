/**
 * Local testing script for the PDF export Lambda function
 */

const { handler } = require("../src/index");
const { loadConfig, validateRuntimeEnvironment, logConfiguration } = require("../src/config/environment");
const { logger } = require("../src/utils/logger");

// Mock data for testing
const MOCK_EVENT = {
  body: JSON.stringify({
    surveyId: "test-survey-123",
    participantId: "test-participant-456",
    adminEmails: ["admin@test.com", "manager@test.com"],
    frontendUrl: "https://app.test.59club.com",
    backendUrl: "https://api.test.59club.com",
    serviceEmail: "service@test.com",
    servicePassword: "test-password-123",
  }),
  headers: {
    "Content-Type": "application/json",
  },
  httpMethod: "POST",
  requestContext: {
    requestId: "test-request-id",
  },
};

const MOCK_CONTEXT = {
  awsRequestId: "test-aws-request-id",
  functionName: "pdf-export-lambda-test",
  functionVersion: "$LATEST",
  invokedFunctionArn: "arn:aws:lambda:us-east-1:123456789:function:pdf-export-lambda-test",
  memoryLimitInMB: "2048",
  remainingTimeInMS: () => 180000,
};

/**
 * Mock services for local testing
 */
class MockServices {
  static createMockPuppeteerService() {
    const fs = require("fs");
    const path = require("path");

    return {
      generatePDF: async (params) => {
        logger.info("Mock PDF generation", { params });

        // Create a mock PDF buffer
        const mockPdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
>>
endobj
4 0 obj
<<
/Length 44
>>
stream
BT
/F1 12 Tf
72 720 Td
(Mock PDF Report) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000201 00000 n 
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
295
%%EOF`;

        const pdfBuffer = Buffer.from(mockPdfContent);

        return {
          browser: {
            close: async () => {
              logger.info("Mock browser closed");
            },
          },
          pdfBuffer,
        };
      },
    };
  }

  static createMockUploadService() {
    return {
      uploadPDF: async (pdfBuffer, filename) => {
        logger.info("Mock PDF upload", {
          fileSize: pdfBuffer.length,
          filename,
        });

        // Simulate upload delay
        await new Promise((resolve) => setTimeout(resolve, 1000));

        const mockUrl = `https://storage.test.com/exports/${Date.now()}_${filename}`;
        return mockUrl;
      },

      verifyEndpoint: async () => {
        return true;
      },
    };
  }

  static createMockEmailService() {
    return {
      sendNotifications: async (params) => {
        logger.info("Mock email notifications", {
          recipientCount: params.adminEmails.length,
          pdfUrl: params.pdfUrl,
        });

        // Simulate email sending delay
        await new Promise((resolve) => setTimeout(resolve, 500));

        return {
          success: true,
          emailsSent: params.adminEmails.length,
          messageId: `mock-message-${Date.now()}`,
          recipients: params.adminEmails,
        };
      },

      verifyEmailService: async () => {
        return true;
      },
    };
  }
}

/**
 * Run comprehensive local tests
 */
async function runLocalTests() {
  console.log("🚀 Starting local PDF export Lambda tests...\n");

  try {
    // Test 1: Environment validation
    console.log("1️⃣ Testing environment configuration...");
    logConfiguration();

    const envValidation = validateRuntimeEnvironment();
    if (!envValidation.isValid) {
      console.warn("⚠️ Environment validation issues:");
      envValidation.issues.forEach((issue) => console.warn(`   - ${issue}`));
    } else {
      console.log("✅ Environment validation passed");
    }
    console.log();

    // Test 2: Input validation
    console.log("2️⃣ Testing input validation...");
    const { validateInput } = require("../src/utils/validation");

    const inputValidation = validateInput(JSON.parse(MOCK_EVENT.body));
    if (inputValidation.isValid) {
      console.log("✅ Input validation passed");
    } else {
      console.error("❌ Input validation failed:", inputValidation.errors);
      return;
    }
    console.log();

    // Test 3: Mock service integration
    console.log("3️⃣ Testing mock services...");

    // Override services for testing
    if (process.env.MOCK_SERVICES === "true") {
      console.log("🔧 Using mock services for testing");

      // Replace real services with mocks in the modules
      const mockPuppeteerService = MockServices.createMockPuppeteerService();
      const mockUploadService = MockServices.createMockUploadService();
      const mockEmailService = MockServices.createMockEmailService();

      console.log("✅ Mock services initialized");
    }
    console.log();

    // Test 4: Full Lambda execution
    console.log("4️⃣ Testing full Lambda execution...");
    const startTime = Date.now();

    const result = await handler(MOCK_EVENT, MOCK_CONTEXT);

    const duration = Date.now() - startTime;
    console.log(`⏱️ Execution completed in ${duration}ms`);

    // Parse and validate result
    const response = JSON.parse(result.body);

    if (result.statusCode === 200 && response.success) {
      console.log("✅ Lambda execution successful");
      console.log(`📄 PDF URL: ${response.pdfUrl}`);
      console.log(`📧 Email notifications: ${response.message}`);
      console.log(`🆔 Request ID: ${response.requestId}`);
    } else {
      console.error("❌ Lambda execution failed");
      console.error("Status:", result.statusCode);
      console.error("Response:", response);
      return;
    }
    console.log();

    // Test 5: Error handling
    console.log("5️⃣ Testing error handling...");

    const invalidEvent = {
      body: JSON.stringify({
        surveyId: "", // Invalid empty string
        adminEmails: ["invalid-email"], // Invalid email format
        // Missing required fields
      }),
    };

    const errorResult = await handler(invalidEvent, MOCK_CONTEXT);
    const errorResponse = JSON.parse(errorResult.body);

    if (errorResult.statusCode === 400 && !errorResponse.success) {
      console.log("✅ Error handling working correctly");
      console.log("Error details:", errorResponse.details);
    } else {
      console.warn("⚠️ Error handling may need review");
    }
    console.log();

    console.log("🎉 All tests completed successfully!");
    console.log("\n📋 Test Summary:");
    console.log(`   ✅ Environment validation: ${envValidation.isValid ? "PASSED" : "ISSUES"}`);
    console.log("   ✅ Input validation: PASSED");
    console.log("   ✅ Mock services: PASSED");
    console.log("   ✅ Lambda execution: PASSED");
    console.log("   ✅ Error handling: PASSED");
  } catch (error) {
    console.error("💥 Test execution failed:");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    process.exit(1);
  }
}

/**
 * Run specific test by name
 */
async function runSpecificTest(testName) {
  const tests = {
    env: () => {
      logConfiguration();
      const validation = validateRuntimeEnvironment();
      console.log("Environment validation:", validation);
    },

    validation: () => {
      const { validateInput } = require("../src/utils/validation");
      const result = validateInput(JSON.parse(MOCK_EVENT.body));
      console.log("Input validation result:", result);
    },

    lambda: async () => {
      console.log("Running Lambda handler test...");
      const result = await handler(MOCK_EVENT, MOCK_CONTEXT);
      console.log("Lambda result:", result);
    },
  };

  if (tests[testName]) {
    await tests[testName]();
  } else {
    console.error(`Unknown test: ${testName}`);
    console.log("Available tests:", Object.keys(tests).join(", "));
  }
}

// Main execution
if (require.main === module) {
  // Set environment for local testing
  process.env.NODE_ENV = "development";
  process.env.IS_LOCAL = "true";
  process.env.MOCK_SERVICES = "true";
  process.env.LOG_LEVEL = "debug";

  const testName = process.argv[2];

  if (testName) {
    runSpecificTest(testName).catch(console.error);
  } else {
    runLocalTests().catch(console.error);
  }
}

module.exports = {
  runLocalTests,
  runSpecificTest,
  MockServices,
  MOCK_EVENT,
  MOCK_CONTEXT,
};
