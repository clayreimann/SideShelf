// seed-state.mjs — creates the non-root demo user and seeds listening
// progress so the app's "Continue Listening" / "Listen Again" shelves are
// populated for screenshots and App Review.
//
// Node 20+ built-ins only.

import { ensureDemoUser, updateMediaProgress } from "./abs-client.mjs";

/**
 * @param {string} baseUrl
 * @param {string} adminToken
 * @param {{ username: string, password: string }} demoCreds
 * @returns {Promise<{ id: string, token: string }>}
 */
export async function seedDemoUser(baseUrl, adminToken, demoCreds) {
  return ensureDemoUser(baseUrl, adminToken, demoCreds);
}

/**
 * Set listening progress for every manifest entry that declares a
 * `progress` fraction or `finished: true`, matching the shape SideShelf's
 * own client sends (currentTime, duration, progress, isFinished) — see
 * src/lib/api/endpoints.ts updateMediaProgress in the main repo.
 *
 * @param {string} baseUrl
 * @param {string} demoUserToken
 * @param {Array<{ entry: { title: string, progress?: number, finished?: boolean }, itemId: string, duration: number }>} progressTargets
 * @returns {Promise<Array<{ title: string, itemId: string, currentTime: number, isFinished: boolean }>>}
 */
export async function seedListeningProgress(baseUrl, demoUserToken, progressTargets) {
  const applied = [];
  for (const { entry, itemId, duration } of progressTargets) {
    const isFinished = Boolean(entry.finished);
    const fraction = isFinished ? 1 : (entry.progress ?? 0);
    if (fraction <= 0 && !isFinished) continue;

    const currentTime = isFinished ? duration : duration * fraction;
    await updateMediaProgress(baseUrl, demoUserToken, itemId, {
      currentTime,
      duration,
      progress: fraction,
      isFinished,
    });
    applied.push({ title: entry.title, itemId, currentTime, isFinished });
  }
  return applied;
}
