# 59Club Async PDF Export Lambda

A standalone AWS Lambda function for handling PDF report generation that replaces the frontend Puppeteer implementation. The Lambda processes requests asynchronously to avoid API Gateway timeout issues.

## Overview

This Lambda function handles the heavy PDF generation workload that was causing timeout issues in the Next.js frontend. It uses Puppeteer with Chrome to authenticate, navigate to export URLs, capture PDFs, upload to backend storage, and send email notifications - all processed asynchronously.

## Architecture

```
Frontend (Next.js) → API Gateway → Lambda Function (Immediate Response)
                                      ↓ (Async Processing)
                                  PDF Generation
                                  File Upload  
                                  Email Notifications
```

**Key Design**: The Lambda returns an immediate success response to avoid API Gateway's 29-second timeout, then continues processing the PDF export in the background.

## How It Works

### 1. **Immediate Response Phase** (< 1 second)
- Validates input parameters
- Returns success response with request ID
- Starts async processing

### 2. **Async Processing Phase** (~45-60 seconds)
- **Authentication**: Browser-based login using service account credentials
- **PDF Generation**: Navigate to export URL, monitor progress (30% → 70% → 77% → Complete)
- **File Upload**: Upload PDF to backend storage with environment-specific CloudFront URLs
- **Email Notifications**: Send admin notifications with PDF download link
- **Completion**: Log success and cleanup browser resources

### 3. **Progress Tracking**
The Lambda monitors the frontend's export modal and progress indicators:
- Detects export modal: `[data-export-modal]` or `.fixed.inset-0.z-50...`
- Tracks progress text: `"30% complete"`, `"70% complete"`, etc.
- Monitors export step: `"Generating Export"`
- Implements retry mechanism (max 2 retries) if export appears to fail

## API Contract

### Request
```json
{
  "surveyId": "f0316b2c-0879-4200-9a6e-af90d4aeecb5",
  "participantId": "3f4d3302-940a-42d7-b7c7-05d1b70ca9d8",
  "adminEmails": ["admin@test.com"],
  "env": "qa",
  "serviceEmail": "service@test.com",
  "servicePassword": "password123"
}
```

### Immediate Response
```json
{
  "success": true,
  "message": "PDF export process initiated successfully",
  "requestId": "76500879-5ef1-4438-ae2d-6ee78d0b4078",
  "surveyId": "f0316b2c-0879-4200-9a6e-af90d4aeecb5",
  "participantId": "3f4d3302-940a-42d7-b7c7-05d1b70ca9d8",
  "estimatedCompletionTime": "45-60 seconds",
  "note": "Check AWS CloudWatch logs for completion status. Email notification will be sent when processing is complete."
}
```

## Environment Configuration

The `env` parameter determines which URLs to use:

| Environment | Frontend URL | Backend URL |
|-------------|--------------|-------------|
| `local` | `https://dev.survey.59club.studiographene.xyz` | `https://dev.surveyapi.59club.studiographene.xyz/api` |
| `dev` | `https://dev.survey.59club.studiographene.xyz` | `https://dev.surveyapi.59club.studiographene.xyz/api` |
| `qa` | `https://qa.survey.59club.studiographene.xyz` | `https://qa.surveyapi.59club.studiographene.xyz/api` |
| `staging` | `https://staging.surveys.59club.com` | `https://staging.api.surveys.59club.com/api` |
| `prod` | `https://staging.surveys.59club.com` (TBC) | `https://staging.api.surveys.59club.com/api` (TBC) |

CloudFront domains for file uploads:
- `dev`/`local`: `dev.assets.59club.studiographene.xyz`
- `qa`: `qa.assets.59club.studiographene.xyz` 
- `staging`/`prod`: `club59-uat-assets-origin.s3.eu-west-1.amazonaws.com`

## Lambda Configuration

- **Runtime**: Node.js 22.x
- **Architecture**: x86_64 (for Chromium stability)
- **Memory**: 2048 MB
- **Timeout**: 450 seconds (7.5 minutes)
- **Ephemeral Storage**: 1024 MB
- **Package Size**: ~80MB (optimized with @sparticuz/chromium)

### Required Environment Variables
```bash
SERVICE_EMAIL=service@test.com
SERVICE_PASSWORD=password123
LOG_LEVEL=info
```

## Testing

### Local Testing
```bash
# Install dependencies
npm install

# Package for deployment  
npm run package

# Start local server (simulates API Gateway)
npm run start:local

# Test with curl (in another terminal)
curl -X POST http://localhost:3002/export \
  -H "Content-Type: application/json" \
  -d '{
    "surveyId": "f0316b2c-0879-4200-9a6e-af90d4aeecb5",
    "participantId": "3f4d3302-940a-42d7-b7c7-05d1b70ca9d8", 
    "adminEmails": ["test@test.com"],
    "env": "qa"
  }'
```

