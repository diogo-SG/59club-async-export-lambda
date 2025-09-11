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
   * @returns {Object} - { browser, pdfBuffer, accessToken }
   */
  async generatePDF(params) {
    const { surveyId, participantId, frontendUrl, backendUrl, serviceEmail, servicePassword } = params;

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

      // Perform authentication via browser context and get access token
      const accessToken = await this.authenticateViaPuppeteer(authPage, backendUrl, serviceEmail, servicePassword);

      // Create new page for PDF generation with download monitoring
      const pdfPage = await browser.newPage();

      // Set authorization header on the PDF page as well
      await pdfPage.setExtraHTTPHeaders({
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      });

      await this.setupDownloadMonitoring(pdfPage);

      // Navigate to export URL and trigger PDF download
      const exportUrl = `${frontendUrl}/en-GB/surveys/${surveyId}/results/by-user?download=pdf&participantIds=${participantId}&asyncExport=true`;

      logger.info("Navigating to export URL", {
        requestId: this.requestId,
        exportUrl,
      });

      const pdfBuffer = await this.capturePDFDownload(pdfPage, exportUrl);

      logger.info("PDF generation completed successfully", {
        requestId: this.requestId,
        pdfSize: pdfBuffer.length,
      });

      return { browser, pdfBuffer, accessToken };
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
      // Ensure chromium is properly configured for Lambda
      const executablePath = await chromium.executablePath();

      logger.info("Chromium configuration", {
        requestId: this.requestId,
        executablePath,
        isLambda: !!process.env.AWS_LAMBDA_FUNCTION_NAME,
        tmpDir: process.env.TMPDIR || "/tmp",
      });

      const browser = await puppeteer.launch({
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-extensions",
          "--disable-default-apps",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-features=TranslateUI,VizDisplayCompositor,AudioServiceOutOfProcess",
          "--disable-background-networking",
          "--disable-background-media",
          "--disable-client-side-phishing-detection",
          "--disable-sync",
          "--disable-translate",
          "--hide-scrollbars",
          "--metrics-recording-only",
          "--mute-audio",
          "--no-default-browser-check",
          "--no-pings",
          "--password-store=basic",
          "--use-mock-keychain",
          "--disable-component-extensions-with-background-pages",
          "--disable-breakpad",
          "--disable-component-update",
          "--disable-domain-reliability",
          "--disable-features=AudioServiceOutOfProcess,VizDisplayCompositor",
          "--disable-print-preview",
          "--disable-speech-api",
          "--disable-file-system",
          ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(",") : []),
        ],
        defaultViewport: chromium.defaultViewport,
        executablePath,
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
   * Authenticate using browser context by performing login with service account
   * @param {Object} page - Puppeteer page instance
   * @param {string} backendUrl - Backend API URL
   * @param {string} serviceEmail - Service account email
   * @param {string} servicePassword - Service account password
   * @returns {string} - Access token obtained from login
   */
  async authenticateViaPuppeteer(page, backendUrl, serviceEmail, servicePassword) {
    logger.info("Starting browser-context authentication", {
      requestId: this.requestId,
      backendUrl,
      serviceEmail,
    });

    try {
      // Set user agent and headers
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
      );

      // Perform login to get access token
      const authResult = await page.evaluate(
        async (backendUrl, serviceEmail, servicePassword) => {
          try {
            const response = await fetch(`${backendUrl}/auth/login`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                email: serviceEmail,
                password: servicePassword,
              }),
            });

            if (!response.ok) {
              return {
                success: false,
                status: response.status,
                statusText: response.statusText,
              };
            }

            const data = await response.json();
            return {
              success: true,
              status: response.status,
              accessToken: data.accessToken || data.token || data.access_token,
              user: data.user,
            };
          } catch (error) {
            return {
              success: false,
              error: error.message,
            };
          }
        },
        backendUrl,
        serviceEmail,
        servicePassword
      );

      if (!authResult.success) {
        throw new Error(`Login failed: ${authResult.error || authResult.statusText} (${authResult.status})`);
      }

      if (!authResult.accessToken) {
        throw new Error("Login response missing access token");
      }

      // Set authorization header for subsequent requests
      await page.setExtraHTTPHeaders({
        Authorization: `Bearer ${authResult.accessToken}`,
        "Content-Type": "application/json",
      });

      logger.info("Browser-context authentication successful", {
        requestId: this.requestId,
        status: authResult.status,
        userEmail: authResult.user?.email,
      });

      return authResult.accessToken;
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
