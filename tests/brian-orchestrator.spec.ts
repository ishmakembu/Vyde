import { test, expect } from '@playwright/test';

test('Brian accepts friend request and call', async ({ page, context }) => {
  // Use a longer timeout for the whole test as we are waitng for another human/agent
  test.setTimeout(600000); // 10 minutes

  // Grant permissions for camera/mic
  await context.grantPermissions(['camera', 'microphone']);

  console.log('--- BRIAN AGENT STARTED ---');
  
  const siteUrl = 'https://vyde.onrender.com';
  
  console.log('STEP 1: Logging in as Brian');
  let loaded = false;
  for (let i = 0; i < 3; i++) {
    try {
      await page.goto(`${siteUrl}/login`, { timeout: 60000 });
      await page.waitForSelector('input[placeholder="Username"]', { timeout: 30000 });
      loaded = true;
      break;
    } catch (e) {
      console.log(`Login page load attempt ${i + 1} failed, retrying...`);
      await page.waitForTimeout(5000);
    }
  }
  if (!loaded) throw new Error('Failed to load login page after 3 attempts');
  await page.waitForLoadState('networkidle');
  
  await page.fill('input[placeholder="Username"]', 'brian');
  await page.fill('input[placeholder="Password"]', '12345678');
  await page.click('button:has-text("Enter Vide")');

  await page.waitForURL('**/directory', { timeout: 30000 });
  
  console.log('STEP 2: Navigating to Friends page (testing global modal)');
  await page.goto(`${siteUrl}/friends`);

  console.log('STEP 3: Checking for incoming friend requests in Notifications');
  // Since we are on directory, we need to handle accepting requests via the UI.
  // Actually, let's go to friends JUST for the acceptance, then back to directory?
  // Or just accept the request in /friends and quickly go back.
  
  console.log('Navigating to /friends briefly to accept request...');
  await page.goto(`${siteUrl}/friends`);
  const requestsTab = page.locator('button:has-text("Requests")');
  await requestsTab.waitFor({ state: 'visible' });
  await requestsTab.click();

  console.log('STEP 4: Waiting for friend request from the new user...');
  // Wait for the "Accept" button to appear in the requests list
  const acceptButton = page.locator('button:has-text("Accept")');
  // We wait up to 5 minutes for the other agent to send the request
  await acceptButton.waitFor({ state: 'visible', timeout: 300000 }); 
  
  console.log('STEP 5: Accepting friend request');
  await acceptButton.click();
  console.log('FRIEND REQUEST ACCEPTED');

  console.log('STEP 6: Staying on FRIENDS page, waiting for global incoming call modal...');
  const incomingCallModal = page.locator('text=Incoming video call');
  await incomingCallModal.waitFor({ state: 'visible', timeout: 300000 });

  console.log('STEP 7: Accepting call');
  // Locate the specific Accept button in the modal
  // Based on code: <button onClick={onAccept}><span ...>Accept</span></button>
  const acceptCallButton = page.locator('button:has(span:text-is("Accept"))');
  await acceptCallButton.click();

  console.log('STEP 8: Verification - Entering Call Page');
  await page.waitForURL('**/call', { timeout: 30000 });
  console.log('SUCCESS: BRIAN HAS ENTERED THE CALL');
  
  // Keep the session alive for a bit to ensure the other side sees us
  console.log('Waiting in call for 30 seconds...');
  await page.waitForTimeout(30000);
  
  console.log('--- BRIAN AGENT FINISHED ---');
});
