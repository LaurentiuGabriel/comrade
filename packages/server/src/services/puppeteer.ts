/**
 * Puppeteer Web Automation Service
 * Provides browser automation capabilities for web navigation and interaction
 * 
 * IMPORTANT: Puppeteer must be installed separately:
 *   cd packages/server && npm install puppeteer
 * 
 * This is a heavy dependency (~300MB) so it's not included by default.
 */

import { EventEmitter } from 'events';

// Type declarations for when puppeteer is not installed
type Browser = any;
type Page = any;
type ElementHandle = any;

// Puppeteer will be loaded when methods are called
// We check for its availability at runtime
let puppeteerInstance: any = null;

function getPuppeteer(): any {
  if (puppeteerInstance === null) {
    try {
      // Try to require puppeteer
      const puppeteerModule = require('puppeteer');
      puppeteerInstance = puppeteerModule.default || puppeteerModule;
    } catch (e) {
      puppeteerInstance = undefined;
    }
  }
  return puppeteerInstance;
}

export interface NavigationOptions {
  url: string;
  waitForSelector?: string;
  timeout?: number;
}

export interface ClickOptions {
  selector: string;
  waitForNavigation?: boolean;
}

export interface FormFillOptions {
  selector: string;
  value: string;
  clearFirst?: boolean;
}

export interface ScreenshotOptions {
  selector?: string;
  fullPage?: boolean;
  outputPath?: string;
}

export interface ExtractOptions {
  selector: string;
  attribute?: string;
  multiple?: boolean;
}

export class PuppeteerService extends EventEmitter {
  private browser: Browser | null = null;
  private pages: Map<string, Page> = new Map();
  private currentPageId: string | null = null;

  private checkPuppeteer(): any {
    const puppeteer = getPuppeteer();
    if (!puppeteer) {
      throw new Error(
        'Puppeteer is not installed. To use web automation tools, please install puppeteer:\n' +
        '  cd packages/server && npm install puppeteer\n\n' +
        'Note: Puppeteer is a large dependency (~300MB) and is not included by default.'
      );
    }
    return puppeteer;
  }

