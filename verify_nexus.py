import os
from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.on("console", lambda msg: print(f"CONSOLE {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err.message}\nSTACK: {err.stack}"))

    print("Navigating to local development server...")
    page.goto("http://localhost:8000/index.html")
    page.wait_for_timeout(3000)

    print("Checking if layout elements are visible...")
    search_input = page.locator("#symbolSearchInput")
    search_input.wait_for(state="visible")

    print("Clicking 1m timeframe button...")
    page.locator('button[data-timeframe="1m"]').click()
    page.wait_for_timeout(3000)

    # Click custom indicator modal button
    print("Clicking + Indicators button...")
    page.locator("#customIndicatorModalBtn").click()
    page.wait_for_timeout(500)

    print("Closing Settings Modal...")
    page.locator("#closeSettingsModalBtn").click()
    page.wait_for_timeout(500)

    print("Adjusting Minimum Acceptable Trade Quality Score slider...")
    slider = page.locator("#minQualityScoreSelect")
    slider.evaluate("el => el.value = 85")
    slider.dispatch_event("input")
    page.wait_for_timeout(1000)

    print("Selecting ETHUSDT from watchlist...")
    page.locator('div[data-sym="ETHUSDT"]').click()
    page.wait_for_timeout(3000)

    screenshot_path = "/home/jules/verification/screenshots/verification.png"
    print(f"Saving final visual state screenshot to {screenshot_path}...")
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
            print(f"Error during Playwright verification: {e}")
        finally:
            context.close()
            browser.close()
            print("Playwright browser closed.")
