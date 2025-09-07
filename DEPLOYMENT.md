# 59Club PDF Export Lambda - Deployment Guide

This guide provides complete instructions for deploying the PDF export Lambda function to AWS.

## Prerequisites

### 1. AWS Account Setup
- AWS Account with appropriate permissions
- AWS CLI installed and configured
- IAM permissions for:
  - Lambda function management
  - API Gateway management
  - CloudFormation stack management
  - S3 bucket operations
  - CloudWatch logs and alarms

### 2. Development Environment
- Node.js 18.x or higher
- npm package manager
- Git (for version control)

### 3. AWS CLI Configuration
```bash
# Configure AWS credentials
aws configure

# Verify configuration
aws sts get-caller-identity
```

## Quick Deployment

### Automated Deployment (Recommended)
```bash
# Clone repository
git clone <repository-url>
cd 59club-async-export-lambda

# Run deployment script
./deployment/deploy.sh production us-east-1

# Or for staging environment
./deployment/deploy.sh staging us-west-2
```

### Manual Deployment Steps

#### 1. Install Dependencies
```bash
npm install --production
```

#### 2. Run Local Tests
```bash
# Set environment for testing
export NODE_ENV=development
export IS_LOCAL=true
export MOCK_SERVICES=true

# Run tests
npm test
```

#### 3. Package Function
```bash
# Create deployment package
npm run package
```

#### 4. Deploy Infrastructure
```bash
# Deploy CloudFormation stack
aws cloudformation deploy \
  --template-file deployment/cloudformation.yaml \
  --stack-name 59club-pdf-export-stack \
  --parameter-overrides \
    FunctionName=59club-pdf-export-lambda \
    Environment=production \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1
```

#### 5. Update Function Code
```bash
# Update Lambda function code
aws lambda update-function-code \
  --function-name 59club-pdf-export-lambda \
  --zip-file fileb://function.zip \
  --region us-east-1
```

## Configuration

### Environment Variables

The Lambda function supports the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `TIMEOUT_MS` | `150000` | Function timeout in milliseconds |
| `MAX_RETRIES` | `3` | Maximum retry attempts |
| `UPLOAD_TIMEOUT_MS` | `60000` | Upload operation timeout |
| `EMAIL_TIMEOUT_MS` | `30000` | Email operation timeout |
| `MAX_FILE_SIZE_MB` | `50` | Maximum PDF file size |
| `ALLOWED_DOMAINS` | `""` | Comma-separated allowed domains |
| `CHROME_ARGS` | `""` | Additional Chrome arguments |

### CloudFormation Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `FunctionName` | `59club-pdf-export-lambda` | Lambda function name |
| `Environment` | `production` | Deployment environment |
| `LogLevel` | `info` | CloudWatch logging level |
| `MaxRetries` | `3` | Retry configuration |
| `AllowedDomains` | `59club.com,app.59club.com,api.59club.com` | Security domains |

## Testing the Deployment

### 1. Validation Test
```bash
# Test with invalid data (should return 400)
curl -X POST https://your-api-url/export \
  -H "Content-Type: application/json" \
  -d '{"invalid": "data"}'
```

### 2. Full Integration Test
```bash
# Test with valid data structure
curl -X POST https://your-api-url/export \
  -H "Content-Type: application/json" \
  -d '{
    "surveyId": "test-survey-123",
    "participantId": "test-participant-456",
    "adminEmails": ["admin@yourcompany.com"],
    "baseUrl": "https://app.yourcompany.com",
    "backendUrl": "https://api.yourcompany.com",
    "accessToken": "your-access-token"
  }'
```

### 3. Monitor Logs
```bash
# View CloudWatch logs
aws logs tail /aws/lambda/59club-pdf-export-lambda --follow
```

## Frontend Integration

Replace your existing Puppeteer code with a simple HTTP call:

```javascript
// Before: Complex Puppeteer setup
// const { generatePDF } = require('./puppeteer-service');

// After: Simple HTTP call
async function generatePDFReport(params) {
  const response = await fetch('https://your-api-url/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      surveyId: params.surveyId,
      participantId: params.participantId,
      adminEmails: params.adminEmails,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL,
      backendUrl: process.env.NEXT_PUBLIC_API_URL,
      accessToken: await getAccessToken()
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`PDF generation failed: ${error.message}`);
  }

  const result = await response.json();
  return result.pdfUrl;
}
```

