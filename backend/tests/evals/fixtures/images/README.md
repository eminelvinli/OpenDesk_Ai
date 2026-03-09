# fixture images go here

Place real JPEG screenshots here for live LLM eval mode:

- `screenshot_desktop.jpg`   — Desktop with Chrome icon visible (≤ 1920×1080 JPEG)
- `screenshot_chrome_open.jpg` — Chrome open with address/search bar focused

When these files are absent, the eval suite falls back to a 1×1 placeholder
JPEG so mock-mode tests can still run in CI without any screenshots.