  /**
   * Launch a new browser instance
   */
  async launchBrowser(headless: boolean = false): Promise<string> {
    const puppeteer = this.checkPuppeteer();
    
    try {
      this.browser = await puppeteer.launch({
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1280,800'
        ],
        defaultViewport: {
          width: 1280,
          height: 800
        }
      });

      const browserId = `browser_${Date.now()}`;
      this.emit('browserLaunched', { browserId, headless });
      
      console.log(`[puppeteer] Browser launched (headless: ${headless})`);
      return browserId;
    } catch (error) {
      console.error('[puppeteer] Failed to launch browser:', error);
      throw error;
    }
  }

  /**
   * Close the browser instance
   */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.pages.clear();
      this.currentPageId = null;
      this.emit('browserClosed');
      console.log('[puppeteer] Browser closed');
    }
  }

  /**
   * Navigate to a URL
   */
  async navigate(options: NavigationOptions): Promise<{ success: boolean; url: string; title: string }> {
    if (!this.browser) {
      await this.launchBrowser();
    }

    try {
      let page: Page;
      
      if (this.currentPageId && this.pages.has(this.currentPageId)) {
        page = this.pages.get(this.currentPageId)!;
      } else {
        page = await this.browser!.newPage();
        const pageId = `page_${Date.now()}`;
        this.pages.set(pageId, page);
        this.currentPageId = pageId;
        
        // Set up event listeners for the page
        page.on('console', (msg: any) => {
          console.log(`[puppeteer][console] ${msg.text()}`);
        });
        
        page.on('error', (err: any) => {
          console.error('[puppeteer][page error]', err);
        });
      }

      const timeout = options.timeout || 30000;
      
      await page.goto(options.url, {
        waitUntil: 'networkidle2',
        timeout
      });

      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout });
      }

      const url = page.url();
      const title = await page.title();

      this.emit('navigated', { url, title });
      
      return { success: true, url, title };
    } catch (error) {
      console.error('[puppeteer] Navigation failed:', error);
      throw error;
    }
  }

  /**
   * Click on an element
   */
  async click(options: ClickOptions): Promise<boolean> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    try {
      if (options.waitForNavigation) {
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'networkidle2' }),
          page.click(options.selector)
        ]);
      } else {
        await page.click(options.selector);
      }

      this.emit('clicked', { selector: options.selector });
      return true;
    } catch (error) {
      console.error('[puppeteer] Click failed:', error);
      throw error;
    }
  }

  /**
   * Fill a form field
   */
  async fillFormField(options: FormFillOptions): Promise<boolean> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    try {
      await page.waitForSelector(options.selector);

      if (options.clearFirst) {
        await page.evaluate((sel: string) => {
          const element = document.querySelector(sel) as HTMLInputElement;
          if (element) element.value = '';
        }, options.selector);
      }

      await page.type(options.selector, options.value);
      
      this.emit('fieldFilled', { selector: options.selector, value: options.value });
      return true;
    } catch (error) {
      console.error('[puppeteer] Form fill failed:', error);
      throw error;
    }
  }

  /**
   * Select an option from a dropdown
   */
  async selectOption(selector: string, value: string): Promise<boolean> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    try {
      await page.waitForSelector(selector);
      await page.select(selector, value);
      
      this.emit('optionSelected', { selector, value });
      return true;
    } catch (error) {
      console.error('[puppeteer] Select option failed:', error);
      throw error;
    }
  }

  /**
   * Take a screenshot
   */
  async screenshot(options: ScreenshotOptions = {}): Promise<string> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    try {
      let screenshotData: string;

      if (options.selector) {
        const element = await page.$(options.selector);
        if (!element) throw new Error(`Element not found: ${options.selector}`);
        
        screenshotData = await element.screenshot({
          encoding: 'base64'
        }) as string;
      } else {
        screenshotData = await page.screenshot({
          fullPage: options.fullPage,
          encoding: 'base64'
        }) as string;
      }

      this.emit('screenshot', { selector: options.selector, fullPage: options.fullPage });
      
      // Return as data URL
      return `data:image/png;base64,${screenshotData}`;
    } catch (error) {
      console.error('[puppeteer] Screenshot failed:', error);
      throw error;
    }
  }

  /**
   * Extract text or attributes from elements
   */
  async extractData(options: ExtractOptions): Promise<string | string[]> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    try {
      await page.waitForSelector(options.selector);

      if (options.multiple) {
        const elements = await page.$$(options.selector);
        const results: string[] = [];

        for (const element of elements) {
          if (options.attribute) {
            const value = await element.evaluate((el: Element, attr: string) => el.getAttribute(attr), options.attribute);
            if (value) results.push(value);
          } else {
            const text = await element.evaluate((el: Element) => el.textContent || '');
            results.push(text.trim());
          }
        }

        return results;
      } else {
        const element = await page.$(options.selector);
        if (!element) throw new Error(`Element not found: ${options.selector}`);

        if (options.attribute) {
          return await element.evaluate((el: Element, attr: string) => el.getAttribute(attr) || '', options.attribute);
        } else {
          return await element.evaluate((el: Element) => el.textContent || '');
        }
      }
    } catch (error) {
      console.error('[puppeteer] Data extraction failed:', error);
      throw error;
    }
  }

  /**
   * Wait for a specific condition
   */
  async waitFor(selector: string, timeout: number = 5000): Promise<boolean> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    try {
      await page.waitForSelector(selector, { timeout });
      return true;
    } catch (error) {
      console.error('[puppeteer] Wait failed:', error);
      throw error;
    }
  }

  /**
   * Scroll the page
   */
  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number = 300): Promise<boolean> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    try {
      let x = 0, y = 0;
      
      switch (direction) {
        case 'up': y = -amount; break;
        case 'down': y = amount; break;
        case 'left': x = -amount; break;
        case 'right': x = amount; break;
      }

      await page.evaluate((scrollX: number, scrollY: number) => {
        window.scrollBy(scrollX, scrollY);
      }, x, y);

      return true;
    } catch (error) {
      console.error('[puppeteer] Scroll failed:', error);
      throw error;
    }
  }

  /**
   * Get the current page URL and title
   */
  async getPageInfo(): Promise<{ url: string; title: string }> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    return {
      url: page.url(),
      title: await page.title()
    };
  }

  /**
   * Evaluate JavaScript on the page
   */
  async evaluate(script: string): Promise<unknown> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    try {
      return await page.evaluate(new Function(script) as () => unknown);
    } catch (error) {
      console.error('[puppeteer] Script evaluation failed:', error);
      throw error;
    }
  }

  /**
   * Check if an element exists
   */
  async elementExists(selector: string): Promise<boolean> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    const element = await page.$(selector);
    return element !== null;
  }

  /**
   * Get all links on the page
   */
  async getAllLinks(): Promise<Array<{ text: string; href: string }>> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    return await page.evaluate(() => {
      const links = document.querySelectorAll('a');
      return Array.from(links).map(link => ({
        text: link.textContent?.trim() || '',
        href: link.href || ''
      }));
    });
  }

  /**
   * Set viewport size
   */
  async setViewport(width: number, height: number): Promise<void> {
    const page = this.getCurrentPage();
    if (!page) throw new Error('No active page');

    await page.setViewport({ width, height });
  }

  private getCurrentPage(): Page | null {
    if (!this.currentPageId) return null;
    return this.pages.get(this.currentPageId) || null;
  }
}
