import os
import time
from playwright.sync_api import sync_playwright

def run_cuj(page):
    print("Navigating to local development server...")
    page.goto("http://localhost:8000/index.html")
    page.wait_for_timeout(2000)

    print("Clicking Token Info tab...")
    page.locator('button[data-tab="tokeninfo"]').click()
    page.wait_for_timeout(1000)

    # 1. Inspect BTCUSDT
    print("Selecting BTCUSDT from watchlist...")
    page.locator('div[data-sym="BTCUSDT"]').click()
    page.wait_for_timeout(2000)

    # 2. Inspect XRPUSDT
    print("Selecting XRPUSDT from watchlist...")
    page.locator('div[data-sym="XRPUSDT"]').click()
    page.wait_for_timeout(2000)

    # 3. Inspect RAYUSDT
    print("Selecting RAYUSDT from watchlist...")
    page.locator('div[data-sym="RAYUSDT"]').click()
    page.wait_for_timeout(2000)

    # Take a screenshot of RAYUSDT Token Info
    screenshot_path = "/home/jules/verification/screenshots/token_info_enriched.png"
    print(f"Saving final visual state screenshot of RAY Token Info to {screenshot_path}...")
    page.screenshot(path=screenshot_path)
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={"width": 1440, "height": 900}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        except Exception as e:
            print(f"Error during Token Info enrichment verification: {e}")
        finally:
            context.close()
            browser.close()
            print("Playwright browser closed.")
