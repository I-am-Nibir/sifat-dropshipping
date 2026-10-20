# 🚀 SifatDropShipping — Full-Stack Animated E-Commerce (Master Sync Edition)
**Founder & CEO:** Jack Sifat Khan  ·  **Currency:** Bangladeshi Taka (৳)  ·  **Payment:** Cash on Delivery

## What's new in v3
| Feature | Where |
|---|---|
| **Login / Register** modal, guest **or** logged-in checkout | `public/js/auth.js`, `/api/auth/*` |
| **My Profile & Order History** (all orders placed while logged in) | profile section, `/api/my-orders` |
| **Product Manager** — add *and* remove products live | Dashboard → *Product Manager*, `DELETE /api/products/:id` |
| **Master Sync webhook** — vendor stores push orders in, tagged with a **Vendor Source** | `POST /api/master-sync/webhook`, Dashboard → *Master Sync* |
| Admin-only dashboard, server-side order pricing, XSS-safe rendering | `server.js`, `public/js/*.js` |

Everything from v2 is kept: animated blobs, marquee ticker, floating founder badge (`sifat.jpg`), 3D card hovers, fly-to-cart, promo codes, live tracker, confetti.

---

## 📂 Structure
```
SifatDropShipping_FullStack/
├── server.js                 # Express API: auth, products, orders, vendors, Master Sync webhook
├── package.json
├── data/
│   ├── products.json         # catalog
│   ├── orders.json           # all orders (direct + vendor-synced, each with source/vendorSource)
│   ├── users.json            # accounts (scrypt-hashed passwords — never plaintext)
│   └── vendors.json          # connected vendor stores (API keys stored as SHA-256 hashes)
└── public/
    ├── index.html
    ├── assets/images/sifat.jpg
    ├── css/animations.css
    └── js/
        ├── app.js            # storefront, cart, checkout, live tracker, toasts, confetti
        ├── auth.js           # login/register modal, user menu, profile & order history
        ├── admin.js          # dashboard: orders, product manager, vendors
        ├── fallback-data.js  # demo data for Standalone Browser Mode
        └── founder-photo.js  # embedded copy of the founder photo (offline fallback)
```

## ⚡ Run
```bash
npm install
npm start            # → http://localhost:3000
```
**Admin login (Merchant Dashboard):** `admin@sifatdropshipping.com` / `Sifat@2026`
⚠️ Change this *before* the first run: `ADMIN_EMAIL=you@x.com ADMIN_PASSWORD='a-strong-one' npm start`.
(The admin account is created on first boot only if no admin exists in `users.json`.)

| Env var | Purpose |
|---|---|
| `PORT` | server port (default 3000) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | first-boot admin account |
| `AUTH_SECRET` | token-signing secret (otherwise generated into `data/.auth-secret`) |
| `DATA_DIR` | where the JSON databases live (point at a persistent disk in production) |

Opening `public/index.html` without Node still works in **Standalone Browser Mode** (guest ordering, tracker, demo dashboard). Accounts and Master Sync need the server.

---

## 🔗 Master Sync (Model B)
Jack's store is the **master**. Each vendor / client store gets its own key and pushes orders in.

1. Log in as admin → **Dashboard → Master Sync (Vendors)** → *Generate Vendor Key*. Copy the key (shown once; only its hash is stored).
2. The vendor's store calls the webhook on every new order:

```bash
curl -X POST https://YOUR-DOMAIN/api/master-sync/webhook \
  -H "Content-Type: application/json" \
  -H "X-Master-Sync-Key: msk_xxxxxxxxxxxxxxxx" \
  -d '{
    "vendorOrderId": "SHOP-10234",
    "customer": { "name": "Rahim Uddin", "phone": "01712345678",
                  "email": "rahim@example.com", "city": "Dhaka",
                  "address": "House 12, Road 5, Banani" },
    "items": [ { "title": "Smart Watch Series X", "qty": 1, "price": 2490 } ],
    "shipping": 60, "discount": 0, "currency": "BDT"
  }'
```
- **Required:** `customer.name`, `customer.phone`, `customer.address`, `items[]` (`title`, `qty`, `price`).
- **Optional:** `vendorOrderId` (strongly recommended — makes retries **idempotent**: a repeat returns `200 {duplicate:true}` instead of creating a second order), `shipping`, `discount`, `status`, `currency` (BDT only), item `image`/`sku`.
- Totals are **computed by the server** (`subtotal − discount + shipping`); any `total` you send is ignored.
- Response `201`: `{ success, duplicate:false, order:{ orderId, vendorSource, status, total } }`.
- The order appears in the dashboard within 10 s, tagged with the vendor's name in the **Vendor Source** column (filterable), and can be tracked by its `JSK-…` ID.
- Vendors can poll status: `GET /api/master-sync/orders/:vendorOrderId` with the same key header.
- Use **Simulate order** on a vendor card to test without cURL. **Rotate key** revokes a leaked key instantly.

## 🔌 API summary
| Method & path | Access |
|---|---|
| `POST /api/auth/register` · `POST /api/auth/login` | public (rate-limited) |
| `GET/PATCH /api/auth/me` | logged in |
| `GET /api/my-orders` | logged in (own orders) |
| `GET /api/products` | public |
| `POST /api/products` · `DELETE /api/products/:id` | admin |
| `POST /api/orders` | guest or logged in (server re-prices from the catalog) |
| `GET /api/orders/:orderId` | public tracking — name masked, no street address/phone |
| `GET /api/orders` · `PATCH /api/orders/:id/status` | admin |
| `GET/POST/DELETE /api/vendors`, `POST /api/vendors/:id/rotate-key`, `…/simulate` | admin |
| `POST /api/master-sync/webhook`, `GET /api/master-sync/orders/:ref` | vendor key |

## 🛡️ Design decisions worth knowing
- **Order history = orders placed while logged in** (matched by account, which carries the account email). Guest orders that merely *type* the same email are **not** auto-linked: without email verification, anyone could register someone else's address and read their orders. Add email verification if you want that.
- `GET /api/orders` was public in v2 and exposed every customer's phone/address; it is now admin-only.
- Order totals/prices are recomputed on the server — a tampered browser request can't set its own price.
- Order IDs are sequential (`JSK-2026-106`, …) instead of random, so two orders can't collide.
- All customer/vendor/product text is HTML-escaped before display (vendors can push arbitrary text into your dashboard).
- The JSON files are fine for a single-instance store. For heavy traffic or multiple servers, move to a real database.

## 🌐 Deploy (Render / Railway)
Build `npm install`, start `npm start`. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `AUTH_SECRET`, and mount a persistent disk with `DATA_DIR` pointing to it — otherwise free tiers wipe JSON data on redeploy.
