# 59Club Async PDF Export Lambda

A standalone AWS Lambda function for handling PDF report generation that replaces the frontend Puppeteer implementation.

## Overview

This Lambda function handles the heavy PDF generation workload that was causing timeout issues in the Next.js frontend. It uses Puppeteer with Chrome to authenticate, navigate to export URLs, capture PDFs, upload to backend storage, and send email notifications.

## Architecture

```
Frontend (Next.js) → API Gateway → Lambda Function → Backend APIs
                                      ↓
                                  PDF Generation
                                  File Upload
                                  Email Notifications
```

## API Contract

### Input
```json
{
  "surveyId": "string",
  "participantId": "string", 
  "adminEmails": ["email1@example.com"],
  "env": "staging",
  "serviceEmail": "service@test.com",
  "servicePassword": "password123"
}
```

### Output
```json
{
  "success": true,
  "pdfUrl": "https://storage.url/path/to/file.pdf",
  "message": "PDF generated and emails sent successfully"
}
```

## Lambda Configuration

- **Runtime**: Node.js 22.x
- **Architecture**: ARM64
- **Memory**: 2048 MB
- **Timeout**: 180 seconds (3 minutes)
- **Ephemeral Storage**: 1024 MB
- **Environment Variables**: See deployment section

## Quick Start

### Local Development
1. **Install dependencies:**
```bash
npm install
```

2. **Run local tests:**
```bash
export NODE_ENV=development
export IS_LOCAL=true
export MOCK_SERVICES=true
npm test
```

3. **Test specific components:**
```bash
node test/local-test.js validation  # Test input validation
node test/local-test.js env        # Test environment config
node test/local-test.js lambda     # Test full Lambda execution
```

### Production Deployment
1. **Quick deployment:**
```bash
./deployment/deploy.sh production us-east-1
```

2. **Manual deployment:**
```bash
npm run package
npm run deploy
```

📖 **For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)**

## Environment Variables

- `LOG_LEVEL`: Debug level (info, debug, error)
- `TIMEOUT_MS`: Custom timeout in milliseconds
- `CHROME_ARGS`: Additional Chrome arguments

## Error Handling

The function includes comprehensive error handling for:
- Chrome binary extraction timeouts
- Authentication failures
- PDF generation errors
- Upload failures
- Email notification errors

All errors are logged with context for debugging.

## Project Structure

```
59club-async-export-lambda/
├── src/                          # Source code
│   ├── index.js                  # Main Lambda handler
│   ├── config/
│   │   └── environment.js        # Environment configuration
│   ├── services/
│   │   ├── puppeteer-service.js  # PDF generation with Chrome
│   │   ├── upload-service.js     # Backend storage integration
│   │   └── email-service.js      # Email notifications
│   └── utils/
│       ├── logger.js             # Centralized logging
│       ├── validation.js         # Input validation
│       └── error-handler.js      # Error handling utilities
├── test/
│   └── local-test.js             # Local testing framework
├── deployment/
│   ├── cloudformation.yaml      # AWS infrastructure
│   └── deploy.sh                # Deployment script
├── package.json                 # Dependencies and scripts
├── README.md                    # This file
└── DEPLOYMENT.md               # Detailed deployment guide
```

## Features

✅ **PDF Generation**: @sparticuz/chromium with Puppeteer for ARM64  
✅ **Authentication**: Browser-context service account authentication  
✅ **File Upload**: Automatic upload to backend storage API  
✅ **Email Notifications**: Admin notifications via backend API  
✅ **Error Handling**: Comprehensive error management and logging  
✅ **AWS Integration**: Full CloudFormation and API Gateway setup  
✅ **Local Testing**: Mock services for local development  
✅ **Monitoring**: CloudWatch alarms and logging  
✅ **Security**: Input validation and domain restrictions  
✅ **Scalability**: ARM64 optimized for Lambda environment  
✅ **Package Size**: Optimized with @sparticuz/chromium for fast cold starts
