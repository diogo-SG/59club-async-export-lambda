const axios = require("axios");
const FormData = require("form-data");
const { logger } = require("../utils/logger");
const { sanitizeString } = require("../utils/validation");

/**
 * Service for uploading PDFs to backend storage API
 */
class UploadService {
  constructor(backendUrl, accessToken, requestId, environment) {
    this.backendUrl = backendUrl;
    this.accessToken = accessToken;
    this.requestId = requestId;
    this.environment = environment;
    this.uploadEndpoint = `${backendUrl}/media`;
    this.timeout = 60000; // 60 seconds for upload
  }

  /**
   * Upload PDF buffer to backend storage
   * @param {Buffer} pdfBuffer - PDF file buffer
   * @param {string} filename - Suggested filename
   * @returns {string} - URL of uploaded file
   */
  async uploadPDF(pdfBuffer, filename) {
    logger.info("Starting PDF upload", {
      requestId: this.requestId,
      filename,
      fileSize: pdfBuffer.length,
      endpoint: this.uploadEndpoint,
    });

    try {
      // Sanitize filename
      const sanitizedFilename = sanitizeString(filename);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const finalFilename = `${timestamp}_${sanitizedFilename}`;

      // Create form data
      const formData = new FormData();
      formData.append("file", pdfBuffer, {
        filename: finalFilename,
        contentType: "application/pdf",
      });
      formData.append("folder", "exports");

      // Prepare headers
      const headers = {
        Authorization: `Bearer ${this.accessToken}`,
        ...formData.getHeaders(),
      };

      logger.info("Uploading PDF to backend", {
        requestId: this.requestId,
        finalFilename,
        folder: "exports",
        contentLength: formData.getLengthSync(),
      });

      // Upload file
      const response = await axios.post(this.uploadEndpoint, formData, {
        headers,
        timeout: this.timeout,
        maxContentLength: 50 * 1024 * 1024, // 50MB max
        maxBodyLength: 50 * 1024 * 1024,
      });

      // Log the actual response structure for debugging
      logger.info("Upload response received", {
        requestId: this.requestId,
        status: response.status,
        headers: response.headers,
        dataKeys: response.data ? Object.keys(response.data) : "no data",
        fullResponse: JSON.stringify(response.data, null, 2),
      });

      // Validate response
      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }

      if (!response.data) {
        throw new Error("Upload response missing data object");
      }

      // Try multiple possible field names
      const fileLocation =
        response.data.fileLocation ||
        response.data.data?.fileLocation ||
        response.data.file?.location ||
        response.data.url;

      if (!fileLocation) {
        logger.error("No file location found in response", {
          requestId: this.requestId,
          availableFields: Object.keys(response.data),
          responseData: JSON.stringify(response.data, null, 2),
        });
        throw new Error("Upload response missing file location or URL");
      }

      const fileUrl = this.buildCloudFrontUrl(fileLocation);

      logger.info("PDF upload completed successfully", {
        requestId: this.requestId,
        fileUrl,
        responseStatus: response.status,
        finalFilename,
      });

      return fileUrl;
    } catch (error) {
      logger.error("PDF upload failed", {
        requestId: this.requestId,
        error: error.message,
        endpoint: this.uploadEndpoint,
        errorCode: error.code,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
      });

      // Provide more specific error messages
      if (error.code === "ECONNREFUSED") {
        throw new Error("Unable to connect to upload service");
      } else if (error.code === "ETIMEDOUT") {
        throw new Error("Upload timeout exceeded");
      } else if (error.response?.status === 401) {
        throw new Error("Upload authentication failed");
      } else if (error.response?.status === 413) {
        throw new Error("File too large for upload");
      } else if (error.response?.status >= 500) {
        throw new Error("Upload service temporarily unavailable");
      } else {
        throw new Error(`Upload failed: ${error.message}`);
      }
    }
  }

  /**
   * Build CloudFront URL from file location based on environment
   * @param {string} fileLocation - File location from upload response
   * @returns {string} - Full CloudFront URL
   */
  buildCloudFrontUrl(fileLocation) {
    // If fileLocation is already a full URL, return it as-is
    if (fileLocation.startsWith("http://") || fileLocation.startsWith("https://")) {
      logger.info("Using provided full URL", {
        requestId: this.requestId,
        fullUrl: fileLocation,
      });
      return fileLocation;
    }

    // Environment to CloudFront domain mapping
    const cloudFrontDomains = {
      local: "dev.assets.59club.studiographene.xyz",
      dev: "dev.assets.59club.studiographene.xyz",
      qa: "qa.assets.59club.studiographene.xyz",
      staging: "club59-uat-assets-origin.s3.eu-west-1.amazonaws.com",
      prod: "club59-uat-assets-origin.s3.eu-west-1.amazonaws.com", // Use staging for now
    };

    const domain = cloudFrontDomains[this.environment] || cloudFrontDomains.staging;
    const fullUrl = `https://${domain}/${fileLocation}`;

    logger.info("Built CloudFront URL", {
      requestId: this.requestId,
      environment: this.environment,
      domain,
      fileLocation,
      fullUrl,
    });

    return fullUrl;
  }

  /**
   * Verify upload endpoint is accessible
   * @returns {boolean} - Whether endpoint is accessible
   */
  async verifyEndpoint() {
    try {
      logger.info("Verifying upload endpoint", {
        requestId: this.requestId,
        endpoint: this.uploadEndpoint,
      });

      const response = await axios.head(this.uploadEndpoint, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 10000,
      });

      const isAccessible = response.status < 400;

      logger.info("Upload endpoint verification result", {
        requestId: this.requestId,
        isAccessible,
        status: response.status,
      });

      return isAccessible;
    } catch (error) {
      logger.error("Upload endpoint verification failed", {
        requestId: this.requestId,
        error: error.message,
        status: error.response?.status,
      });

      return false;
    }
  }

  /**
   * Get upload progress (if supported by backend)
   * @param {string} uploadId - Upload identifier
   * @returns {Object} - Upload progress information
   */
  async getUploadProgress(uploadId) {
    try {
      const progressEndpoint = `${this.backendUrl}/media/progress/${uploadId}`;

      const response = await axios.get(progressEndpoint, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        timeout: 5000,
      });

      return response.data;
    } catch (error) {
      logger.error("Failed to get upload progress", {
        requestId: this.requestId,
        uploadId,
        error: error.message,
      });

      return null;
    }
  }

  /**
   * Delete uploaded file (cleanup utility)
   * @param {string} fileUrl - URL of file to delete
   * @returns {boolean} - Whether deletion was successful
   */
  async deleteFile(fileUrl) {
    try {
      logger.info("Deleting uploaded file", {
        requestId: this.requestId,
        fileUrl,
      });

      // Extract file ID from URL if needed
      const deleteEndpoint = `${this.backendUrl}/media`;

      const response = await axios.delete(deleteEndpoint, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
        data: { url: fileUrl },
        timeout: 10000,
      });

      const success = response.status < 400;

      logger.info("File deletion result", {
        requestId: this.requestId,
        fileUrl,
        success,
        status: response.status,
      });

      return success;
    } catch (error) {
      logger.error("File deletion failed", {
        requestId: this.requestId,
        fileUrl,
        error: error.message,
      });

      return false;
    }
  }
}

module.exports = { UploadService };
