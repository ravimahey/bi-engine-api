Project: Ordaraa — BI Intelligence Platform for SMEs (B2B & B2C)

Ordaraa is a business intelligence system that ingests a business's financial data (via QuickBooks, later Xero/Zoho, plus manual/CSV entry) and finds "money leaks" — supplier price increases, category spend shifts, hidden cost drivers — that owners wouldn't easily spot themselves.

Architecture principle: BI/rules calculate and prove facts deterministically; AI only explains, summarizes, and recommends — it never invents financial numbers.

Core data flow: Data (QuickBooks sync / CSV / manual) → Validation → KPI Dashboard → Findings (rule-based, e.g. "Supplier spend +25%") → "See Why" evidence → Fix options with pros/cons → Owner picks an action → Outcome tracked as Potential / Reported / Observed value (kept separate, never merged).

MVP scope: single QuickBooks integration first (Vendor, Account, Item, Bill, Purchase, VendorCredit — the AP/spend side), tenant-isolated per business, with a restricted "Ask Ordaraa" AI chat that only answers from authorized backend data — no cross-tenant access, no unsupported claims.

First vertical: restaurants, with the design kept reusable for other SME types later.