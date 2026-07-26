import os
from playwright.sync_api import sync_playwright

def run_cuj(page):
    # Log console messages and errors
    page.on("console", lambda msg: print(f"CONSOLE {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err.message}\nSTACK: {err.stack}"))

    print("Navigating to local development server...")
    page.goto("http://localhost:8000/index.html")
    page.wait_for_timeout(2000)

    # Click on the "Derivatives Intelligence" tab button
    print("Clicking 'Derivatives Intelligence' tab...")
    page.locator('button[data-tab="derivatives"]').click()
    page.wait_for_timeout(2000)

    # Save screenshot of the Derivatives Intelligence tab
    screenshot_der_path = "/home/jules/verification/screenshots/derivatives_dashboard.png"
    print(f"Saving Derivatives Dashboard screenshot to {screenshot_der_path}...")
    page.screenshot(path=screenshot_der_path)

    # Click on the "Market Sentiment Dashboard" tab button
    print("Clicking 'Market Sentiment Dashboard' tab...")
    page.locator('button[data-tab="sentiment_dashboard"]').click()
    page.wait_for_timeout(2000)

    # Save screenshot of the Sentiment tab
    screenshot_sent_path = "/home/jules/verification/screenshots/sentiment_dashboard.png"
    print(f"Saving Sentiment Dashboard screenshot to {screenshot_sent_path}...")
    page.screenshot(path=screenshot_sent_path)
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
