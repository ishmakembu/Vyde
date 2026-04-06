# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: brian-orchestrator.spec.ts >> Brian accepts friend request and call
- Location: tests\brian-orchestrator.spec.ts:3:1

# Error details

```
Error: locator.waitFor: Target page, context or browser has been closed
Call log:
  - waiting for locator('text=Incoming video call') to be visible

```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test('Brian accepts friend request and call', async ({ page, context }) => {
  4  |   // Use a longer timeout for the whole test as we are waitng for another human/agent
  5  |   test.setTimeout(600000); // 10 minutes
  6  | 
  7  |   // Grant permissions for camera/mic
  8  |   await context.grantPermissions(['camera', 'microphone']);
  9  | 
  10 |   console.log('--- BRIAN AGENT STARTED ---');
  11 |   
  12 |   const siteUrl = 'https://vyde.onrender.com';
  13 |   
  14 |   console.log('STEP 1: Logging in as Brian');
  15 |   let loaded = false;
  16 |   for (let i = 0; i < 3; i++) {
  17 |     try {
  18 |       await page.goto(`${siteUrl}/login`, { timeout: 60000 });
  19 |       await page.waitForSelector('input[placeholder="Username"]', { timeout: 30000 });
  20 |       loaded = true;
  21 |       break;
  22 |     } catch (e) {
  23 |       console.log(`Login page load attempt ${i + 1} failed, retrying...`);
  24 |       await page.waitForTimeout(5000);
  25 |     }
  26 |   }
  27 |   if (!loaded) throw new Error('Failed to load login page after 3 attempts');
  28 |   await page.waitForLoadState('networkidle');
  29 |   
  30 |   await page.fill('input[placeholder="Username"]', 'brian');
  31 |   await page.fill('input[placeholder="Password"]', '12345678');
  32 |   await page.click('button:has-text("Enter Vide")');
  33 | 
  34 |   await page.waitForURL('**/directory', { timeout: 30000 });
  35 |   
  36 |   console.log('STEP 2: Navigating to Friends page (testing global modal)');
  37 |   await page.goto(`${siteUrl}/friends`);
  38 | 
  39 |   console.log('STEP 3: Checking for incoming friend requests in Notifications');
  40 |   // Since we are on directory, we need to handle accepting requests via the UI.
  41 |   // Actually, let's go to friends JUST for the acceptance, then back to directory?
  42 |   // Or just accept the request in /friends and quickly go back.
  43 |   
  44 |   console.log('Navigating to /friends briefly to accept request...');
  45 |   await page.goto(`${siteUrl}/friends`);
  46 |   const requestsTab = page.locator('button:has-text("Requests")');
  47 |   await requestsTab.waitFor({ state: 'visible' });
  48 |   await requestsTab.click();
  49 | 
  50 |   console.log('STEP 4: Waiting for friend request from the new user...');
  51 |   // Wait for the "Accept" button to appear in the requests list
  52 |   const acceptButton = page.locator('button:has-text("Accept")');
  53 |   // We wait up to 5 minutes for the other agent to send the request
  54 |   await acceptButton.waitFor({ state: 'visible', timeout: 300000 }); 
  55 |   
  56 |   console.log('STEP 5: Accepting friend request');
  57 |   await acceptButton.click();
  58 |   console.log('FRIEND REQUEST ACCEPTED');
  59 | 
  60 |   console.log('STEP 6: Staying on FRIENDS page, waiting for global incoming call modal...');
  61 |   const incomingCallModal = page.locator('text=Incoming video call');
> 62 |   await incomingCallModal.waitFor({ state: 'visible', timeout: 300000 });
     |                           ^ Error: locator.waitFor: Target page, context or browser has been closed
  63 | 
  64 |   console.log('STEP 7: Accepting call');
  65 |   // Locate the specific Accept button in the modal
  66 |   // Based on code: <button onClick={onAccept}><span ...>Accept</span></button>
  67 |   const acceptCallButton = page.locator('button:has(span:text-is("Accept"))');
  68 |   await acceptCallButton.click();
  69 | 
  70 |   console.log('STEP 8: Verification - Entering Call Page');
  71 |   await page.waitForURL('**/call', { timeout: 30000 });
  72 |   console.log('SUCCESS: BRIAN HAS ENTERED THE CALL');
  73 |   
  74 |   // Keep the session alive for a bit to ensure the other side sees us
  75 |   console.log('Waiting in call for 30 seconds...');
  76 |   await page.waitForTimeout(30000);
  77 |   
  78 |   console.log('--- BRIAN AGENT FINISHED ---');
  79 | });
  80 | 
```