## Monitoring and Debugging

### CloudWatch Dashboards

The deployment includes CloudWatch alarms for:
- Function errors (threshold: 5 errors in 5 minutes)
- Function duration (threshold: 2 minutes average)
- Memory utilization
- Dead letter queue messages

### Log Analysis

```bash
# Search for specific errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/59club-pdf-export-lambda \
  --filter-pattern "ERROR"

# Monitor performance
aws logs filter-log-events \
  --log-group-name /aws/lambda/59club-pdf-export-lambda \
  --filter-pattern "duration"
```

### Common Issues and Solutions

#### 1. Chrome Binary Extraction Timeout
```
Error: Browser launch failed: TimeoutError
```
**Solution**: Increase Lambda memory to 3008 MB or timeout to 300 seconds

#### 2. Authentication Failures
```
Error: Authentication failed: 401 Unauthorized
```
**Solution**: Verify access token validity and backend API availability

#### 3. Upload Failures
```
Error: Upload failed: ECONNREFUSED
```
**Solution**: Check backend URL and network connectivity

#### 4. Email Sending Issues
```
Error: Email service temporarily unavailable
```
**Solution**: Verify email service configuration and rate limits

## Security Considerations

### 1. Access Control
- Use IAM roles with minimal required permissions
- Enable VPC configuration if needed for private resources
- Implement API Gateway authorization if required

### 2. Data Protection
- Access tokens are not logged
- Temporary files are cleaned up automatically
- PDFs are uploaded to secure backend storage

### 3. Domain Restrictions
```bash
# Configure allowed domains
aws lambda update-function-configuration \
  --function-name 59club-pdf-export-lambda \
  --environment "Variables={ALLOWED_DOMAINS=yourcompany.com,app.yourcompany.com}"
```

## Performance Optimization

### 1. Memory Configuration
- **Recommended**: 2048 MB (minimum for Chrome)
- **High Volume**: 3008 MB for faster Chrome startup

### 2. Timeout Configuration
- **Default**: 180 seconds (3 minutes)
- **Complex Reports**: 300 seconds (5 minutes)

### 3. Concurrent Execution
- **Default**: 1000 concurrent executions
- **Monitor**: Reserved concurrency if needed

## Rollback Procedures

### 1. Function Code Rollback
```bash
# List function versions
aws lambda list-versions-by-function \
  --function-name 59club-pdf-export-lambda

# Rollback to previous version
aws lambda update-alias \
  --function-name 59club-pdf-export-lambda \
  --name LIVE \
  --function-version 1
```

### 2. Stack Rollback
```bash
# Rollback CloudFormation stack
aws cloudformation cancel-update-stack \
  --stack-name 59club-pdf-export-stack
```

## Cost Optimization

### 1. Provisioned Concurrency
- Only enable for high-frequency usage
- Monitor cold start metrics

### 2. Memory vs. Duration Trade-off
- Higher memory = faster execution = lower total cost
- Monitor CloudWatch metrics for optimal configuration

### 3. Log Retention
- Default: 14 days
- Adjust based on debugging needs

## Support and Troubleshooting

### Debug Mode
```bash
# Enable debug logging
aws lambda update-function-configuration \
  --function-name 59club-pdf-export-lambda \
  --environment "Variables={LOG_LEVEL=debug}"
```

### Health Checks
```bash
# Monitor function health
aws lambda get-function \
  --function-name 59club-pdf-export-lambda

# Check API Gateway health
curl -X OPTIONS https://your-api-url/export
```

### Performance Metrics
- Monitor duration, memory usage, and error rates
- Set up CloudWatch dashboards for real-time monitoring
- Configure SNS notifications for critical alerts

## Maintenance

### Regular Tasks
1. **Weekly**: Review CloudWatch logs for errors
2. **Monthly**: Update dependencies and redeploy
3. **Quarterly**: Review and optimize configuration
4. **Annually**: Review security and compliance

### Dependency Updates
```bash
# Check for outdated packages
npm outdated

# Update dependencies
npm update

# Redeploy with updates
./deployment/deploy.sh production
```
