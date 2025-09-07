const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
const path = require("path");
const fs = require("fs");
const { logger } = require("../utils/logger");

/**
 * Service for handling PDF generation using Puppeteer and Chrome
 */
class PuppeteerService {
  constructor(requestId) {
    this.requestId = requestId;
    this.downloadPath = "/tmp";
    this.timeout = parseInt(process.env.TIMEOUT_MS) || 150000; // 2.5 minutes default
  }

  /**
   * Main method to generate PDF
   * @param {Object} params - Generation parameters
   * @returns {Object} - { browser, pdfBuffer }
   */
  async generatePDF(params) {
    const { surveyId, participantId, baseUrl, backendUrl, accessToken } = params;

    logger.info("Starting PDF generation process", {
      requestId: this.requestId,
      surveyId,
      participantId,
    });

    // Launch browser with optimized settings for Lambda
    const browser = await this.launchBrowser();

    try {
      // Create new page for authentication
      const authPage = await browser.newPage();

      // Perform authentication via browser context
      await this.authenticateViaPuppeteer(authPage, backendUrl, accessToken);

      // Create new page for PDF generation with download monitoring
      const pdfPage = await browser.newPage();
      await this.setupDownloadMonitoring(pdfPage);

      // Navigate to export URL and trigger PDF download
      const exportUrl = `${baseUrl}/en-GB/surveys/${surveyId}/results/by-user?download=pdf&participantIds=${participantId}&asyncExport=true`;

      logger.info("Navigating to export URL", {
        requestId: this.requestId,
        exportUrl,
      });

      const pdfBuffer = await this.capturePDFDownload(pdfPage, exportUrl);

      logger.info("PDF generation completed successfully", {
        requestId: this.requestId,
        pdfSize: pdfBuffer.length,
      });

      return { browser, pdfBuffer };
    } catch (error) {
      logger.error("Error during PDF generation", {
        requestId: this.requestId,
        error: error.message,
        stack: error.stack,
      });

      // Close browser on error to prevent resource leaks
      try {
        await browser.close();
      } catch (closeError) {
        logger.error("Error closing browser after failure", {
          requestId: this.requestId,
          error: closeError.message,
        });
      }

      throw error;
    }
  }

  /**
   * Launch Chrome browser with Lambda-optimized settings
   * @returns {Object} - Puppeteer browser instance
   */
  async launchBrowser() {
    logger.info("Launching Chrome browser", { requestId: this.requestId });

    const startTime = Date.now();

    try {
      const browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-chrome-extensions",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-features=TranslateUI",
          "--disable-ipc-flooding-protection",
          "--single-process",
          "--no-zygote",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(",") : []),
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        ignoreHTTPSErrors: true,
        timeout: this.timeout,
      });

      const launchTime = Date.now() - startTime;
      logger.info("Browser launched successfully", {
        requestId: this.requestId,
        launchTime,
      });

      return browser;
    } catch (error) {
      const launchTime = Date.now() - startTime;
      logger.error("Failed to launch browser", {
        requestId: this.requestId,
        error: error.message,
        launchTime,
      });
      throw new Error(`Browser launch failed: ${error.message}`);
    }
  }

  /**
   * Authenticate using browser context (more reliable than server-side fetch)
   * @param {Object} page - Puppeteer page instance
   * @param {string} backendUrl - Backend API URL
   * @param {string} accessToken - Access token for authentication
   */
  async authenticateViaPuppeteer(page, backendUrl, accessToken) {
    logger.info("Starting browser-context authentication", {
      requestId: this.requestId,
      backendUrl,
    });

    try {
      // Set user agent and headers
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
      );

      // Set authorization header
      await page.setExtraHTTPHeaders({
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      });

      // Test authentication by making a request to a protected endpoint
      const authResult = await page.evaluate(
        async (backendUrl, accessToken) => {
          try {
            const response = await fetch(`${backendUrl}/auth/verify`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            });

            return {
              success: response.ok,
              status: response.status,
              statusText: response.statusText,
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
            };
          }
        },
        backendUrl,
        accessToken
      );

      if (!authResult.success) {
        throw new Error(`Authentication failed: ${authResult.error || authResult.statusText}`);
      }

      logger.info("Browser-context authentication successful", {
        requestId: this.requestId,
        status: authResult.status,
      });
    } catch (error) {
      logger.error("Browser-context authentication failed", {
        requestId: this.requestId,
        error: error.message,
      });
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Setup download monitoring using Chrome DevTools Protocol
   * @param {Object} page - Puppeteer page instance
   */
  async setupDownloadMonitoring(page) {
    logger.info("Setting up download monitoring", { requestId: this.requestId });

    // Get CDP session
    const client = await page.target().createCDPSession();

    // Enable necessary domains
    await client.send("Page.enable");
    await client.send("Browser.enable");

    // Set download behavior
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: this.downloadPath,
    });

    // Store client reference for later use
    this.cdpClient = client;
    this.downloadPromise = null;

    logger.info("Download monitoring setup complete", {
      requestId: this.requestId,
      downloadPath: this.downloadPath,
    });
  }

  /**
   * Capture PDF download by monitoring Chrome DevTools events
   * @param {Object} page - Puppeteer page instance
   * @param {string} exportUrl - URL to navigate to for PDF download
   * @returns {Buffer} - PDF file buffer
   */
  async capturePDFDownload(page, exportUrl) {
    logger.info("Starting PDF download capture", {
      requestId: this.requestId,
      exportUrl,
    });

    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("PDF download timeout exceeded"));
      }, this.timeout);

      // Monitor download events
      this.cdpClient.on("Browser.downloadWillBegin", (params) => {
        logger.info("Download started", {
          requestId: this.requestId,
          guid: params.guid,
          url: params.url,
          suggestedFilename: params.suggestedFilename,
        });
      });

      this.cdpClient.on("Browser.downloadProgress", (params) => {
        if (params.state === "completed") {
          logger.info("Download completed", {
            requestId: this.requestId,
            guid: params.guid,
            totalBytes: params.totalBytes,
          });

          clearTimeout(timeout);

          // Read the downloaded file
          const filename = `${params.guid}.pdf`;
          const filePath = path.join(this.downloadPath, filename);

          // Wait a bit for file to be fully written
          setTimeout(() => {
            try {
              if (fs.existsSync(filePath)) {
                const pdfBuffer = fs.readFileSync(filePath);

                // Clean up downloaded file
                fs.unlinkSync(filePath);

                logger.info("PDF file read and cleaned up", {
                  requestId: this.requestId,
                  filePath,
                  bufferSize: pdfBuffer.length,
                });

                resolve(pdfBuffer);
              } else {
                reject(new Error(`Downloaded file not found: ${filePath}`));
              }
            } catch (error) {
              reject(new Error(`Error reading downloaded file: ${error.message}`));
            }
          }, 1000);
        } else if (params.state === "canceled" || params.state === "interrupted") {
          clearTimeout(timeout);
          reject(new Error(`Download ${params.state}: ${params.guid}`));
        }
      });

      try {
        // Navigate to the export URL to trigger download
        logger.info("Navigating to export URL", {
          requestId: this.requestId,
          exportUrl,
        });

        await page.goto(exportUrl, {
          waitUntil: "networkidle2",
          timeout: this.timeout,
        });

        // Wait for any additional page load events
        await page.waitForTimeout(2000);
      } catch (error) {
        clearTimeout(timeout);
        logger.error("Error navigating to export URL", {
          requestId: this.requestId,
          error: error.message,
        });
        reject(new Error(`Navigation failed: ${error.message}`));
      }
    });
  }
}

module.exports = { PuppeteerService };
