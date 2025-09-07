/**
 * Frontend Example - How to call the local test server
 *
 * This shows exactly how your frontend should call the Lambda function
 * (both locally and in production).
 *
 * Usage:
 *   1. Start the local server: npm run start:local
 *   2. Run this test: node test/frontend-example.js
 */

const https = require("https");
const http = require("http");

// Configuration
const config = {
  // Local testing
  local: {
    url: "http://localhost:3002/export",
    timeout: 180000, // 3 minutes
  },

  // Production (update with your actual API Gateway URL)
  production: {
    url: "https://your-api-gateway-url.amazonaws.com/export",
    timeout: 180000,
  },
};

/**
 * Make HTTP request to Lambda (local or production)
 */
async function callLambda(environment = "local", requestData) {
  const { url, timeout } = config[environment];
  const isHttps = url.startsWith("https:");
  const httpModule = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(requestData);

    const urlParts = new URL(url);
    const options = {
      hostname: urlParts.hostname,
      port: urlParts.port || (isHttps ? 443 : 80),
      path: urlParts.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
        "User-Agent": "Frontend-Test-Client/1.0",
      },
      timeout: timeout,
    };

    console.log(`📡 Calling ${environment} Lambda at: ${url}`);
    console.log(`📦 Payload:`, {
      ...requestData,
      servicePassword: "***HIDDEN***",
    });

    const req = httpModule.request(options, (res) => {
      let responseBody = "";

      res.on("data", (chunk) => {
        responseBody += chunk;
      });

      res.on("end", () => {
        try {
          const response = JSON.parse(responseBody);
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: response,
          });
        } catch (error) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseBody,
          });
        }
      });
    });

    req.on("error", (error) => {
      reject(new Error(`Request failed: ${error.message}`));
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeout}ms`));
    });

    req.write(requestBody);
    req.end();
  });
}

/**
 * Example request data (update with your real values)
 */
function createExampleRequest() {
  return {
    surveyId: "survey-123",
    participantId: "participant-456",
    adminEmails: ["admin@test.com", "manager@test.com"],
    env: "dev", // Environment: local, dev, qa, staging, prod
    serviceEmail: "service@test.com",
    servicePassword: "your-service-password",
  };
}

/**
 * Main test function
 */
async function runFrontendTest() {
  console.log("🧪 Frontend Lambda Call Example");
  console.log("=".repeat(50));

  try {
    const requestData = createExampleRequest();
    const startTime = Date.now();

    // Call local server (make sure it's running: npm run start:local)
    const response = await callLambda("local", requestData);
    const duration = Date.now() - startTime;

    console.log(`\n✅ Response received in ${duration}ms`);
    console.log(`📊 Status: ${response.statusCode}`);
    console.log(`📋 Headers:`, response.headers);
    console.log(`📄 Response:`, response.body);

    if (response.statusCode === 200) {
      console.log(`\n🎉 SUCCESS! PDF generated successfully`);
      if (response.body.pdfUrl) {
        console.log(`📄 PDF URL: ${response.body.pdfUrl}`);
      }
    } else {
      console.log(`\n❌ ERROR: ${response.body.error || "Unknown error"}`);
      console.log(`💬 Message: ${response.body.message || "No message"}`);
    }
  } catch (error) {
    console.error(`\n❌ Test failed:`, error.message);

    if (error.message.includes("ECONNREFUSED")) {
      console.log(`\n💡 Make sure the local server is running:`);
      console.log(`   npm run start:local`);
    }
  }

  console.log("\n" + "=".repeat(50));
}

/**
 * React/Vue/Angular example
 */
function showFrontendCode() {
  console.log(`\n📱 Frontend Integration Example:\n`);

  console.log(`// React/Vue/Angular - call Lambda function`);
  console.log(`async function exportPDF(surveyId, participantId, adminEmails) {`);
  console.log(`  try {`);
  console.log(`    const response = await fetch('http://localhost:3002/export', {`);
  console.log(`      method: 'POST',`);
  console.log(`      headers: {`);
  console.log(`        'Content-Type': 'application/json'`);
  console.log(`      },`);
  console.log(`      body: JSON.stringify({`);
  console.log(`        surveyId,`);
  console.log(`        participantId,`);
  console.log(`        adminEmails,`);
  console.log(`        env: 'prod', // or 'dev', 'qa', 'staging'`);
  console.log(`        serviceEmail: process.env.REACT_APP_SERVICE_EMAIL,`);
  console.log(`        servicePassword: process.env.REACT_APP_SERVICE_PASSWORD`);
  console.log(`      })`);
  console.log(`    });`);
  console.log(``);
  console.log(`    const result = await response.json();`);
  console.log(``);
  console.log(`    if (response.ok) {`);
  console.log(`      console.log('PDF generated:', result.pdfUrl);`);
  console.log(`      // Show success message to user`);
  console.log(`    } else {`);
  console.log(`      console.error('Export failed:', result.error);`);
  console.log(`      // Show error message to user`);
  console.log(`    }`);
  console.log(`  } catch (error) {`);
  console.log(`    console.error('Request failed:', error);`);
  console.log(`  }`);
  console.log(`}`);
}

// Check command line arguments
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage:`);
  console.log(`  node test/frontend-example.js        # Run test`);
  console.log(`  node test/frontend-example.js code   # Show frontend code example`);
  process.exit(0);
}

if (args.includes("code")) {
  showFrontendCode();
} else {
  runFrontendTest();
}
