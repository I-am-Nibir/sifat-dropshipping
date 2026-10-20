# 🚀 SifatDropShipping — Full-Stack Animated E-Commerce Web App
**Founder & CEO:** Jack Sifat Khan  
**Currency:** Bangladeshi Taka (BDT - ৳)

---

## 📂 Project Architecture (Multi-File Full-Stack)
```
SifatDropShipping_FullStack/
├── server.js                     # Node.js + Express REST API Backend Server
├── package.json                  # Dependencies & start scripts
├── data/
│   ├── products.json             # Persistent Product Catalog Database (BDT ৳)
│   └── orders.json               # Persistent Customer Orders & Live Tracking Database
└── public/                       # Frontend Static Assets
    ├── index.html                # Ultra-Animated Clean Minimalist Storefront
    ├── assets/
    │   └── images/
    │       └── sifat.jpg         # Jack Sifat Khan's Official Founder Image
    ├── css/
    │   └── animations.css        # Keyframe Mesh Blobs, 3D Hover Tilt, Fly-to-Cart, Shimmer
    └── js/
        └── app.js                # Full-Stack API Client + Standalone Browser Fallback
```

---

## ⚡ How to Run Full-Stack Locally (With Node.js Backend)
1. Unzip `SifatDropShipping_FullStack.zip` and open the folder in VS Code or Terminal.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Full-Stack Express server:
   ```bash
   npm start
   ```
4. Open **`http://localhost:3000`** in your browser!

*(Note: Even if you open `public/index.html` directly without running Node.js, the smart fallback engine automatically keeps your uploaded photo, products, cart, and order tracking working seamlessly!)*

---

## 🌐 How to Deploy Full-Stack (Backend + Frontend) for Free
- **Render.com (Recommended for Node.js Full-Stack):**
  1. Push this folder to a GitHub repository.
  2. Go to [render.com](https://render.com) -> **New Web Service** -> Connect your GitHub repo.
  3. Set Build Command: `npm install` and Start Command: `npm start`.
- **Railway.app / Cyclic / Glitch:** Upload the repo or ZIP directly and it will auto-detect `package.json` and `server.js`.
