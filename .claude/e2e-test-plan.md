# E2E Test Plan (Playwright MCP)

## Overview

E2E tests using Playwright MCP server for browser automation. Tests run against `https://iberdrola-ev.vercel.app/`.

---

## Test Categories

### 1. Station Tab - Empty State

| Test                    | Steps                        | Expected                              |
| ----------------------- | ---------------------------- | ------------------------------------- |
| **Empty state message** | Open app                     | "No primary station selected" visible |
| **Navigate to search**  | Click "Find stations nearby" | Switches to Search tab                |

---

### 2. Search Functionality

| Test                 | Steps                                 | Expected                                  |
| -------------------- | ------------------------------------- | ----------------------------------------- |
| **Radius selector**  | Click Search tab, change radius       | Radius updates to selected value          |
| **Search execution** | Set 3km, click "Find Stations"        | Loading state, then results appear        |
| **Free/Paid filter** | Toggle switch after search            | Filters stations accordingly              |
| **Empty results**    | Search in remote area                 | "No free charging stations found" message |
| **Error handling**   | Search without geolocation permission | Error alert displayed                     |

---

### 3. Station Selection Flow (User's Test)

**Scenario**: Select "pego cervantes" as primary station

| Step | Action                                         | Verification                          |
| ---- | ---------------------------------------------- | ------------------------------------- |
| 1    | Navigate to `https://iberdrola-ev.vercel.app/` | App loads                             |
| 2    | Verify Station tab is active                   | "No primary station selected" visible |
| 3    | Click Search tab                               | Search UI visible                     |
| 4    | Set radius to 3km                              | Radius selector shows 3               |
| 5    | Click "Find Stations"                          | Loading indicator, then results       |
| 6    | Find "pego cervantes" in results               | Station card visible                  |
| 7    | Click star icon on "pego cervantes"            | Snackbar "Primary station updated"    |
| 8    | Navigate to Station tab                        | Station details displayed             |
| 9    | Verify station name                            | "pego cervantes" in header            |
| 10   | Verify port status                             | Port 1 and Port 2 visible             |

**Preconditions**:

- Geolocation set to Pego area (38.8398, -0.1197)
- Dev server running at localhost:5173

---

### 4. Station Details

| Test                  | Steps                            | Expected                          |
| --------------------- | -------------------------------- | --------------------------------- |
| **Station info**      | Select station, view Station tab | Name, address, schedule visible   |
| **Port status**       | View port cards                  | Status (Available/Occupied) shown |
| **Distance display**  | With geolocation                 | Distance in km displayed          |
| **Map link**          | Click map icon                   | Opens Google Maps in new tab      |
| **Refresh indicator** | Wait for realtime update         | Realtime badge visible            |

---

### 5. TTL-Based Data Loading

| Test               | Steps                           | Expected                                  |
| ------------------ | ------------------------------- | ----------------------------------------- |
| **Fresh cache**    | Select station with recent data | No Edge call (check network)              |
| **Stale cache**    | Select station with old data    | Edge call triggered                       |
| **Loading states** | Select station                  | `loading_cache` → `loading_api` → `ready` |
| **Error recovery** | Simulate Edge error             | Error message, data still usable          |

---

### 6. Push Notifications (PWA)

| Test                         | Steps                           | Expected                       |
| ---------------------------- | ------------------------------- | ------------------------------ |
| **Subscribe button visible** | Open station with occupied port | "Notify when available" button |
| **Subscribe flow**           | Click subscribe                 | Loading → Success state        |
| **Already subscribed**       | Return to subscribed station    | Subscribed badge visible       |

---

### 7. Edge Cases

| Test                         | Steps                                | Expected                    |
| ---------------------------- | ------------------------------------ | --------------------------- |
| **localStorage persistence** | Select station, reload page          | Same station displayed      |
| **Tab sync**                 | Open 2 tabs, change station in tab 1 | Tab 2 updates automatically |
| **Offline mode**             | Disconnect network after load        | Cached data still visible   |
| **Invalid station**          | Manually set invalid cpId            | Error message displayed     |

---

## Implementation with Playwright MCP

### Test 3: Station Selection Flow (Complete Example)

```
# Step 1: Navigate to app
browser_navigate url="https://iberdrola-ev.vercel.app/"

# Step 2: Screenshot initial state
browser_screenshot name="01-initial-state"

# Step 3: Verify empty state
browser_wait text="No primary station selected"

# Step 4: Click Search tab
browser_click element="Search"

# Step 5: Screenshot search tab
browser_screenshot name="02-search-tab"

# Step 6: Select 3km radius
browser_click element="css=.MuiSelect-select"
browser_click element="3"

# Step 7: Click Find Stations
browser_click element="Find Stations"

# Step 8: Wait for results
browser_wait text="pego" timeout=30000

# Step 9: Screenshot results
browser_screenshot name="03-search-results"

# Step 10: Click star on "pego cervantes"
browser_click element="css=[data-station-name='pego cervantes'] button[aria-label='Set as primary']"

# Step 11: Wait for snackbar
browser_wait text="Primary station updated"

# Step 12: Click Station tab
browser_click element="Station"

# Step 13: Verify station loaded
browser_wait text="pego cervantes" timeout=10000

# Step 14: Final screenshot
browser_screenshot name="04-station-selected"

# Step 15: Check console for errors
browser_console_messages
```

---

## Test Data Requirements

### Geolocation Mock

For consistent results, mock geolocation to Pego area:

- Latitude: 38.8398
- Longitude: -0.1197

### Known Stations (for assertions)

| Station Name             | cpId | Area |
| ------------------------ | ---- | ---- |
| pego cervantes           | TBD  | Pego |
| (add more as discovered) |      |      |

---

## Running Tests

### Prerequisites

1. Dev server running: `yarn dev`
2. Geolocation permission granted or mocked
3. Network access to Supabase

### Manual Execution

Using Playwright MCP tools directly in Claude conversation.

### Future: Automated

```bash
# TODO: Add Playwright test files
yarn test:e2e
```

---

## Priority Order

1. **P0 - Critical**: Station Selection Flow (Test 3)
2. **P1 - High**: Search Functionality (Test 2)
3. **P1 - High**: Station Details (Test 4)
4. **P2 - Medium**: TTL-Based Loading (Test 5)
5. **P2 - Medium**: Empty State (Test 1)
6. **P3 - Low**: Push Notifications (Test 6)
7. **P3 - Low**: Edge Cases (Test 7)

---

## Success Criteria

- [ ] All P0 tests pass
- [ ] All P1 tests pass
- [ ] No console errors during tests
- [ ] Screenshots match expected UI
- [ ] Network requests are minimal (TTL working)
