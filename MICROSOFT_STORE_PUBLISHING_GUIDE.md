# Microsoft Store Publishing Guide — Code Carry Home

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [App Packaging (PWA → MSIX)](#app-packaging)
4. [Microsoft Partner Center Setup](#microsoft-partner-center-setup)
5. [Payment & Monetization](#payment--monetization)
6. [Store Listing Requirements](#store-listing-requirements)
7. [Certification Requirements](#certification-requirements)
8. [Common Rejection Reasons](#common-rejection-reasons)
9. [Step-by-Step Publishing Flow](#step-by-step-publishing-flow)

---

## Overview

Your app is a **PWA (Progressive Web App)**, which Microsoft Store fully supports. You do NOT need to rewrite anything — Microsoft Store accepts PWAs directly as **MSIX packages** using **PWABuilder**.

---

## Prerequisites

| Requirement | Details |
|-------------|---------|
| **Microsoft Partner Center Account** | One-time fee of **$19 USD** (individual) or **$99 USD** (company) |
| **Published PWA** | Your app must be live at a public URL (e.g., `https://code-carry-home.lovable.app`) |
| **Valid manifest.webmanifest** | Must include `name`, `short_name`, `icons`, `start_url`, `display`, `theme_color` |
| **Service Worker** | Required for offline support (already configured via vite-plugin-pwa) |
| **HTTPS** | Required (Lovable hosting provides this automatically) |
| **App Icons** | 512×512 PNG minimum (also need 44×44, 150×150, 300×300 for Store tiles) |
| **Screenshots** | At least 1 screenshot (1366×768 or 2560×1440 recommended) |

---

## App Packaging

### Option 1: PWABuilder (Recommended — Easiest)

1. Go to **https://www.pwabuilder.com**
2. Enter your published URL: `https://code-carry-home.lovable.app`
3. PWABuilder will analyze your PWA and score it
4. Click **"Package for Stores"** → Select **"Microsoft Store"**
5. Fill in:
   - **Package ID**: `CodeCarryHome.App` (or your preferred ID)
   - **Publisher Display Name**: Your name/company
   - **Publisher ID**: From Partner Center (format: `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`)
6. Download the `.msixbundle` file
7. Upload to Partner Center

### Option 2: Manual MSIX Packaging

```bash
# Install PWABuilder CLI
npm install -g @pwabuilder/cli

# Generate MSIX package
pwabuilder package -p windows -u https://code-carry-home.lovable.app
```

---

## Microsoft Partner Center Setup

### 1. Create Account
- Go to: **https://partner.microsoft.com/dashboard**
- Sign in with Microsoft account
- Pay registration fee ($19 individual / $99 company)
- Complete identity verification

### 2. Reserve App Name
- Dashboard → Apps and Games → New Product → MSIX or PWA
- Reserve name: **"Code Carry Home"** (or your preferred name)
- Name reservation lasts 1 year

### 3. App Identity
After reservation, you'll get:
- **Package/Identity/Name**: e.g., `12345CompanyName.CodeCarryHome`
- **Package/Identity/Publisher**: e.g., `CN=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX`
- **Package/Properties/PublisherDisplayName**: Your display name

Use these values when generating your MSIX package in PWABuilder.

---

## Payment & Monetization

### 💳 Best Payment Method for Microsoft Store

| Method | Recommendation | Why |
|--------|---------------|-----|
| **Stripe (Web Payments)** | ✅ **BEST CHOICE** | Microsoft does NOT enforce their billing for PWAs. You keep using your existing Stripe setup |
| **Microsoft Store Commerce** | ⚠️ Optional | 15% commission (first $25M), 30% after. Only needed if you want in-store purchases |
| **Your own payment links** | ✅ Works | PWAs in Microsoft Store can link to external payment pages freely |

### Why Stripe is Best for You:

1. **No Commission to Microsoft** — PWAs are NOT required to use Microsoft's in-app purchase system
2. **You already have Stripe configured** — Payment links, webhooks, subscription management all work
3. **Microsoft's Policy** — Unlike Apple/Google, Microsoft does **NOT** mandate their payment system for PWA subscriptions
4. **Full Control** — You manage refunds, trials, and billing directly

### Important Notes:
- ✅ You CAN use external payment (Stripe) — Microsoft allows this for PWAs
- ✅ Your existing Stripe payment links will work inside the Microsoft Store version
- ✅ No need to implement Microsoft Store billing APIs
- ⚠️ If you ever want to offer "Buy from Microsoft Store" as an option, you'd use the **Microsoft Store Purchase API**, but it's NOT required

### Revenue & Payouts from Microsoft (if using their commerce):
- Microsoft pays via **bank transfer**
- Setup payout account in Partner Center → Payout and tax
- Minimum payout: **$50 USD**
- Payment schedule: Monthly (45-day delay)

---

## Store Listing Requirements

### Required Assets

| Asset | Size | Format |
|-------|------|--------|
| **App Icon** | 300×300 px (minimum) | PNG, transparent bg preferred |
| **Store Logo** | 720×1080 px | PNG |
| **Screenshot 1** | 1366×768 or 2560×1440 | PNG |
| **Screenshot 2-10** | Same sizes | PNG (at least 3 recommended) |
| **Description** | 200-10,000 characters | Plain text |
| **Short Description** | Up to 100 characters | Plain text |

### Store Listing Content

```
App Name: Code Carry Home
Category: Productivity
Subcategory: Personal Organizer / Task Manager
Age Rating: 3+ (Everyone)
Privacy Policy URL: https://code-carry-home.lovable.app/privacy-policy

Short Description:
All-in-one productivity app with tasks, notes, sketches & habit tracking.

Description:
Code Carry Home is your ultimate productivity companion. Manage tasks, 
write notes, sketch ideas, and build habits — all in one beautiful app.

Features:
• Smart task management with priorities, deadlines & reminders
• Rich note editor with formatting, images & voice recordings  
• Sketch canvas with brushes, shapes & collaboration tools
• Habit tracking with streaks & gamification
• Weekly reviews & productivity analytics
• Dark mode & customizable themes
• Offline support — works without internet
• Cross-platform sync
• Duolingo-style engagement with rewards & achievements
```

### Search Keywords (max 7, 30 chars each)
```
task manager
note taking app
productivity
habit tracker
todo list
sketch pad
daily planner
```

---

## Certification Requirements

### ✅ Must-Have Checklist

- [ ] **Privacy Policy** — Must be accessible via URL (you have `/privacy-policy`)
- [ ] **Age Rating** — Complete IARC questionnaire in Partner Center
- [ ] **Content Compliance** — No prohibited content
- [ ] **Functionality** — App must launch and core features must work
- [ ] **Offline Behavior** — Must handle offline gracefully (show message, not crash)
- [ ] **Accessibility** — Basic accessibility (keyboard nav, screen reader support)
- [ ] **Performance** — Must load within reasonable time
- [ ] **No Deceptive Practices** — Pricing must be transparent

### ⚠️ Things to Watch Out For

1. **Login/Auth Flow**
   - If your app requires login, provide a test account OR make core features accessible without login
   - Microsoft testers need to test your app

2. **Subscription Transparency**
   - Clearly show what's free vs. paid
   - Show pricing BEFORE asking for payment
   - Provide a way to cancel

3. **Data Collection Disclosure**
   - Declare what data you collect in Partner Center
   - Match your privacy policy

4. **Crash-Free**
   - No unhandled exceptions
   - Graceful error boundaries (you already have ErrorBoundary component)

---

## Common Rejection Reasons

| Reason | How to Avoid |
|--------|-------------|
| **App crashes on launch** | Test on Windows 10/11 with Edge browser |
| **Missing privacy policy** | Ensure `/privacy-policy` page works and URL is correct in listing |
| **Misleading description** | Don't claim features that don't exist |
| **Login required without test account** | Provide test credentials in "Notes for certification" |
| **Poor offline experience** | Show clear offline message, don't show broken UI |
| **Missing screenshots** | Provide at least 3 high-quality screenshots |
| **Subscription not clearly disclosed** | Show free vs paid features clearly before paywall |

---

## Step-by-Step Publishing Flow

### Phase 1: Prepare (30 minutes)
```
1. ✅ Publish your app to https://code-carry-home.lovable.app
2. ✅ Verify manifest.webmanifest is accessible
3. ✅ Verify service worker is registered
4. ✅ Create Microsoft Partner Center account ($19)
5. ✅ Complete identity verification
```

### Phase 2: Package (15 minutes)
```
1. Go to https://www.pwabuilder.com
2. Enter: https://code-carry-home.lovable.app
3. Fix any warnings (icons, manifest fields)
4. Generate Windows package (.msixbundle)
5. Download the package
```

### Phase 3: Submit (45 minutes)
```
1. Partner Center → New Product → MSIX or PWA
2. Reserve app name
3. Fill in:
   - Pricing: Free (with in-app purchases via Stripe)
   - Age rating: Complete IARC questionnaire  
   - Store listing: Description, screenshots, icons
   - Privacy policy URL
   - Support URL
4. Upload .msixbundle package
5. Notes for certification:
   "This is a PWA productivity app. Subscriptions are handled 
    via Stripe (external payment). Test account: [provide one]
    or the app can be used without login for basic features."
6. Submit for review
```

### Phase 4: Review (1-3 business days)
```
- Microsoft reviews your app
- You'll get email notification
- If rejected: Fix issues → Resubmit
- If approved: App goes live within 24 hours
```

---

## Manifest Checklist

Verify your `public/manifest.webmanifest` has these fields:

```json
{
  "name": "Code Carry Home",
  "short_name": "CodeCarry",
  "description": "All-in-one productivity app",
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#000000",
  "background_color": "#ffffff",
  "orientation": "any",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "categories": ["productivity", "utilities"]
}
```

---

## Summary

| Item | Your Situation |
|------|---------------|
| **App Type** | PWA → MSIX via PWABuilder |
| **Cost** | $19 one-time (Partner Center) |
| **Payment Method** | ✅ Keep using **Stripe** — no commission to Microsoft |
| **Review Time** | 1-3 business days |
| **Commission** | **0%** if using your own Stripe payments |
| **Difficulty** | Easy — no code changes needed |

**Bottom line**: Microsoft Store is the EASIEST store to publish to. No code changes, no new payment system, keep your Stripe, pay $19 once, and you're live. 🚀
