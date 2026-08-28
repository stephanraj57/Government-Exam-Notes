# 🍃 MongoDB Atlas Cloud Database Setup & Connection Guide

This guide walks you through setting up a **100% Free MongoDB Atlas Cloud Database (M0 Sandbox - 512 MB Free Forever)** and connecting it to your **Exam Alert India** platform.

---

## 🚀 Overview of Dual-Storage Engine

Your application is equipped with an **intelligent dual-storage engine**:
- **With MongoDB Atlas**: When `MONGODB_URI` is provided, all revision notes, Google-authenticated student accounts, study goals, likes, and live telemetry persist in MongoDB Atlas collections in the cloud.
- **Without MongoDB Atlas**: If `MONGODB_URI` is omitted, the application runs seamlessly using local JSON disk files (`data/*.json`).

---

## 📋 Step-by-Step MongoDB Atlas Setup

### Step 1: Create a Free MongoDB Atlas Account
1. Open your browser and go to: [https://www.mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register)
2. Sign up using your Google account or email.
3. When prompted to choose a plan, select **"M0 Free" (Shared)**.
4. Choose your preferred Cloud Provider (e.g., **AWS**) and Region (e.g., **Mumbai `ap-south-1`** or whichever is closest to you).
5. Click **"Create Deployment"**.

---

### Step 2: Create Database Username & Password
1. Under **"Quickstart / Security"**, select **Username and Password**.
2. Set a Username: e.g. `exam_admin`
3. Set a strong Password: e.g. `MySecurePassword123` *(copy this password)*.
4. Click **"Create Database User"**.

> [!IMPORTANT]
> Keep your password handy. If your password contains special characters like `@`, `/`, or `:`, make sure they are URL-encoded, or use standard alphanumeric characters (`a-z, A-Z, 0-9`).

---

### Step 3: Configure Network Access (Allow Cloud Connection)
1. In the left navigation sidebar under **Security**, click **"Network Access"**.
2. Click the green **"Add IP Address"** button.
3. Click **"Allow Access from Anywhere"** (this adds `0.0.0.0/0`).
4. Click **"Confirm"**.

> [!NOTE]
> `0.0.0.0/0` is required so that your cloud hosting provider (Render, Railway, Heroku, or VPS) can connect to your MongoDB database from anywhere.

---

### Step 4: Get Your MongoDB Connection String URI
1. In the left sidebar, click **"Database"** (or **Clusters**).
2. Click the **"Connect"** button next to your cluster.
3. Select **"Drivers"** (Node.js).
4. Copy the connection string provided. It will look like:
   ```text
   mongodb+srv://exam_admin:<db_password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0
   ```
5. Replace `<db_password>` with the database password you created in Step 2, and add `/exam_alert_india` right before the `?` query parameters:
   ```text
   mongodb+srv://exam_admin:MySecurePassword123@cluster0.abcde.mongodb.net/exam_alert_india?retryWrites=true&w=majority&appName=Cluster0
   ```

---

## ⚙️ Connecting to Your Application

### Option A: Local / Development Setup (`.env` file)
1. In your project root directory (`C:\Users\steph\OneDrive\Desktop\Steve-mobile\`), open or create the `.env` file.
2. Add your `MONGODB_URI`:
   ```env
   # MongoDB Atlas Connection URI
   MONGODB_URI=mongodb+srv://exam_admin:MySecurePassword123@cluster0.abcde.mongodb.net/exam_alert_india?retryWrites=true&w=majority&appName=Cluster0
   
   # Optional: Custom DB name (defaults to exam_alert_india)
   MONGODB_DB_NAME=exam_alert_india
   
   # Admin Password & Google OAuth
   ADMIN_PASSWORD=your_admin_password
   GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   ```
3. Restart your server:
   ```bash
   node server.js
   ```
4. You will see the console confirmation:
   ```text
   ✅ [Database] Connected successfully to MongoDB Atlas (exam_alert_india)!
   ```

---

### Option B: Cloud Production Deployment (Render, Railway, VPS)
When deploying your website to Render, Railway, or any cloud platform:
1. Go to your hosting dashboard (e.g. **Render Dashboard** -> Your Web Service -> **Environment** tab).
2. Add an Environment Variable:
   - **Key**: `MONGODB_URI`
   - **Value**: `mongodb+srv://exam_admin:MySecurePassword123@cluster0.abcde.mongodb.net/exam_alert_india?retryWrites=true&w=majority&appName=Cluster0`
3. Add other variables:
   - **Key**: `ADMIN_PASSWORD` | **Value**: `YourStrongAdminPassword`
   - **Key**: `GOOGLE_CLIENT_ID` | **Value**: `your_google_client_id.apps.googleusercontent.com`
   - **Key**: `GOOGLE_CLIENT_SECRET` | **Value**: `your_google_client_secret`
4. Click **Save Changes** / **Deploy**.
5. Your production website is now 100% connected to MongoDB Atlas!

---

## 🗄️ Database Collections Overview

MongoDB Atlas will automatically manage the following collections inside `exam_alert_india`:

| Collection | Purpose | Content |
|---|---|---|
| `notes` | Revision Notes Repository | Topic titles, subjects, tags, markdown summaries, and diagram URLs |
| `users` | Student Accounts & Auth | Google IDs, student names, emails, avatars, target exams (UPSC/SSC/RRB/State PSC), likes |
| `interactions` | Real-Time Telemetry | Total likes, downloads, searches, impressions, and missing demand queries |
| `visits` | Visitor Intelligence | Total page visits and daily impression breakdown |
| `profile` | Platform Branding | Admin bio, creator photo, website logo, and Instagram QR barcode |
| `sessions` | Session Security | Active admin login and student persistent tokens |

---

## 🔍 Verifying Database Status in Admin Panel
1. Open the Admin Panel (`/admin.html`).
2. Log in with your admin credentials.
3. Open **"💾 Backup & Restore"** or view the Database Status API at `/api/admin/database/status`.
4. You will see:
   ```json
   {
     "success": true,
     "mode": "mongodb",
     "isConnected": true,
     "databaseName": "exam_alert_india",
     "storageType": "MongoDB Atlas Cloud"
   }
   ```
