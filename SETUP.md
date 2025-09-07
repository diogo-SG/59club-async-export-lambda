# Setup and Configuration Guide

This guide will help you configure and test the PDF export Lambda function with your existing 59Club backend before deploying to AWS.

## Prerequisites

1. **Node.js 18.x or higher**
2. **Your 59Club backend running and accessible**
3. **Service account credentials for authentication**
4. **AWS CLI installed and configured** (for deployment)

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file and configure it with your settings:

```bash
cp env.example .env
```

Edit `.env` with your configuration:

```bash
# =============================================================================
# Application URLs (REQUIRED - update with your actual URLs)
# =============================================================================
BASE_URL=https://app.59club.com
BACKEND_URL=https://api.59club.com

# =============================================================================
# Authentication (REQUIRED - get from your backend)
# =============================================================================
ACCESS_TOKEN=your_service_account_bearer_token_here

# =============================================================================
# Testing Configuration (REQUIRED)
# =============================================================================
TEST_SURVEY_ID=your-test-survey-id
TEST_PARTICIPANT_ID=your-test-participant-id
TEST_ADMIN_EMAILS=admin@yourcompany.com,manager@yourcompany.com
```

### 3. How to Get Your Configuration Values

#### **ACCESS_TOKEN**
This should be a service account bearer token from your backend authentication system:

```bash
# Example: Get token from your backend
curl -X POST https://api.59club.com/auth/service-login \
  -H "Content-Type: application/json" \
  -d '{"clientId": "your-service-client", "clientSecret": "your-secret"}'
```

#### **TEST_SURVEY_ID and TEST_PARTICIPANT_ID**
Use existing survey and participant IDs from your database that you can safely test with.

#### **TEST_ADMIN_EMAILS**
Emails that should receive the PDF notification (comma-separated).

## Testing Strategy

### Step 1: Basic Connectivity Test

Test that your backend is accessible:

```bash
npm run test:check
```

This will verify:
- ✅ Backend health endpoint responds
- ✅ Authentication token is valid
- ✅ Frontend is accessible

### Step 2: Component Testing

Test individual services:

```bash
# Test upload endpoint
node test/test-with-backend.js upload

# Test email endpoint  
node test/test-with-backend.js email
```

### Step 3: Full Integration Test

Run the complete PDF generation workflow:

```bash
npm run test:backend
```

This will:
1. 🔗 Test backend connectivity
2. 🚀 Launch the Lambda function locally
3. 🌐 Navigate to your actual frontend
4. 🔐 Authenticate with your backend
5. 📄 Generate a real PDF
6. 📤 Upload to your backend storage
7. 📧 Send email notifications

### Step 4: Mock Services Test (Fallback)

If you can't test with your real backend yet:

```bash
npm test
```

This uses mock services to test the Lambda structure.

## Common Configuration Issues

### Authentication Errors

```
❌ Authentication: 401
```

**Solutions:**
- Verify your `ACCESS_TOKEN` is valid and not expired
- Check that your service account has the right permissions
- Ensure your backend `/auth/verify` endpoint exists

### URL Accessibility Errors

```
❌ Backend connectivity test failed: ECONNREFUSED
```

**Solutions:**
- Verify `BASE_URL` and `BACKEND_URL` are correct and accessible
- Check if you're behind a VPN or firewall
- Test URLs manually in your browser

### Survey/Participant Not Found

```
❌ Navigation failed: 404
```

**Solutions:**
- Verify `TEST_SURVEY_ID` and `TEST_PARTICIPANT_ID` exist in your database
- Check that the survey has the participant
- Ensure the survey allows PDF export

## Local Development Workflow

### 1. Initial Setup
```bash
# Install and configure
npm install
cp env.example .env
# Edit .env with your values
```

### 2. Quick Connectivity Check
```bash
npm run test:check
```

### 3. Iterative Testing
```bash
# Test full workflow
npm run test:backend

# If errors, check individual components
node test/test-with-backend.js upload
node test/test-with-backend.js email
```

### 4. Debug Mode
```bash
# Enable debug logging
echo "LOG_LEVEL=debug" >> .env
npm run test:backend
```

## Expected Test Output

### Successful Test
```
🧪 59Club PDF Export Lambda - Backend Integration Test

📋 Test Configuration:
   Survey ID: survey-123
   Participant ID: participant-456
   Admin Emails: admin@company.com, manager@company.com
   Base URL: https://app.59club.com
   Backend URL: https://api.59club.com
   Token: eyJhbGciOiJIUzI1NiIs...

🔗 Testing backend connectivity...
   Testing https://api.59club.com...
   ✅ Backend health check: 200
   Testing authentication...
   ✅ Authentication: 200
   Testing https://app.59club.com...
   ✅ Frontend connectivity: 200

🚀 Executing Lambda function...
⏱️  Execution completed in 45320ms

🎉 Integration test SUCCESSFUL!
📄 PDF URL: https://storage.59club.com/exports/2024-01-15_survey-123.pdf
📧 Email Status: PDF generated and emails sent successfully
🆔 Request ID: local-test-aws-request
⏱️  Duration: 45320ms
```

### Failed Test
```
❌ Integration test FAILED
Status: 500
Error: PDF_GENERATION_ERROR
Details: Browser launch failed: TimeoutError
```

## Troubleshooting

### Chrome/Puppeteer Issues

If you see browser launch errors:

```bash
# Add these to your .env
CHROME_ARGS=--disable-gpu,--no-sandbox,--disable-dev-shm-usage
```

### Memory Issues

```bash
# Monitor memory usage during test
NODE_OPTIONS="--max-old-space-size=4096" npm run test:backend
```

### Network Issues

```bash
# Test with longer timeouts
echo "UPLOAD_TIMEOUT_MS=120000" >> .env
echo "EMAIL_TIMEOUT_MS=60000" >> .env
```

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `BASE_URL` | ✅ | Your frontend URL | `https://app.59club.com` |
| `BACKEND_URL` | ✅ | Your backend API URL | `https://api.59club.com` |
| `ACCESS_TOKEN` | ✅ | Service account bearer token | `eyJhbGciOiJIUzI1NiIs...` |
| `TEST_SURVEY_ID` | ✅ | Survey ID for testing | `survey-123` |
| `TEST_PARTICIPANT_ID` | ✅ | Participant ID for testing | `participant-456` |
| `TEST_ADMIN_EMAILS` | ✅ | Comma-separated admin emails | `admin@company.com,manager@company.com` |
| `LOG_LEVEL` | ❌ | Logging level | `info` (default) |
| `NODE_ENV` | ❌ | Environment | `development` (auto-set) |
| `MOCK_SERVICES` | ❌ | Use mock services | `false` (for real testing) |

## Next Steps

Once local testing is successful:

1. **Commit your changes** (but not the `.env` file):
   ```bash
   git add .
   git commit -m "Initial Lambda implementation"
   ```

2. **Deploy to AWS** (see [DEPLOYMENT.md](./DEPLOYMENT.md)):
   ```bash
   ./deployment/deploy.sh production us-east-1
   ```

3. **Update your frontend** to call the Lambda instead of running Puppeteer locally

## Need Help?

- Check the logs with `LOG_LEVEL=debug`
- Test individual components first
- Verify your backend APIs are working correctly
- Ensure your service account has the right permissions
