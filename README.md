# iberdrola-ev

## Overview

`iberdrola-ev` is a minimal tool that fetches live data from Iberdrola EV-charging stations and shows current availability, connector type, power rating, location and other metadata. It helps EV drivers quickly check if a charging point is free or occupied without visiting the official site.

## Features

- Query station status (free / occupied) via Iberdrola’s API endpoint.
- Retrieve station metadata: coordinates, address, connector type & power, station name/id.
- Simple frontend (vanilla HTML + JS) to display station status in a browser.
- Optional serverless or backend component to regularly poll data and serve as an API for the frontend.

## Quick Start

```bash
git clone https://github.com/your-username/iberdrola-ev.git
cd iberdrola-ev
# If using a build setup:
npm install
npm run dev
# Or simply open index.html in your browser
```
