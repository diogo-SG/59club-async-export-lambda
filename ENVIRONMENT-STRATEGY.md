# Environment Strategy Guide

## The Question: One Lambda or Multiple?

Since URLs are environment-specific, you have three deployment strategies:

## **Strategy 1: Single Lambda, URLs in Request (Original)**

**Use Case:** Maximum flexibility, any environment can call any other environment

```javascript
// Frontend calls Lambda with environment-specific URLs
await invoke({
  surveyId: "123",
  frontendUrl: "https://app-dev.test.com",    // Environment-specific
  backendUrl: "https://api-dev.test.com",     // Environment-specific  
  serviceEmail: "dev-service@company.com",
  servicePassword: "dev-password"
});
```

**Pros:** ✅ One Lambda for all environments, maximum flexibility  
**Cons:** ❌ URLs exposed in requests, frontend must know environment URLs

---

## **Strategy 2: Separate Lambda per Environment**

**Use Case:** Strict environment isolation, security-focused

```bash
# Deploy separate functions
./quick-deploy.sh 59club-async-export-dev us-east-1
./quick-deploy.sh 59club-async-export-staging us-east-1
./quick-deploy.sh 59club-async-export-prod us-east-1
```

Each with different environment variables:
```bash
# DEV Lambda environment
FRONTEND_URL=https://app-dev.test.com
BACKEND_URL=https://api-dev.test.com

# PROD Lambda environment  
FRONTEND_URL=https://app.test.com
BACKEND_URL=https://api.test.com
```

**Request payload (simpler):**
```javascript
// No URLs needed - Lambda knows its environment
await invoke({
  surveyId: "123",
  serviceEmail: "service@company.com", 
  servicePassword: "password"
});
```

**Pros:** ✅ Environment isolation, no URLs in requests, simpler payload  
**Cons:** ❌ Multiple functions to maintain

---

## **Strategy 3: Hybrid (Recommended)**

**Use Case:** Best of both worlds - URLs optional in request, environment variables as fallback

### How It Works (Now Implemented)

The Lambda now accepts URLs in **either** the request **OR** environment variables:

**Option A - Request with URLs:**
```javascript
await invoke({
  surveyId: "123",
  frontendUrl: "https://app-dev.test.com",  // Override env vars
  backendUrl: "https://api-dev.test.com",   // Override env vars
  serviceEmail: "service@company.com",
  servicePassword: "password"
});
```

**Option B - Request without URLs (uses env vars):**
```javascript
await invoke({
  surveyId: "123",
  // frontendUrl/backendUrl omitted - uses FRONTEND_URL/BACKEND_URL env vars
  serviceEmail: "service@company.com", 
  servicePassword: "password"
});
```

### Deployment Examples

**Single Lambda with Environment Variables:**
```bash
# Deploy one Lambda with prod URLs as defaults
aws lambda update-function-configuration \
  --function-name 59club-async-export-lambda \
  --environment Variables='{
    "FRONTEND_URL": "https://app.test.com",
    "BACKEND_URL": "https://api.test.com"
  }'
```

**Multiple Lambdas (recommended):**
```bash
# DEV Lambda
aws lambda update-function-configuration \
  --function-name 59club-async-export-dev \
  --environment Variables='{
    "FRONTEND_URL": "https://app-dev.test.com", 
    "BACKEND_URL": "https://api-dev.test.com"
  }'

# PROD Lambda
aws lambda update-function-configuration \
  --function-name 59club-async-export-prod \
  --environment Variables='{
    "FRONTEND_URL": "https://app.test.com",
    "BACKEND_URL": "https://api.test.com"
  }'
```

## **Recommended Approach for You**

Based on typical enterprise patterns, I recommend **Strategy 3 with separate Lambdas per environment:**

### **Why This Works Best:**

1. **Environment Isolation:** Prod Lambda can't accidentally hit dev APIs
2. **Simpler Requests:** Frontend doesn't need to know URLs
3. **Security:** Environment-specific service accounts
4. **Flexibility:** Can still override URLs in request if needed
5. **Standard Practice:** Follows AWS best practices

### **Updated Request Format:**

```javascript
// Your frontend just needs to call the right Lambda function
// DEV Frontend → DEV Lambda (has dev URLs in env vars)
// PROD Frontend → PROD Lambda (has prod URLs in env vars)

await invoke('59club-async-export-prod', {  // Function name indicates environment
  surveyId: "123",
  participantId: "456", 
  adminEmails: ["admin@company.com"],
  serviceEmail: "prod-service@company.com",
  servicePassword: "prod-password"
  // No URLs needed!
});
```

### **Deployment Commands:**

```bash
# Deploy to dev
FUNCTION_NAME=59club-async-export-dev ./quick-deploy.sh

# Deploy to prod  
FUNCTION_NAME=59club-async-export-prod ./quick-deploy.sh
```

This gives you the security and isolation of separate functions while maintaining flexibility through the hybrid URL approach.
