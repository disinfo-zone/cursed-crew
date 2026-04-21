const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://localhost:8080/c/starving-barnacle-keg');
  await page.waitForTimeout(500);
  await page.fill('input[placeholder="One-Eye"]', 'Test Scallywag');
  await page.click('button:has-text("Step Aboard")');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '../screenshot-ledger-mobile.png', fullPage: true });
  await browser.close();
})();
