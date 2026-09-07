import { expect, test } from '@playwright/test';

test('search → play → queue → library', async ({ page }) => {
  await page.goto('/search?q=adele%20hello');
  await page.waitForSelector('ul li button', { timeout: 60000 });
  // Play the first result and expect real decoding.
  await page.locator('ul li button').first().click();
  await page.waitForFunction(
    () => {
      const el = document.getElementById('zabify-audio') as HTMLAudioElement | null;
      return el && el.readyState >= 3 && !el.paused;
    },
    { timeout: 90000 },
  );
  // Queue panel shows the track.
  await page.getByRole('button', { name: 'Open queue' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Queue' })).toBeVisible();
  // Library persists a like.
  await page.getByRole('button', { name: 'Close queue' }).click();
  await page.locator('ul li').first().getByRole('button', { name: /Like|Unlike/ }).click();
  await page.goto('/library');
  await expect(page.getByRole('tab', { name: 'Liked songs' })).toBeVisible();
});
