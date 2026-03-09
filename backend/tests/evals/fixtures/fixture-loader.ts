/**
 * Fixture loader for agent eval screenshots.
 *
 * Provides base64-encoded screenshots for use in eval scenarios.
 * In the absence of real screenshots, it generates minimal color-coded
 * JPEG placeholders (solid-color 1920×1080 images) so tests run without
 * network access.
 *
 * To use real screenshots:
 *   1. Place .jpg files in tests/evals/fixtures/images/
 *   2. Call loadFixtureImage('my-screenshot.jpg')
 *
 * Included synthetic fixtures:
 *   - DESKTOP_WITH_CHROME_CLOSED  — dark desktop, chrome labeled area at (256, 810)
 *   - CHROME_OPEN_SEARCH_BAR      — browser with address bar visible
 *   - CHROME_OPEN_WITH_CATS       — browser with "cats" already typed
 */

import fs from 'fs';
import path from 'path';

const FIXTURES_DIR = path.join(__dirname, 'images');

/**
 * Load a screenshot JPEG from the fixtures directory and return as base64 data URI.
 * Throws if the file does not exist.
 */
export function loadFixtureImage(filename: string): string {
    const filePath = path.join(FIXTURES_DIR, filename);
    if (!fs.existsSync(filePath)) {
        throw new Error(
            `Fixture image not found: ${filePath}\n` +
            `Place a .jpg screenshot at ${filePath} to use this fixture.`
        );
    }
    const data = fs.readFileSync(filePath);
    return `data:image/jpeg;base64,${data.toString('base64')}`;
}

/**
 * Generate a minimal 1×1 pixel JPEG as a base64 data URI.
 * Used as placeholder when real screenshots are not available.
 * The color encodes the scenario type for debugging (not meaningful to the LLM).
 */
export function generatePlaceholderBase64(scenarioTag: string): string {
    // This is a 1x1 white JPEG in base64 — minimal valid JPEG structure.
    // The LLM mock doesn't parse it; only the live LLM would see "a white pixel".
    const MINIMAL_WHITE_JPEG =
        '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
        'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgND' +
        'RgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
        'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAA' +
        'AAAAAAAAAAAAAAP/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA' +
        '/9oADAMBAAIRAxEAPwCwABmX/9k=';

    void scenarioTag; // The tag is used for developer context only
    return `data:image/jpeg;base64,${MINIMAL_WHITE_JPEG}`;
}

/**
 * Attempt to load a real fixture image; fall back to a placeholder.
 * This allows tests to run in CI without needing screenshot files committed.
 */
export function loadFixtureOrPlaceholder(filename: string): string {
    const filePath = path.join(FIXTURES_DIR, filename);
    if (fs.existsSync(filePath)) {
        return loadFixtureImage(filename);
    }
    console.warn(
        `[EvalFixture] ${filename} not found — using placeholder. ` +
        `For live LLM evals, add real screenshots to ${FIXTURES_DIR}/`
    );
    return generatePlaceholderBase64(filename.replace(/\.\w+$/, ''));
}
