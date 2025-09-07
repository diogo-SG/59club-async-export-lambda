#!/bin/bash

# AWS Lambda Deployment Script for 59Club PDF Export Function
# Usage: ./deploy.sh [environment] [region]

set -e

# Configuration
FUNCTION_NAME="59club-pdf-export-lambda"
STACK_NAME="59club-pdf-export-stack"
DEFAULT_REGION="us-east-1"
DEFAULT_ENVIRONMENT="production"

# Parse arguments
ENVIRONMENT=${1:-$DEFAULT_ENVIRONMENT}
REGION=${2:-$DEFAULT_REGION}

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI is not installed"
        exit 1
    fi
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        log_error "AWS credentials not configured"
        exit 1
    fi
    
    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        exit 1
    fi
    
    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    if [ ! -f "package.json" ]; then
        log_error "package.json not found. Run from project root."
        exit 1
    fi
    
    npm install --production
    log_success "Dependencies installed"
}

# Run tests
run_tests() {
    log_info "Running tests..."
    
    # Set test environment
    export NODE_ENV=test
    export IS_LOCAL=true
    export MOCK_SERVICES=true
    export LOG_LEVEL=info
    
    # Run validation tests
    node test/local-test.js validation
    node test/local-test.js env
    
    log_success "Tests passed"
}

# Package function
package_function() {
    log_info "Packaging Lambda function..."
    
    # Clean previous package
    rm -f function.zip
    
    # Create package excluding development files
    zip -r function.zip src/ node_modules/ -x \
        "node_modules/.cache/*" \
        "node_modules/puppeteer/*" \
        "*.md" \
        "test/*" \
        "deployment/*" \
        ".git/*" \
        ".gitignore"
    
    PACKAGE_SIZE=$(du -h function.zip | cut -f1)
    log_success "Function packaged (${PACKAGE_SIZE})"
}

# Deploy CloudFormation stack
deploy_stack() {
    log_info "Deploying CloudFormation stack..."
    
    # Check if stack exists
    if aws cloudformation describe-stacks --stack-name "$STACK_NAME" --region "$REGION" &> /dev/null; then
        log_info "Updating existing stack..."
        aws cloudformation update-stack \
            --stack-name "$STACK_NAME" \
            --template-body file://deployment/cloudformation.yaml \
            --parameters \
                ParameterKey=FunctionName,ParameterValue="$FUNCTION_NAME" \
                ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
            --capabilities CAPABILITY_NAMED_IAM \
            --region "$REGION"
        
        aws cloudformation wait stack-update-complete \
            --stack-name "$STACK_NAME" \
            --region "$REGION"
    else
        log_info "Creating new stack..."
        aws cloudformation create-stack \
            --stack-name "$STACK_NAME" \
            --template-body file://deployment/cloudformation.yaml \
            --parameters \
                ParameterKey=FunctionName,ParameterValue="$FUNCTION_NAME" \
                ParameterKey=Environment,ParameterValue="$ENVIRONMENT" \
            --capabilities CAPABILITY_NAMED_IAM \
            --region "$REGION"
        
        aws cloudformation wait stack-create-complete \
            --stack-name "$STACK_NAME" \
            --region "$REGION"
    fi
    
    log_success "CloudFormation stack deployed"
}

# Update function code
update_function_code() {
    log_info "Updating Lambda function code..."
    
    aws lambda update-function-code \
        --function-name "$FUNCTION_NAME" \
        --zip-file fileb://function.zip \
        --region "$REGION"
    
    # Wait for update to complete
    aws lambda wait function-updated \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION"
    
    log_success "Function code updated"
}

# Test deployment
test_deployment() {
    log_info "Testing deployment..."
    
    # Get API Gateway URL from stack outputs
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
        --output text)
    
    if [ -z "$API_URL" ]; then
        log_error "Could not retrieve API Gateway URL"
        exit 1
    fi
    
    log_info "API Gateway URL: $API_URL"
    
    # Test with invalid data (should return 400)
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"invalid": "data"}' \
        "$API_URL")
    
    if [ "$HTTP_STATUS" = "400" ]; then
        log_success "Deployment test passed (validation working)"
    else
        log_warning "Deployment test returned status: $HTTP_STATUS"
    fi
}

# Get deployment info
get_deployment_info() {
    log_info "Deployment Information:"
    
    # Get outputs from CloudFormation
    aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
        --output table
    
    # Get function info
    FUNCTION_INFO=$(aws lambda get-function \
        --function-name "$FUNCTION_NAME" \
        --region "$REGION" \
        --query 'Configuration.[FunctionName,Runtime,MemorySize,Timeout,LastModified]' \
        --output table)
    
    log_info "Function Configuration:"
    echo "$FUNCTION_INFO"
}

# Cleanup temporary files
cleanup() {
    log_info "Cleaning up..."
    rm -f function.zip
    log_success "Cleanup completed"
}

# Main deployment process
main() {
    echo ""
    log_info "Starting deployment process..."
    log_info "Environment: $ENVIRONMENT"
    log_info "Region: $REGION"
    log_info "Function Name: $FUNCTION_NAME"
    echo ""
    
    check_prerequisites
    install_dependencies
    run_tests
    package_function
    deploy_stack
    update_function_code
    test_deployment
    get_deployment_info
    cleanup
    
    echo ""
    log_success "Deployment completed successfully!"
    echo ""
    
    # Print usage instructions
    API_URL=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
        --output text)
    
    echo "🚀 Your Lambda function is now available at:"
    echo "   $API_URL"
    echo ""
    echo "📋 Example usage:"
    echo "   curl -X POST $API_URL \\"
    echo "     -H \"Content-Type: application/json\" \\"
    echo "     -d '{
        \"surveyId\": \"your-survey-id\",
        \"participantId\": \"your-participant-id\",
        \"adminEmails\": [\"admin@yourcompany.com\"],
        \"baseUrl\": \"https://app.yourcompany.com\",
        \"backendUrl\": \"https://api.yourcompany.com\",
        \"accessToken\": \"your-access-token\"
      }'"
    echo ""
}

# Handle script interruption
trap cleanup EXIT

# Check if script is being sourced or executed
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    main "$@"
fi
