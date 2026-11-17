import { test, expect } from '@playwright/test';

async function openDemo(page: import('@playwright/test').Page) {
  const res = await page.request.post('/api/auth/session');
  expect(res.ok()).toBeTruthy();
}

test('landing page renders hero and demo CTA', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /Explore Live Demo Workspace/ })).toBeVisible();
});

test('public pages respond 200', async ({ page }) => {
  for (const p of ['/features', '/pricing', '/auth/signin', '/auth/signup', '/legal/privacy', '/legal/terms']) {
    const res = await page.goto(p);
    expect(res?.status()).toBe(200);
  }
});

test('demo session opens the overview dashboard', async ({ page }) => {
  await openDemo(page);
  await page.goto('/app');
  await expect(page.getByText('Recovery Overview')).toBeVisible({ timeout: 20_000 });
});

test('cases list renders from demo data', async ({ page }) => {
  await openDemo(page);
  await page.goto('/app/cases');
  await expect(page.getByRole('heading', { name: 'Recovery Cases' })).toBeVisible({ timeout: 20_000 });
});

test('imports page loads with its wizard controls', async ({ page }) => {
  await openDemo(page);
  await page.goto('/app/imports');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
});
