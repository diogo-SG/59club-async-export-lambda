#!/usr/bin/env node

/**
 * Local HTTP Server for Testing 59Club Async Export Lambda
 *
 * This server mimics the API Gateway + Lambda setup to test the complete flow:
 * 1. Receives HTTP POST requests from your frontend
 * 2. Logs the incoming request data
 * 3. Processes the request using the actual Lambda handler
 * 4. Returns the response
 *
 * Usage:
 *   node test/local-server.js
 *
 * Then your frontend can call: http://localhost:3002/export
 */

// Load environment variables from .env file
require("dotenv").config();

const http = require("http");
const url = require("url");
const { handler } = require("../src/index");
const { getEnvironmentUrls } = require("../src/utils/validation");

const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || "localhost";

/**
 * Create mock Lambda context
 */
function createMockContext() {
  return {
    awsRequestId: `local-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    functionName: "59club-async-export-lambda-local",
    functionVersion: "$LATEST",
    invokedFunctionArn: "arn:aws:lambda:local:123456789:function:59club-async-export-lambda-local",
    memoryLimitInMB: "2048",
    remainingTimeInMS: () => 180000, // 3 minutes
    logGroupName: "/aws/lambda/59club-async-export-lambda-local",
    logStreamName: `${new Date().toISOString().split("T")[0]}/[$LATEST]${Math.random().toString(36).substr(2, 9)}`,
    identity: null,
    clientContext: null,
    getRemainingTimeInMillis: function () {
      return this.remainingTimeInMS();
    },
  };
}

/**
 * Create Lambda event from HTTP request
 */
function createLambdaEvent(req, body, requestId) {
  const parsedUrl = url.parse(req.url, true);

  return {
    version: "2.0",
    routeKey: "POST /export",
    rawPath: "/export",
    rawQueryString: "",
    headers: {
      accept: req.headers.accept || "*/*",
      "accept-encoding": req.headers["accept-encoding"] || "",
      "content-length": req.headers["content-length"] || "0",
      "content-type": req.headers["content-type"] || "application/json",
      host: req.headers.host || `${HOST}:${PORT}`,
      "user-agent": req.headers["user-agent"] || "local-test-client",
      "x-amzn-trace-id": `Root=1-${Math.floor(Date.now() / 1000).toString(16)}-${Math.random()
        .toString(16)
        .substr(2, 24)}`,
      "x-forwarded-for": "127.0.0.1",
      "x-forwarded-port": PORT.toString(),
      "x-forwarded-proto": "http",
    },
    queryStringParameters: parsedUrl.query,
    requestContext: {
      accountId: "123456789012",
      apiId: "local-api",
      domainName: `${HOST}:${PORT}`,
      domainPrefix: "local-api",
      http: {
        method: req.method,
        path: "/export",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: req.headers["user-agent"] || "local-test-client",
      },
      requestId: requestId,
      routeKey: "POST /export",
      stage: "local",
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: body,
    pathParameters: null,
    isBase64Encoded: false,
    stageVariables: null,
  };
}

/**
 * Log incoming request details
 */
function logRequest(req, body, requestId) {
  const timestamp = new Date().toISOString();

  console.log("\n" + "=".repeat(80));
  console.log(`🚀 INCOMING REQUEST [${timestamp}]`);
  console.log("=".repeat(80));
  console.log(`📝 Request ID: ${requestId}`);
  console.log(`🔗 Method: ${req.method}`);
  console.log(`🔗 URL: ${req.url}`);
  console.log(`🔗 User-Agent: ${req.headers["user-agent"] || "Unknown"}`);
  console.log(`📦 Content-Type: ${req.headers["content-type"] || "None"}`);
  console.log(`📏 Content-Length: ${req.headers["content-length"] || "0"} bytes`);

  // Parse and log request body
  try {
    const requestData = JSON.parse(body);
    console.log(`\n📊 REQUEST DATA:`);
    console.log(`   Survey ID: ${requestData.surveyId || "Not provided"}`);
    console.log(`   Participant ID: ${requestData.participantId || "Not provided"}`);
    console.log(`   Admin Emails: ${requestData.adminEmails ? requestData.adminEmails.join(", ") : "Not provided"}`);
    console.log(`   Environment: ${requestData.env || "Not provided"}`);

    // Resolve URLs based on environment
    if (requestData.env) {
      const { frontendUrl, backendUrl } = getEnvironmentUrls(requestData.env);
      console.log(`   Frontend URL (${requestData.env}): ${frontendUrl}`);
      console.log(`   Backend URL (${requestData.env}): ${backendUrl}`);
    } else {
      console.log(`   Frontend URL: Cannot resolve without environment`);
      console.log(`   Backend URL: Cannot resolve without environment`);
    }

    // Show service credentials (from request or environment)
    const serviceEmail = requestData.serviceEmail || process.env.SERVICE_EMAIL;
    const servicePassword = requestData.servicePassword || process.env.SERVICE_PASSWORD;
    console.log(`   Service Email: ${serviceEmail || "Not provided (check .env file)"}`);
    console.log(`   Service Password: ${servicePassword ? "***PROVIDED***" : "Not provided (check .env file)"}`);
  } catch (error) {
    console.log(`\n📊 REQUEST BODY (Raw):`);
    console.log(body);
  }

  console.log("\n🔄 Processing request with Lambda handler...");
  console.log("=".repeat(80));
}

/**
 * HTTP request handler
 */
async function handleRequest(req, res) {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");

  // Handle OPTIONS requests (CORS preflight)
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Only handle POST requests to /export
  if (req.method !== "POST" || req.url !== "/export") {
    console.log(`❌ Invalid request: ${req.method} ${req.url}`);
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "Not Found",
        message: "This endpoint only accepts POST requests to /export",
        requestId: requestId,
      })
    );
    return;
  }

  // Read request body
  let body = "";

  req.on("data", (chunk) => {
    body += chunk.toString();
  });

  req.on("end", async () => {
    try {
      // Log the incoming request
      logRequest(req, body, requestId);

      // Create Lambda event and context
      const event = createLambdaEvent(req, body, requestId);
      const context = createMockContext();

      // Execute the Lambda handler
      const startTime = Date.now();
      const result = await handler(event, context);
      const duration = Date.now() - startTime;

      // Log the result
      console.log(`\n✅ Lambda execution completed in ${duration}ms`);
      console.log(`📤 Response status: ${result.statusCode}`);

      if (result.statusCode === 200) {
        const responseBody = JSON.parse(result.body);
        console.log(`📄 PDF URL: ${responseBody.pdfUrl || "Not provided"}`);
        console.log(`💬 Message: ${responseBody.message || "No message"}`);
      } else {
        const errorBody = JSON.parse(result.body);
        console.log(`❌ Error: ${errorBody.error || "Unknown error"}`);
        console.log(`💬 Details: ${errorBody.message || "No details"}`);
      }

      console.log("=".repeat(80));

      // Send response
      res.writeHead(result.statusCode, {
        "Content-Type": "application/json",
        "X-Request-ID": requestId,
      });
      res.end(result.body);
    } catch (error) {
      console.error(`\n❌ Server error processing request ${requestId}:`, error);
      console.log("=".repeat(80));

      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Internal Server Error",
          message: error.message,
          requestId: requestId,
        })
      );
    }
  });

  req.on("error", (error) => {
    console.error(`❌ Request error for ${requestId}:`, error);
    if (!res.headersSent) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "Bad Request",
          message: error.message,
          requestId: requestId,
        })
      );
    }
  });
}

/**
 * Start the server
 */
const server = http.createServer(handleRequest);

server.listen(PORT, HOST, () => {
  const timestamp = new Date().toISOString();

  console.log("\n" + "🚀".repeat(40));
  console.log(`📡 59Club PDF Export Lambda - Local Test Server`);
  console.log("🚀".repeat(40));
  console.log(`⏰ Started: ${timestamp}`);
  console.log(`🌐 Server running at: http://${HOST}:${PORT}`);
  console.log(`📡 Endpoint: http://${HOST}:${PORT}/export`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`📂 Working Directory: ${process.cwd()}`);
  console.log("\n📋 Usage:");
  console.log(`   curl -X POST http://${HOST}:${PORT}/export \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(
    `     -d '{"surveyId":"123","participantId":"456","adminEmails":["test@test.com"],"serviceEmail":"service@test.com","servicePassword":"password"}'`
  );
  console.log("\n⌨️  Press Ctrl+C to stop the server");
  console.log("🚀".repeat(40));
  console.log("\n🔍 Waiting for requests...\n");
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n\n🛑 Shutting down server...");
  server.close(() => {
    console.log("✅ Server closed. Goodbye!");
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  console.log("\n\n🛑 Received SIGTERM. Shutting down gracefully...");
  server.close(() => {
    console.log("✅ Server closed. Goodbye!");
    process.exit(0);
  });
});
