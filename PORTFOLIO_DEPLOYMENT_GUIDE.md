# 🚀 Kuala Lumpur Port - Production Cloud Deployment Guide

This guide allows you to take this complete Restaurant Management System online for **FREE** to showcase the full live system to clients.

---

### Step 1: Push Code to Your GitHub

1. Open **[github.com](https://github.com)** and log in.
2. Click **New Repository** (Top right `+` icon):
   - **Repository Name:** `kuala-lumpur-port`
   - Set to **Public** or **Private** (both work on Render).
   - Leave "Initialize with README" **unchecked**.
   - Click **Create repository**.
3. Copy your GitHub repository URL (e.g. `https://github.com/your-username/kuala-lumpur-port.git`).
4. In your laptop terminal / command prompt, run these 2 commands:

```bash
cd C:\Users\user\.gemini\antigravity\scratch\kuala-lumpur-port
git remote add origin https://github.com/your-username/kuala-lumpur-port.git
git push -u origin main
```

---

### Step 2: Deploy to Render.com (100% Free)

1. Open **[render.com](https://render.com)** and click **Sign Up** (Sign in with your GitHub account).
2. Click the blue button: **New +** ➔ **Web Service**.
3. Select **Build and deploy from a Git repository** ➔ Click **Next**.
4. Choose `kuala-lumpur-port` from your GitHub repository list.
5. Fill in the basic settings (Render pre-fills most of this automatically):
   - **Name:** `kuala-lumpur-port`
   - **Region:** Singapore / Frankfurt / Oregon (any is fine).
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Select **Free ($0/month)**.
6. Click **Create Web Service** at the bottom!

---

### Step 3: Get Your Permanent Live Production Link

In about 2 to 3 minutes, Render will finish deploying and display your **Live HTTPS Link**:

```
👉 https://kuala-lumpur-port.onrender.com
```

This link is permanent, encrypted with SSL (`https`), and works on any smartphone, tablet, iPhone, or laptop anywhere in the world!

---

### Step 4: How to Showcase to Clients (System Walkthrough)

When presenting to a restaurant owner or prospective client:

1. **Customer QR Menu (Mobile):**
   - Have the client open `https://kuala-lumpur-port.onrender.com/?table=1` on their mobile phone.
   - Let them add a Burger and Pizza to the cart, write a note (*"Less spicy, extra cheese"*), and click **Confirm Order & Send to Kitchen**.

2. **Kitchen Display System (KDS):**
   - Open `/kitchen` on your phone or tablet (PIN: `7288`).
   - The kitchen chime will ring immediately and the client's order card will appear live with the timer.
   - Click **"Accept & Start Cooking"** to silence the bell.

3. **Cashier POS Counter:**
   - Open `/cashier` (User: `cashier`, Pass: `7288`).
   - Show how Table #1 appears occupied.
   - Apply a 10% discount, enter cash received, see change calculated, and click **"Settle Cash & Print 80mm Receipt"** to show the thermal bill.
   - Point out how Table #1 immediately becomes available for the next guest!

4. **Master Admin Dashboard:**
   - Open `/admin` (User: `admin`, Pass: `7288`).
   - Show live daily sales revenue, top-selling dishes leaderboard, order history ledger, and the 1-click **Out-of-Stock** toggle.
