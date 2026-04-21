const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('http://localhost:8080/');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '../screenshot-landing-light.png', fullPage: true });
  
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '../screenshot-landing-dark.png', fullPage: true });
  await browser.close();
})();
