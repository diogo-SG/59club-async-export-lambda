#!/bin/bash

# Quick deploy script - no CloudFormation needed
# Usage: ./quick-deploy.sh [function-name] [region]

set -e

FUNCTION_NAME=${1:-59club-pdf-export-lambda}
REGION=${2:-us-east-1}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Quick Deploy to Lambda${NC}"
echo "Function: $FUNCTION_NAME"
echo "Region: $REGION"
echo ""

# Check if function exists
echo -e "${BLUE}Checking if Lambda function exists...${NC}"
if aws lambda get-function --function-name "$FUNCTION_NAME" --region "$REGION" &> /dev/null; then
    echo -e "${GREEN}✅ Function exists${NC}"
    FUNCTION_EXISTS=true
else
    echo -e "${RED}❌ Function does not exist${NC}"
    FUNCTION_EXISTS=false
fi

# Build package
echo -e "${BLUE}📦 Building package...${NC}"
npm install --production
npm run package

# Deploy or update
if [ "$FUNCTION_EXISTS" = true ]; then
    echo -e "${BLUE}🔄 Updating existing function...${NC}"
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file fileb://function.zip \
        --region "$REGION"
    
    echo -e "${BLUE}⚙️ Updating configuration...${NC}"
    aws lambda update-function-configuration \
        --function-name "$FUNCTION_NAME" \
        --memory-size 2048 \
        --timeout 180 \
        --ephemeral-storage Size=1024 \
        --environment Variables='{
            "NODE_ENV": "production",
            "LOG_LEVEL": "info", 
            "TIMEOUT_MS": "150000",
            "MAX_RETRIES": "3",
            "UPLOAD_TIMEOUT_MS": "60000",
            "EMAIL_TIMEOUT_MS": "30000",
            "MAX_FILE_SIZE_MB": "50"
        }' \
        --region "$REGION"
else
    echo -e "${RED}❌ Function doesn't exist. Please create it first:${NC}"
    echo ""
    echo "1. Go to AWS Lambda Console"
    echo "2. Create function: $FUNCTION_NAME"
    echo "3. Runtime: Node.js 18.x"
    echo "4. Then run this script again"
    exit 1
fi

# Test function
echo -e "${BLUE}🧪 Testing function...${NC}"
cat > /tmp/test-event.json << 'EOF'
{
    "surveyId": "test-123",
    "participantId": "test-456", 
    "adminEmails": ["test@example.com"],
    "frontendUrl": "https://app.59club.com",
    "backendUrl": "https://api.59club.com", 
    "serviceEmail": "test@example.com",
    "servicePassword": "test-password"
}
EOF

aws lambda invoke \
    --function-name "$FUNCTION_NAME" \
    --payload file:///tmp/test-event.json \
    --region "$REGION" \
    /tmp/response.json

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Function deployed successfully!${NC}"
    echo ""
    echo "📋 Response:"
    cat /tmp/response.json | jq . 2>/dev/null || cat /tmp/response.json
else
    echo -e "${RED}❌ Test failed${NC}"
    exit 1
fi

# Cleanup
rm -f /tmp/test-event.json /tmp/response.json
rm -f function.zip

echo ""
echo -e "${GREEN}🎉 Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Update your frontend to call the Lambda function"
echo "2. Set up API Gateway if you need HTTP endpoints"
echo "3. Monitor CloudWatch logs for any issues"
