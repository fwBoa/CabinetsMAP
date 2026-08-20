from playwright.sync_api import sync_playwright

URL = "http://localhost:8000/index.html"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)

    # Tester plusieurs cabinets
    for cid in ["cabinet-01", "cabinet-08", "cabinet-10"]:
        # reset view
        page.evaluate("() => window.App.map.resetView()")
        page.wait_for_timeout(1000)
        z0 = page.evaluate("() => window.App.state.map.getZoom()")
        # clic sur le cabinet
        page.click(f'.cabinet-card[data-id="{cid}"]')
        page.wait_for_timeout(1200)
        z1 = page.evaluate("() => window.App.state.map.getZoom()")
        c = page.evaluate("() => { const x = window.App.state.map.getCenter(); return [x.lng.toFixed(2), x.lat.toFixed(2)]; }")
        print(f"{cid}: zoom {z0} -> {z1}, center {c}")

    page.close()
    browser.close()