### AWS Testing
```bash
# Test deployed Lambda
curl -X POST https://your-api-gateway-url/dev/export \
  -H "Content-Type: application/json" \
  -d '{
    "surveyId": "f0316b2c-0879-4200-9a6e-af90d4aeecb5",
    "participantId": "3f4d3302-940a-42d7-b7c7-05d1b70ca9d8",
    "adminEmails": ["admin@test.com"],
    "env": "qa"
  }'
```

**Expected Response**: Immediate success (< 1 second)  
**Completion Tracking**: Check AWS CloudWatch logs for group `/aws/lambda/59club-async-export-lambda`

### CloudWatch Log Monitoring

Look for these key log entries to track progress:

```bash
# Success indicators
✅ "PDF export process initiated successfully" - Request accepted
✅ "Browser-context authentication successful" - Login completed  
✅ "Export progress detected: 70% complete" - PDF generation progressing
✅ "PDF download detected" - PDF file captured
✅ "PDF upload completed successfully" - File uploaded to storage
✅ "Email notifications sent successfully" - Admin notifications sent
✅ "Async PDF processing completed successfully" - Full completion

# Error indicators  
❌ "Authentication failed" - Login issues
❌ "PDF download timeout exceeded" - Generation timeout
❌ "Upload response missing file location" - Storage upload failed
❌ "Email notifications failed" - Email service error
```

## Key Services

### 1. PuppeteerService (`src/services/puppeteer-service.js`)
- **Browser Management**: Launches Chrome with @sparticuz/chromium
- **Authentication**: Performs browser-based login with service account
- **PDF Capture**: Monitors export progress and downloads PDF files
- **Progress Tracking**: Real-time monitoring of export modal and progress indicators

### 2. UploadService (`src/services/upload-service.js`)
- **File Upload**: Posts PDF to backend `/media` endpoint
- **URL Building**: Constructs environment-specific CloudFront URLs
- **Response Handling**: Extracts `fileLocation` from upload response

### 3. EmailService (`src/services/email-service.js`)
- **Notification Sending**: Calls backend email API with PDF URL
- **Request Format**: Uses `recipientEmails` and `s3PdfUrl` format
- **Error Handling**: Comprehensive response validation and logging

## Project Structure

```
59club-async-export-lambda/
├── src/
│   ├── index.js                  # Main Lambda handler with async processing
│   ├── config/
│   │   └── environment.js        # Environment configuration
│   ├── services/
│   │   ├── puppeteer-service.js  # PDF generation with Chrome
│   │   ├── upload-service.js     # Backend storage integration  
│   │   └── email-service.js      # Email notifications
│   └── utils/
│       ├── logger.js             # Centralized logging
│       ├── validation.js         # Input validation & URL mapping
│       └── error-handler.js      # Error handling utilities
├── test/
│   ├── local-test.js             # Local testing framework
│   ├── test-with-backend.js      # Integration tests
│   ├── local-server.js           # API Gateway simulator
│   └── frontend-example.js       # Frontend integration example
├── scripts/
│   └── package-lambda.js         # Optimized packaging script
├── package.json                  # Dependencies and scripts
└── function.zip                  # Deployable Lambda package
```

## Features

✅ **Async Processing**: Immediate response to avoid API Gateway timeouts  
✅ **PDF Generation**: @sparticuz/chromium with Puppeteer for x86_64  
✅ **Progress Monitoring**: Real-time tracking of export modal and progress  
✅ **Retry Mechanism**: Automatic retry (max 2) for failed exports  
✅ **Authentication**: Browser-context service account login with cookie persistence  
✅ **File Upload**: Environment-specific CloudFront URL construction  
✅ **Email Notifications**: Admin notifications via backend API  
✅ **Error Handling**: Comprehensive error management and logging  
✅ **Local Testing**: Complete testing framework with mock services  
✅ **Package Optimization**: Size-optimized build under 250MB Lambda limit  
✅ **Cross-Environment**: Dynamic URL mapping based on environment parameter

## Deployment

**Deployment Method**: Manual ZIP upload to AWS Lambda Console

1. **Package the Lambda**:
   ```bash
   npm run package
   ```

2. **Upload to AWS**:
   - Open AWS Lambda Console
   - Navigate to `59club-async-export-lambda` function
   - Upload `function.zip` file
   - Configure environment variables as needed

3. **Verify Configuration**:
   - Runtime: Node.js 22.x
   - Architecture: x86_64  
   - Memory: 2048 MB
   - Timeout: 450 seconds (7.5 minutes)
   - Handler: `src/index.handler`

**Note**: CloudFormation and automated deployment scripts are available but currently not used in favor of manual ZIP uploads for better control.

## Monitoring & Debugging

- **CloudWatch Logs**: `/aws/lambda/59club-async-export-lambda`
- **Request Tracking**: All logs include `requestId` for correlation
- **Performance Metrics**: Duration, memory usage, and success/failure rates
- **Error Context**: Detailed error logging with stack traces and context data

Average processing time: 45-60 seconds  
Success rate: Near 100% with retry mechanism  
Memory usage: ~800-950 MB (well under 2048 MB limit)