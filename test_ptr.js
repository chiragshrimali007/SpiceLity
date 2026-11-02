const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Emulate mobile device
  const iPhone = puppeteer.devices['iPhone 13'];
  await page.emulate(iPhone);
  
  await page.goto('http://localhost:3000/retailer.html', { waitUntil: 'networkidle2' });
  
  // Verify ptr-indicator exists and its initial top is -50px
  let indicatorTop = await page.$eval('#ptr-indicator', el => el.style.top);
  console.log('Initial indicator top:', indicatorTop);
  
  // We need to simulate touch events since Playwright/Puppeteer page.mouse doesn't trigger touch unless emulate is working.
  // Puppeteer's iPhone emulation enables touch events. Let's try page.touchscreen
  
  // Coordinates for swipe down
  const startX = 200;
  const startY = 100;
  const endY = 400; // swipe down by 300px
  
  // Let's hook into console to see if initApp is called or any error
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  
  // Expose a function to track when ptrRefreshing becomes true
  await page.evaluate(() => {
    // We can observe the #ptr-icon rotation or ptr-indicator top
  });
  
  console.log('Simulating swipe down...');
  await page.touchscreen.touchStart(startX, startY);
  // Move down gradually
  for (let y = startY; y <= endY; y += 10) {
    await page.touchscreen.touchMove(startX, y);
    await new Promise(r => setTimeout(r, 10));
  }
  await page.touchscreen.touchEnd();
  
  // Wait a bit for animations and initApp
  await new Promise(r => setTimeout(r, 1500));
  
  indicatorTop = await page.$eval('#ptr-indicator', el => el.style.top);
  console.log('Final indicator top after refresh should go back to -50px. Current:', indicatorTop);
  
  await browser.close();
})();
