#!/bin/bash

# Quick deploy script - no CloudFormation needed
# Usage: ./quick-deploy.sh [function-name] [region] [env-type]
# Examples:
#   ./quick-deploy.sh 59club-async-export-dev us-east-1 dev
#   ./quick-deploy.sh 59club-async-export-prod us-east-1 prod

set -e

FUNCTION_NAME=${1:-59club-async-export-lambda}
REGION=${2:-us-east-1}
ENV_TYPE=${3:-prod}

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# Validate environment type
case $ENV_TYPE in
    dev|staging|prod)
        # Valid environment types
        ;;
    *)
        echo -e "${RED}❌ Invalid environment type: $ENV_TYPE${NC}"
        echo "Valid options: dev, staging, prod"
        exit 1
        ;;
esac

echo -e "${BLUE}🚀 Quick Deploy to Lambda${NC}"
echo "Function: $FUNCTION_NAME"
echo "Region: $REGION"
echo "Environment: $ENV_TYPE"
echo "(URLs will be determined dynamically based on env)"
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
        --architectures x86_64 \
        --environment Variables="{
            \"NODE_ENV\": \"production\",
            \"LOG_LEVEL\": \"info\", 
            \"TIMEOUT_MS\": \"150000\",
            \"MAX_RETRIES\": \"3\",
            \"UPLOAD_TIMEOUT_MS\": \"60000\",
            \"EMAIL_TIMEOUT_MS\": \"30000\",
            \"MAX_FILE_SIZE_MB\": \"50\"
        }" \
        --region "$REGION"
else
    echo -e "${RED}❌ Function doesn't exist. Please create it first:${NC}"
    echo ""
    echo "1. Go to AWS Lambda Console"
    echo "2. Create function: $FUNCTION_NAME"
    echo "3. Runtime: Node.js 22.x"
    echo "4. Architecture: x86_64"
    echo "5. Then run this script again"
    exit 1
fi

# Test function
echo -e "${BLUE}🧪 Testing function...${NC}"
cat > /tmp/test-event.json << EOF
{
    "surveyId": "test-123",
    "participantId": "test-456", 
    "adminEmails": ["test@example.com"],
    "env": "$ENV_TYPE",
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
