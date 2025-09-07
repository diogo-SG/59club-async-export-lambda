# Simple ZIP Upload Deployment (No CloudFormation)

This guide shows how to deploy just the ZIP file to an existing Lambda function.

## Prerequisites

1. **Existing Lambda Function** (create manually in AWS Console)
2. **AWS CLI configured** with appropriate permissions

## Step 1: Create Lambda Function (One-time Setup)

### Option A: AWS Console (Recommended)
1. Go to AWS Lambda Console
2. Click "Create function"
3. Choose "Author from scratch"
4. **Function name**: `59club-async-export-lambda`
5. **Runtime**: Node.js 18.x
6. **Architecture**: x86_64
7. Click "Create function"

### Option B: AWS CLI
```bash
aws lambda create-function \
  --function-name 59club-async-export-lambda \
  --runtime nodejs18.x \
  --role arn:aws:iam::YOUR-ACCOUNT:role/lambda-execution-role \
  --handler src/index.handler \
  --zip-file fileb://function.zip \
  --memory-size 2048 \
  --timeout 180 \
  --ephemeral-storage Size=1024
```

## Step 2: Configure Lambda Settings

### Memory and Timeout
```bash
aws lambda update-function-configuration \
  --function-name 59club-async-export-lambda \
  --memory-size 2048 \
  --timeout 180 \
  --ephemeral-storage Size=1024
```

### Environment Variables
```bash
aws lambda update-function-configuration \
  --function-name 59club-async-export-lambda \
  --environment Variables='{
    "NODE_ENV": "production",
    "LOG_LEVEL": "info",
    "TIMEOUT_MS": "150000",
    "MAX_RETRIES": "3",
    "UPLOAD_TIMEOUT_MS": "60000",
    "EMAIL_TIMEOUT_MS": "30000",
    "MAX_FILE_SIZE_MB": "50"
  }'
```

## Step 3: Package and Deploy Code

### Build and Package
```bash
# Install dependencies
npm install --production

# Create ZIP file
npm run package
```

### Upload ZIP
```bash
# Upload to existing Lambda function
aws lambda update-function-code \
  --function-name 59club-async-export-lambda \
  --zip-file fileb://function.zip
```

## Step 4: Test Lambda Function

### Direct Lambda Test
```bash
# Create test event file
cat > test-event.json << 'EOF'
{
  "surveyId": "your-survey-id",
  "participantId": "your-participant-id",
  "adminEmails": ["admin@yourcompany.com"],
  "frontendUrl": "https://app.59club.com",
  "backendUrl": "https://api.59club.com",
  "serviceEmail": "your-service@email.com",
  "servicePassword": "your-password"
}
EOF

# Test the function
aws lambda invoke \
  --function-name 59club-async-export-lambda \
  --payload file://test-event.json \
  response.json

# Check response
cat response.json
```

## Step 5: Set Up API Gateway (Optional)

If you want HTTP endpoint access:

### Create API Gateway
```bash
# Create REST API
aws apigateway create-rest-api \
  --name 59club-async-export-api \
  --description "PDF Export API"

# Get API ID and Root Resource ID from output
API_ID="your-api-id"
ROOT_RESOURCE_ID="your-root-resource-id"

# Create resource
aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $ROOT_RESOURCE_ID \
  --path-part export

# Continue with method creation...
```

## Daily Deployment Workflow

```bash
# 1. Make code changes
# 2. Package new version
npm run package

# 3. Upload new code
aws lambda update-function-code \
  --function-name 59club-async-export-lambda \
  --zip-file fileb://function.zip

# 4. Test
aws lambda invoke \
  --function-name 59club-async-export-lambda \
  --payload file://test-event.json \
  response.json
```

## Quick Deploy Script

```bash
#!/bin/bash
echo "🔄 Deploying to Lambda..."
npm run package
aws lambda update-function-code \
  --function-name 59club-async-export-lambda \
  --zip-file fileb://function.zip
echo "✅ Deployment complete!"
```
