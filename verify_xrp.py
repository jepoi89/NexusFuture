import os
from playwright.sync_api import sync_playwright

def run_verification(page):
    page.on("console", lambda msg: print(f"CONSOLE {msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err.message}\nSTACK: {err.stack}"))

    print("Navigating to local development server...")
    page.goto("http://localhost:8000/index.html")
    page.wait_for_timeout(3000)

    print("Clicking Token Info tab...")
    page.locator('button[data-tab="tokeninfo"]').click()
    page.wait_for_timeout(1000)

    print("Selecting XRPUSDT from watchlist...")
    page.locator('div[data-sym="XRPUSDT"]').click()
    page.wait_for_timeout(2000)

    symbol_text = page.locator("#tokenInfoSymbol").text_content()
    market_cap = page.locator("#tokenMarketCap").text_content()
    circulating_supply = page.locator("#tokenCirculatingSupply").text_content()
    all_time_high = page.locator("#tokenATH").text_content()

    print(f"XRP Symbol: {symbol_text}")
    print(f"XRP Market Cap: {market_cap}")
    print(f"XRP Circulating Supply: {circulating_supply}")
    print(f"XRP All-Time High: {all_time_high}")

    # Visual check
    screenshot_path = "/home/jules/verification/screenshots/xrp_info_verification.png"
    print(f"Saving final visual state screenshot of XRP Token Info to {screenshot_path}...")
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
            run_verification(page)
        except Exception as e:
            print(f"Error during XRP verification: {e}")
        finally:
            context.close()
            browser.close()
            print("Playwright browser closed.")
