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
    this.timeout = parseInt(process.env.TIMEOUT_MS) || 450000; // 7.5 minutes default (tripled)
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
      const accessToken = await this.authenticateViaPuppeteer(
        authPage,
        backendUrl,
        serviceEmail,
        servicePassword,
        frontendUrl
      );

      // Create new page for PDF generation with download monitoring
      // Note: Cookies are automatically shared across all pages in the same browser context
      const pdfPage = await browser.newPage();

      // Set authorization header for additional security (belt and suspenders)
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
      // Use default architecture detection

      // Get chromium configuration
      const executablePath = await chromium.executablePath();

      logger.info("Using @sparticuz/chromium for Lambda", {
        requestId: this.requestId,
        executablePath,
        platform: process.platform,
        arch: process.arch,
        isLambda: !!process.env.AWS_LAMBDA_FUNCTION_NAME,
      });

      // Debug: Check if binary exists and get file info
      if (fs.existsSync(executablePath)) {
        const stats = fs.statSync(executablePath);
        logger.info("Chromium binary info", {
          requestId: this.requestId,
          size: stats.size,
          executable: !!(stats.mode & parseInt("111", 8)),
        });

        // Try to get file type info
        try {
          const { execSync } = require("child_process");
          const fileInfo = execSync(`file "${executablePath}"`, { encoding: "utf8", timeout: 5000 });
          logger.info("Binary file type", {
            requestId: this.requestId,
            fileInfo: fileInfo.trim(),
          });
        } catch (err) {
          logger.info("Could not determine file type", {
            requestId: this.requestId,
            error: err.message,
          });
        }
      } else {
        logger.error("Chromium binary not found", {
          requestId: this.requestId,
          executablePath,
        });
      }

      const browser = await puppeteer.launch({
        executablePath,
        args: [
          ...chromium.args,
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--single-process",
          "--no-zygote",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(",") : []),
        ],
        defaultViewport: chromium.defaultViewport,
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
        platform: process.platform,
        arch: process.arch,
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
  async authenticateViaPuppeteer(page, backendUrl, serviceEmail, servicePassword, frontendUrl) {
    logger.info("Starting browser-context authentication", {
      requestId: this.requestId,
      frontendUrl,
      serviceEmail,
    });

    try {
      // Set user agent and headers
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36"
      );

      // Navigate to the frontend login page to set cookies properly
      const loginUrl = `${frontendUrl}/en-GB/auth/login`;
      logger.info("Navigating to frontend login page", {
        requestId: this.requestId,
        loginUrl,
      });

      await page.goto(loginUrl, {
        waitUntil: "networkidle2",
        timeout: this.timeout,
      });

      // Wait for login form to be available
      await page.waitForSelector('input[type="email"], input[name="email"]', { timeout: 10000 });

      // Fill in the login form
      await page.type('input[type="email"], input[name="email"]', serviceEmail);
      await page.type('input[type="password"], input[name="password"]', servicePassword);

      // Find the submit button
      let submitButton = await page.$('button[type="submit"], input[type="submit"]');

      // If no submit button found, look for button with Login text
      if (!submitButton) {
        const loginButtons = await page.$$eval("button", (buttons) =>
          buttons.filter(
            (btn) =>
              btn.textContent?.toLowerCase().includes("login") || btn.textContent?.toLowerCase().includes("sign in")
          )
        );

        if (loginButtons.length > 0) {
          submitButton = await page.evaluateHandle(() => {
            const buttons = Array.from(document.querySelectorAll("button"));
            return buttons.find(
              (btn) =>
                btn.textContent?.toLowerCase().includes("login") || btn.textContent?.toLowerCase().includes("sign in")
            );
          });
        }
      }

      if (!submitButton) {
        throw new Error("Login submit button not found");
      }

      // Listen for network responses to catch the login API call
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes("/users/login") && response.request().method() === "POST",
        { timeout: 15000 }
      );

      // Click submit button
      await submitButton.click();

      // Wait for login response
      const loginResponse = await responsePromise;
      const responseData = await loginResponse.json();

      if (!loginResponse.ok()) {
        throw new Error(`Login failed: ${loginResponse.status()} ${loginResponse.statusText()}`);
      }

      // Extract access token from response
      const accessToken =
        responseData.data?.token || responseData.accessToken || responseData.token || responseData.access_token;

      if (!accessToken) {
        throw new Error("Login response missing access token");
      }

      // Wait for any redirect/navigation to complete
      await page.waitForTimeout(2000);

      // Check final page state
      const finalState = await page.evaluate(() => ({
        currentUrl: window.location.href,
        isLoginPage: window.location.href.includes("/auth/login"),
      }));

      // If we're still on the login page, authentication failed
      if (finalState.isLoginPage) {
        throw new Error("Authentication failed - still on login page after form submission");
      }

      logger.info("Browser-context authentication successful", {
        requestId: this.requestId,
        finalUrl: finalState.currentUrl,
        tokenReceived: !!accessToken,
      });

      return accessToken;
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

    // Try to enable Browser domain for download events (may not be available in all Chrome versions)
    try {
      await client.send("Browser.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: this.downloadPath,
      });
    } catch (browserError) {
      // Fallback to Page domain for download behavior
      logger.info("Browser domain not available, using Page domain for downloads", {
        requestId: this.requestId,
        error: browserError.message,
      });

      try {
        await client.send("Page.setDownloadBehavior", {
          behavior: "allow",
          downloadPath: this.downloadPath,
        });
      } catch (pageError) {
        logger.warn("Download behavior setup failed, PDF capture may not work", {
          requestId: this.requestId,
          browserError: browserError.message,
          pageError: pageError.message,
        });
      }
    }

    // Store client reference for later use
    this.cdpClient = client;
    this.downloadPromise = null;

    logger.info("Download monitoring setup complete", {
      requestId: this.requestId,
      downloadPath: this.downloadPath,
    });
  }

  /**
   * Capture PDF download using directory monitoring approach
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
      let timeout = setTimeout(() => {
        reject(new Error("PDF download timeout exceeded"));
      }, this.timeout);

      try {
        // Get initial files in download directory
        const initialFiles = fs.existsSync(this.downloadPath)
          ? fs.readdirSync(this.downloadPath).filter((f) => f.endsWith(".pdf"))
          : [];

        logger.info("Starting PDF download monitoring", {
          requestId: this.requestId,
          downloadPath: this.downloadPath,
          initialFileCount: initialFiles.length,
        });

        // Navigate to the export URL to trigger download
        logger.info("Navigating to export URL", {
          requestId: this.requestId,
          exportUrl,
        });

        await page.goto(exportUrl, {
          waitUntil: "networkidle2",
          timeout: this.timeout,
        });

        // Log comprehensive page state after navigation
        const initialPageState = await page.evaluate(() => {
          const exportModal =
            document.querySelector("[data-export-modal]") ||
            document.querySelector(".fixed.inset-0.z-50.flex.items-center.justify-center.bg-black.bg-opacity-50");
          const innerModal = exportModal?.querySelector(".mx-4.max-w-md.rounded-lg.bg-white.p-8.shadow-lg");

          return {
            pageTitle: document.title,
            pageUrl: window.location.href,
            readyState: document.readyState,
            hasExportModal: !!exportModal,
            hasInnerModal: !!innerModal,
            modalCount: document.querySelectorAll(".fixed.inset-0").length,
            progressElements: document.querySelectorAll(".typography-label").length,
            spinnerElements: document.querySelectorAll(".mb-4").length,
            isLoginPage: window.location.href.includes("/auth/login"),
            hasLoginForm: !!document.querySelector(
              'form[action*="login"], input[type="email"], input[type="password"]'
            ),
          };
        });

        logger.info("Page navigation completed", {
          requestId: this.requestId,
          ...initialPageState,
        });

        // Check if we got redirected to login page
        if (initialPageState.isLoginPage) {
          throw new Error(`Authentication failed - redirected to login page: ${initialPageState.pageUrl}`);
        }

        // Wait for download to start and complete
        logger.info("Waiting for PDF download to complete", {
          requestId: this.requestId,
        });

        // Poll for new PDF files and track export progress
        const pollInterval = 1000; // Check every second
        const maxPolls = Math.floor(this.timeout / pollInterval);
        let polls = 0;
        let lastLoggedProgress = -1;

        // Retry mechanism tracking
        let retryAttempts = 0;
        const maxRetries = 2;
        let wasExporting = false;
        let lastProgressTime = Date.now();

        const pollForFile = async () => {
          polls++;

          let progressInfo = null;

          try {
            // Check for export progress on the page
            try {
              progressInfo = await page.evaluate(() => {
                // Look for export modal using dual selector strategy
                // Primary: data-export-modal (when deployed), Fallback: class-based selector
                const exportModal =
                  document.querySelector("[data-export-modal]") ||
                  document.querySelector(".fixed.inset-0.z-50.flex.items-center.justify-center.bg-black.bg-opacity-50");

                let progress = null;
                let progressText = null;
                let exportStep = null;
                let isExporting = false;
                let hasSpinner = false;
                let innerModal = null;

                if (exportModal) {
                  // Validate it's the export modal by checking for inner modal
                  innerModal = exportModal.querySelector(".mx-4.max-w-md.rounded-lg.bg-white.p-8.shadow-lg");

                  if (innerModal) {
                    isExporting = true;

                    // Extract progress from data-export-progress-text or fallback selector
                    const progressElement =
                      exportModal.querySelector("[data-export-progress-text]") ||
                      exportModal.querySelector(".typography-label.mb-4.text-greyscale-500") ||
                      exportModal.querySelector(".typography-label");

                    if (progressElement && progressElement.textContent) {
                      const text = progressElement.textContent.trim();
                      const percentMatch = text.match(/(\d+)%/);
                      if (percentMatch) {
                        progress = parseInt(percentMatch[1]);
                      }
                      progressText = text;
                    }

                    // Look for export step text (h3 with "Generating Export" etc.)
                    const stepElement =
                      exportModal.querySelector(".typography-heading-3.mb-4") ||
                      exportModal.querySelector("h3.typography-heading-3");
                    if (stepElement) {
                      exportStep = stepElement.textContent?.trim();
                    }

                    // Check for loading spinner
                    hasSpinner =
                      !!exportModal.querySelector(".mb-4") ||
                      !!exportModal.querySelector('[data-testid="loading-spinner"]');
                  }
                }

                // Fallback: look for progress patterns anywhere on page if modal not found
                if (!isExporting) {
                  const allText = Array.from(document.querySelectorAll("*"))
                    .map((el) => el.textContent || "")
                    .join(" ");
                  const progressMatches = allText.match(
                    /(\d+)%\s*(complete|progress|capturing|generating|processing)/i
                  );
                  if (progressMatches) {
                    progress = parseInt(progressMatches[1]);
                    progressText = progressMatches[0];
                    isExporting = true;
                  }
                }

                return {
                  progress,
                  progressText,
                  exportStep,
                  isExporting,
                  hasModal: !!exportModal,
                  hasInnerModal: !!innerModal,
                  hasSpinner,
                  modalVisible: exportModal ? exportModal.style.display !== "none" : false,
                  documentTitle: document.title,
                  readyState: document.readyState,
                  pageUrl: window.location.href,
                };
              });

              // Log progress if it has changed significantly
              if (
                progressInfo.progress !== null &&
                (lastLoggedProgress === -1 || Math.abs(progressInfo.progress - lastLoggedProgress) >= 5)
              ) {
                logger.info("Export progress detected", {
                  requestId: this.requestId,
                  progress: progressInfo.progress,
                  progressText: progressInfo.progressText,
                  exportStep: progressInfo.exportStep,
                  isExporting: progressInfo.isExporting,
                  polls,
                });
                lastLoggedProgress = progressInfo.progress;
              }

              // Log every 30 seconds for general status
              if (polls % 30 === 0) {
                logger.info("Export monitoring status", {
                  requestId: this.requestId,
                  polls,
                  maxPolls,
                  timeElapsed: `${polls}s`,
                  timeRemaining: `${maxPolls - polls}s`,
                  documentReady: progressInfo.readyState,
                  isExporting: progressInfo.isExporting,
                  hasModal: progressInfo.hasModal,
                  hasInnerModal: progressInfo.hasInnerModal,
                  hasSpinner: progressInfo.hasSpinner,
                  modalVisible: progressInfo.modalVisible,
                  currentProgress: progressInfo.progress,
                  currentStep: progressInfo.exportStep,
                  pageUrl: progressInfo.pageUrl,
                });
              }
            } catch (progressError) {
              // Don't fail the whole process if progress monitoring fails
              if (polls % 60 === 0) {
                logger.warn("Progress monitoring failed", {
                  requestId: this.requestId,
                  error: progressError.message,
                });
              }
            }

            // Retry mechanism: detect if export failed and retry
            if (progressInfo && retryAttempts < maxRetries) {
              // If export was running but now stopped without completion, retry
              if (wasExporting && !progressInfo.isExporting && (progressInfo.progress || 0) < 100) {
                retryAttempts++;
                logger.warn("Export seems to have failed, attempting retry", {
                  requestId: this.requestId,
                  retryAttempt: retryAttempts,
                  lastProgress: progressInfo.progress,
                  wasExporting,
                  currentlyExporting: progressInfo.isExporting,
                });

                // Clear timeout and restart by navigating to URL again
                clearTimeout(timeout);

                try {
                  await page.goto(exportUrl, {
                    waitUntil: "networkidle2",
                    timeout: this.timeout,
                  });

                  // Reset tracking variables
                  polls = 0;
                  wasExporting = false;
                  lastLoggedProgress = -1;
                  lastProgressTime = Date.now();

                  // Reset timeout for retry
                  timeout = setTimeout(() => {
                    reject(new Error("PDF download timeout exceeded after retries"));
                  }, this.timeout);

                  logger.info("Retry navigation successful, resuming monitoring", {
                    requestId: this.requestId,
                    retryAttempt: retryAttempts,
                  });

                  // Continue polling
                  setTimeout(
                    () =>
                      pollForFile().catch((error) => {
                        clearTimeout(timeout);
                        reject(new Error(`Error in retry polling: ${error.message}`));
                      }),
                    pollInterval
                  );
                  return;
                } catch (retryError) {
                  logger.error("Retry navigation failed", {
                    requestId: this.requestId,
                    retryAttempt: retryAttempts,
                    error: retryError.message,
                  });
                }
              }

              // Update state tracking
              if (progressInfo.isExporting) {
                wasExporting = true;
                lastProgressTime = Date.now();
              }
            }

            const currentFiles = fs.existsSync(this.downloadPath)
              ? fs.readdirSync(this.downloadPath).filter((f) => f.endsWith(".pdf"))
              : [];

            const newFiles = currentFiles.filter((f) => !initialFiles.includes(f));

            if (newFiles.length > 0) {
              // Found a new PDF file
              clearTimeout(timeout);

              const pdfFile = newFiles[0];
              const filePath = path.join(this.downloadPath, pdfFile);

              logger.info("PDF download detected", {
                requestId: this.requestId,
                fileName: pdfFile,
                filePath,
              });

              // Wait a moment for file to be fully written
              setTimeout(() => {
                try {
                  const pdfBuffer = fs.readFileSync(filePath);

                  // Clean up downloaded file
                  fs.unlinkSync(filePath);

                  logger.info("PDF file read and cleaned up", {
                    requestId: this.requestId,
                    filePath,
                    bufferSize: pdfBuffer.length,
                  });

                  resolve(pdfBuffer);
                } catch (error) {
                  reject(new Error(`Error reading downloaded file: ${error.message}`));
                }
              }, 2000);

              return;
            }

            if (polls >= maxPolls) {
              clearTimeout(timeout);
              reject(new Error("PDF download not detected within timeout period"));
              return;
            }

            // Continue polling
            setTimeout(
              () =>
                pollForFile().catch((error) => {
                  clearTimeout(timeout);
                  reject(new Error(`Error in async polling: ${error.message}`));
                }),
              pollInterval
            );
          } catch (error) {
            clearTimeout(timeout);
            reject(new Error(`Error polling for download: ${error.message}`));
          }
        };

        // Start polling after a short delay
        setTimeout(
          () =>
            pollForFile().catch((error) => {
              clearTimeout(timeout);
              reject(new Error(`Error starting async polling: ${error.message}`));
            }),
          2000
        );
      } catch (error) {
        clearTimeout(timeout);
        logger.error("Error during PDF download capture", {
          requestId: this.requestId,
          error: error.message,
        });
        reject(new Error(`PDF capture failed: ${error.message}`));
      }
    });
  }
}

module.exports = { PuppeteerService };
