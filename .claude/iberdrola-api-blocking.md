# Iberdrola API Blocking Issue

## Timeline

**Before (worked ~1 week ago):**
- Search feature fetched live data from Iberdrola API
- Used `corsproxy.io` as CORS proxy
- All stations showed real-time availability

**After (current state):**
- All proxy methods return 403 Forbidden
- Search falls back to cached data
- Message: "Live data unavailable. Showing cached results."

---

## Root Cause

**Iberdrola enabled aggressive IP blocking via Akamai CDN.**

Error response:
```html
<H1>Access Denied</H1>
You don't have permission to access "http://www.iberdrola.es/..." on this server.
Reference #18.d56d655f.1769689418.16279892
https://errors.edgesuite.net/18...
```

The `edgesuite.net` domain confirms **Akamai CDN** is performing the blocking.

---

## Blocked IP Ranges

| Source | IP Range | Status |
|--------|----------|--------|
| corsproxy.io | Cloudflare | ❌ 403 |
| Vercel (AWS Lambda) | AWS | ❌ 403 |
| Cloudflare Workers | Cloudflare | ❌ 403 |
| Supabase Edge Functions | AWS/Deno | ❌ 403 |
| allorigins.win | Cloudflare | ❌ 403 |
| Local Mac (Spanish ISP) | Residential | ❌ 403 |
| **GitHub Actions** | **Azure** | ✅ Works |

---

## Why GitHub Actions Works

The `iberdrola-scraper` repository runs on GitHub Actions (Azure infrastructure).

Azure IP ranges are not blocked by Iberdrola/Akamai, likely because:
1. Azure is less commonly used for scraping
2. Microsoft enterprise IPs have better reputation
3. Akamai blocklists focus on AWS/Cloudflare

Scraper code uses identical headers — only IP differs.

---

## Attempted Solutions

### 1. Cloudflare Worker (Failed)
- Created worker at `https://calm-base-a362.kotkoa.workers.dev`
- Same headers as working scraper
- Result: 403 Forbidden

### 2. Alternative CORS Proxies (Failed)
Tested multiple public CORS proxies:
- cors-anywhere.herokuapp.com — requires demo access
- cors.sh — rate limited (paid)
- thingproxy, codetabs, crossorigin.me — no response
- All others — 403 Forbidden

### 3. Direct Fetch from Browser (Failed)
- CORS policy blocks preflight
- Even if CORS allowed, IP would be blocked

---

## Viable Solutions

### Option 1: GitHub Actions Proxy (Recommended)
**Pros:**
- Free (2000 min/month)
- Azure IPs work
- Already have working scraper code

**Cons:**
- Not real-time (workflow dispatch delay)
- Requires `repository_dispatch` API setup

**Implementation:**
1. Create workflow that accepts HTTP requests
2. Proxy to Iberdrola API
3. Return response via GitHub API or artifact

### Option 2: Self-hosted VPS
**Pros:**
- Full control
- Real-time responses
- Can choose location (Spain/Europe)

**Cons:**
- Cost (~$5/month minimum)
- Maintenance required
- IP may get blocked eventually

**Providers:**
- Hetzner (Germany) — €4.50/month
- OVH (France/Spain) — €3.50/month
- Oracle Cloud — Free tier (test first)

### Option 3: Residential Proxy Service
**Pros:**
- Residential IPs rarely blocked
- Rotating IPs

**Cons:**
- Expensive ($20+/month)
- Overkill for this use case

---

## Current Workaround

The app falls back to **cached data** from Supabase:
1. Scraper runs every 10 minutes on GitHub Actions
2. Data saved to `station_snapshots` table
3. Search shows cached results when API fails

**Limitation:** Data is up to 10 minutes stale.

---

## Recommended Next Steps

1. **Short-term:** Accept cached data fallback (current behavior)
2. **Medium-term:** Implement GitHub Actions proxy endpoint
3. **Long-term:** Monitor if Iberdrola relaxes blocking

---

## Related Files

- [src/services/iberdrola.ts](../src/services/iberdrola.ts) — Fallback chain implementation
- [src/constants/index.ts](../src/constants/index.ts) — Proxy endpoints
- [iberdrola-scraper](https://github.com/Kotkoa/iberdrola-scraper) — Working scraper on GitHub Actions
