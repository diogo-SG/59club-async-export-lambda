# Step-by-Step Testing Instructions

## Prerequisites

1. **Your 59Club backend must be running and accessible**
2. **You need valid service account credentials**
3. **You need existing survey and participant data to test with**

## Step 1: Environment Setup

```bash
# 1. Copy environment template
cp env.example .env

# 2. Edit .env with your actual values:
nano .env
```

**Required values in .env:**
```bash
# Your actual URLs
FRONTEND_URL=https://app.test.com
BACKEND_URL=https://api.test.com

# Your service account credentials  
SERVICE_EMAIL=diogoc2@sharklasers.com
SERVICE_PASSWORD=MammaMia123!9

# Real data from your database
TEST_SURVEY_ID=your-actual-survey-id
TEST_PARTICIPANT_ID=your-actual-participant-id
TEST_ADMIN_EMAILS=your-email@company.com,another-admin@company.com
```

## Step 2: Validate Your Service Account

```bash
# Test your service account login manually
curl -X POST https://api.test.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "diogoc2@sharklasers.com",
    "password": "MammaMia123!9"
  }'
```

**Expected response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": { "email": "diogoc2@sharklasers.com" }
}
```

## Step 3: Validate Your Survey Data

```bash
# Test that your survey/participant exists
# (Replace with your actual survey URL)
curl "https://app.test.com/en-GB/surveys/your-survey-id/results/by-user?participantIds=your-participant-id"
```

## Step 4: Basic Connectivity Test

```bash
npm run test:check
```

**Expected output:**
```
🔗 Testing backend connectivity...
   Testing https://api.test.com...
   ✅ Backend health check: 200
   Testing service account login...
   ✅ Service account login: 200
   Testing https://app.test.com...
   ✅ Frontend connectivity: 200
```

## Step 5: Component Testing

```bash
# Test upload service
node test/test-with-backend.js upload

# Test email service  
node test/test-with-backend.js email
```

**Expected output:**
```
📤 Testing upload service...
   Upload endpoint accessible: ✅

📧 Testing email service...
   Email endpoint accessible: ✅
```

## Step 6: Full Integration Test

```bash
npm run test:backend
```

**Expected output:**
```
🧪 59Club PDF Export Lambda - Backend Integration Test

📋 Test Configuration:
   Survey ID: your-survey-id
   Participant ID: your-participant-id
   Admin Emails: your-email@company.com
   Frontend URL: https://app.test.com
   Backend URL: https://api.test.com
   Service Email: diogoc2@sharklasers.com
   Service Password: **********

🔗 Testing backend connectivity...
   ✅ Backend health check: 200
   ✅ Service account login: 200  
   ✅ Frontend connectivity: 200

🚀 Executing Lambda function...
⏱️  Execution completed in 45000ms

🎉 Integration test SUCCESSFUL!
📄 PDF URL: https://storage.test.com/exports/2024-01-15_survey-123.pdf
📧 Email Status: PDF generated and emails sent successfully
🆔 Request ID: local-test-aws-request
⏱️  Duration: 45000ms
```

## Step 7: Deploy to AWS (Simple Method)

```bash
# 1. Package the code
npm run package

# 2. Create Lambda function in AWS Console manually, then:
aws lambda update-function-code \
  --function-name your-lambda-function-name \
  --zip-file fileb://function.zip

# 3. Test on AWS
aws lambda invoke \
  --function-name your-lambda-function-name \
  --payload '{
    "surveyId": "your-survey-id",
    "participantId": "your-participant-id", 
    "adminEmails": ["your-email@company.com"],
    "frontendUrl": "https://app.test.com",
    "backendUrl": "https://api.test.com",
    "serviceEmail": "diogoc2@sharklasers.com",
    "servicePassword": "MammaMia123!9"
  }' \
  response.json

cat response.json
```

## Troubleshooting Common Issues

### Issue 1: Authentication Fails
```
❌ Service account login: 401
```
**Fix:** Verify `SERVICE_EMAIL` and `SERVICE_PASSWORD` in .env

### Issue 2: Survey Not Found  
```
❌ Navigation failed: 404
```
**Fix:** Verify `TEST_SURVEY_ID` and `TEST_PARTICIPANT_ID` exist in your database

### Issue 3: Backend Not Accessible
```
❌ Backend connectivity test failed: ECONNREFUSED
```
**Fix:** Verify `BACKEND_URL` is correct and accessible from your network

### Issue 4: Chrome/Puppeteer Issues
```
❌ Browser launch failed: TimeoutError
```
**Fix:** This usually works fine on AWS Lambda. For local testing, try:
```bash
export CHROME_ARGS="--disable-gpu,--no-sandbox"
npm run test:backend
```

## Success Criteria

✅ **Step 4 passes**: Your backend is accessible  
✅ **Step 5 passes**: Your API endpoints work  
✅ **Step 6 passes**: Full PDF generation works locally  
✅ **Step 7 passes**: AWS deployment works  

When all steps pass, your Lambda is ready to replace the frontend Puppeteer code!

## Integration with Your Frontend

Replace your current Puppeteer code with:

```javascript
async function generatePDFReport(surveyId, participantId, adminEmails) {
  const response = await fetch('https://your-api-gateway-url/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      surveyId,
      participantId, 
      adminEmails,
      frontendUrl: process.env.NEXT_PUBLIC_FRONTEND_URL,
      backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
      serviceEmail: process.env.SERVICE_EMAIL,
      servicePassword: process.env.SERVICE_PASSWORD
    })
  });

  const result = await response.json();
  if (!result.success) {
    throw new Error(`PDF generation failed: ${result.message}`);
  }
  
  return result.pdfUrl;
}
```
