import os
from playwright.sync_api import sync_playwright

def run_cuj(page):
    print("Navigating to local development server...")
    page.goto("http://localhost:8000/index.html")
    page.wait_for_timeout(2000)

    print("Clicking Token Info tab...")
    page.locator('button[data-tab="tokeninfo"]').click()
    page.wait_for_timeout(1000)

    print("Selecting RAYUSDT from watchlist...")
    page.locator('div[data-sym="RAYUSDT"]').click()
    page.wait_for_timeout(2000)

    # Scroll the Left Info card down to see all stats, specs, utility and tags
    print("Scrolling Token Info Left card...")
    # The left card has max-h-[650px] overflow-y-auto, let's locate it and scroll it
    left_card = page.locator('#tabContentTokeninfo .grid > div').first
    left_card.evaluate("el => el.scrollTop = 300")
    page.wait_for_timeout(1500)

    # Take screenshot at the scrolled state
    screenshot_path = "/home/jules/verification/screenshots/token_info_scrolled.png"
    print(f"Saving scrolled state screenshot of Token Info to {screenshot_path}...")
    page.screenshot(path=screenshot_path)
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1440, "height": 900}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        except Exception as e:
            print(f"Error during scrolled state verification: {e}")
        finally:
            context.close()
            browser.close()
            print("Playwright browser closed.")
