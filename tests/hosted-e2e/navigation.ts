import type { Page } from '@playwright/test';
export async function openVocab(page: Page) {
  await page.getByRole('button', { name: /^English Grammar/ }).click();
  await page.getByRole('button', { name: 'Vocab', exact: true }).click();
  await page.getByRole('button', { name: /^Anto \/ Syno/ }).click();
}
export async function studyWords(page: Page) {
  await page
    .getByRole('navigation', { name: 'Folder navigation' })
    .getByRole('button', { name: 'Practice', exact: true })
    .click();
  await page
    .locator('.document-card')
    .getByRole('button', { name: 'Practice', exact: true })
    .first()
    .click();
  await page.getByLabel('Learning PDF').selectOption('all');
}
