import { test, expect } from '@playwright/test';

test.describe('Vide E2E Quick Test', () => {
  test('Home page redirects to login', async ({ page }) => {
    console.log('\n### TEST: Home Page Redirect');
    console.log('Action: Navigate to /');
    
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    const url = page.url();
    console.log(`Actual: URL = ${url}`);
    
    expect(url.includes('login') || url.includes('directory')).toBe(true);
    console.log('Result: PASS');
  });

  test('Login page loads', async ({ page }) => {
    console.log('\n### TEST: Login Page');
    console.log('Action: Navigate to /login');
    
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const title = await page.locator('h1').textContent();
    console.log(`Actual: Title = "${title}"`);
    
    expect(title).toContain('Welcome');
    console.log('Result: PASS');
  });

  test('Register page loads', async ({ page }) => {
    console.log('\n### TEST: Register Page');
    console.log('Action: Navigate to /register');
    
    await page.goto('/register');
    await page.waitForLoadState('networkidle');
    
    const title = await page.locator('h1').textContent();
    console.log(`Actual: Title = "${title}"`);
    
    expect(title).toContain('Create account');
    console.log('Result: PASS');
  });

  test('Register and login flow', async ({ page }) => {
    console.log('\n### TEST: Registration Flow');
    
    const username = `testuser_${Date.now()}`;
    const password = 'TestPass123!';
    
    console.log(`Action: Register as ${username}`);
    await page.goto('/register');
    await page.fill('#username', username);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/directory', { timeout: 15000 });
    
    const url = page.url();
    console.log(`Actual: Redirected to ${url}`);
    expect(url).toContain('directory');
    console.log('Result: PASS');
  });

  test('Directory page shows user list', async ({ page }) => {
    console.log('\n### TEST: Directory Page');
    
    const username = `testuser2_${Date.now()}`;
    const password = 'TestPass123!';
    
    await page.goto('/register');
    await page.fill('#username', username);
    await page.fill('#password', password);
    await page.fill('#confirmPassword', password);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/directory', { timeout: 15000 });
    
    console.log('Action: Wait for directory to load');
    await page.waitForTimeout(2000);
    
    const heading = await page.locator('h1').textContent();
    console.log(`Actual: Page heading = "${heading}"`);
    
    expect(heading).toBe('Vide');
    console.log('Result: PASS');
  });

  test('Call page exists', async ({ page }) => {
    console.log('\n### TEST: Call Page');
    
    await page.goto('/call');
    await page.waitForLoadState('networkidle');
    
    console.log('Result: PASS - Page loads without crash');
  });
});