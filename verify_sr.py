from playwright.sync_api import sync_playwright

def run_cuj(page):
    # Navigate to local Crypto Futures dashboard
    page.goto("http://localhost:8000")
    page.wait_for_timeout(2000)

    # 1. Trigger Watchlist symbol switch to ETHUSDT
    print("Selecting ETHUSDT from watchlist...")
    page.click("text=ETHUSDT")
    page.wait_for_timeout(2000)

    # 2. Open Settings modal to verify custom S&R options
    print("Opening indicators and overlay settings...")
    page.click("#settingsBtn")
    page.wait_for_timeout(1500)

    # Adjust support and resistance confidence threshold slider using page evaluation
    print("Adjusting Support & Resistance confidence slider...")
    page.evaluate("document.getElementById('srConfidenceSelect').value = '75'")
    page.evaluate("document.getElementById('srConfidenceSelect').dispatchEvent(new Event('input'))")
    page.wait_for_timeout(1000)

    # Apply indicators overlay checkboxes
    print("Applying overlay options...")
    page.click("#saveSettingsBtn")
    page.wait_for_timeout(2000)

    # 3. Switch back to BTCUSDT to verify dynamic S&R recalculations
    print("Selecting BTCUSDT from watchlist...")
    page.click("text=BTCUSDT")
    page.wait_for_timeout(2000)

    # Take screenshot at the key moment showing Support/Resistance and Supply/Demand overlays on the chart
    screenshot_path = "/home/jules/verification/screenshots/sr_verification.png"
    page.screenshot(path=screenshot_path)
    print(f"Visual S&R validation screenshot saved to {screenshot_path}")

    page.wait_for_timeout(1500)  # Hold final state for the video context

if __name__ == "__main__":
    import os
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
