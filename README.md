# Iberdrola EV Charger Monitor

Real-time monitoring dashboard for Iberdrola electric vehicle charging stations, displaying live availability status, connector types, and charging duration.

![Main Dashboard](./screenshot.png)

## Overview

**Iberdrola EV Charger Monitor** is a modern React-based web application that provides real-time monitoring of Iberdrola EV charging points. Built with Material-UI and TypeScript, it fetches live data from a Supabase backend to display charging port availability, power ratings, connector types, and occupancy duration. The application helps EV drivers quickly determine if their preferred charging station is available without visiting the physical location.

## Key Features

- **Real-Time Status Display**: Monitor availability of two charging ports simultaneously
- **Smart Duration Tracking**: Automatic calculation and display of how long a port has been occupied
- **Visual Status Indicators**: Color-coded cards (green for available, orange for busy)
- **Connector Information**: Type 2 connector details with power ratings (kW)
- **Location Details**: Station name, address, and operating schedule
- **Responsive Design**: Clean Material-UI interface optimized for mobile and desktop
- **Auto-Refresh**: Time updates every minute to maintain accuracy

## Technology Stack

- **Frontend**: React 19 with TypeScript
- **UI Framework**: Material-UI (MUI) v7
- **Styling**: Tailwind CSS v4
- **Build Tool**: Vite
- **Backend**: Supabase (PostgreSQL database with REST API)
- **Deployment**: Netlify

## Architecture

### Data Flow

```
Supabase Database → REST API → React Frontend → User Interface
     ↓
charge_logs_parsed table (stores charging station status)
```

### Component Structure

```
App.tsx (main component)
  ├─ useCharger() hook → fetches latest charger status
  ├─ Material-UI Components (Typography, Box, Stack, Chip, etc.)
  └─ Copyright component
```

### API Layer

- **`api/supabase.ts`**: Core Supabase client with authenticated fetch wrapper
- **`api/charger.ts`**: Charger-specific API calls (fetch latest status)
- **`hooks/useCharger.ts`**: React hook for data fetching with loading/error states

### Data Model

The `ChargerStatus` type includes:

- Station metadata (ID, name, schedule)
- Two ports with individual status, power ratings, and update timestamps
- Overall status tracking

## How It Works

### 1. Data Fetching

The application uses the `useCharger` hook to fetch the latest charging station data from Supabase on component mount:

```typescript
const { data: charger, loading, error } = useCharger()
```

The hook queries the `charge_logs_parsed` table, retrieving the most recent record sorted by creation date.

### 2. Real-Time Duration Calculation

The app maintains a local timer that updates every minute to calculate how long each port has been busy:

```typescript
const port1DurationMinutes = port1Update
  ? Math.floor((now.getTime() - port1Update.getTime()) / 60000)
  : null
```

### 3. Status Visualization

Each of the two charging ports is displayed in a dedicated card showing:

- **Availability status** (Available/Busy) with color coding
- **Duration** of current session if occupied
- **Connector type** (Type 2) with visual icon
- **Power rating** in kilowatts

### 4. Smart Status Summary

The application calculates a summary showing how many ports are available out of two:

```typescript
const statusSummary = {
  available: (isFirstPortAvailable ? 1 : 0) + (isSecondPortAvailable ? 1 : 0),
}
```

### 5. User Interface Features

- **Header**: Large status indicator showing available ports count
- **Metadata Section**: Iberdrola branding, location, station details
- **Info Banner**: Displays station ID and power limitation notice
- **Charging Cards**: Two side-by-side cards for each port with detailed information
- **Map Integration**: "Show on map" button for navigation (UI element)

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account with configured database

### Installation

```bash
git clone https://github.com/Kotkoa/iberdrola-ev.git
cd iberdrola-ev
npm install
```

### Environment Setup

Create a `.env` file in the root directory:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Development

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Database Schema

The application expects a table in Supabase with the following structure:

```sql
CREATE TABLE charge_logs_parsed (
  id UUID PRIMARY KEY,
  created_at TIMESTAMP,
  cp_id INTEGER,
  cp_name TEXT,
  schedule TEXT,
  port1_status TEXT,
  port2_status TEXT,
  port1_power_kw NUMERIC,
  port1_update_date TIMESTAMP,
  port2_power_kw NUMERIC,
  port2_update_date TIMESTAMP,
  overall_status TEXT,
  overall_update_date TIMESTAMP
);
```

## Deployment

The application is configured for Netlify deployment with the included `netlify.toml` configuration file. Simply connect your GitHub repository to Netlify and set the environment variables in the Netlify dashboard.

## Use Cases

- **EV Drivers**: Check station availability before driving to the location
- **Fleet Managers**: Monitor charging infrastructure usage
- **Station Operators**: Track utilization patterns and port status
- **Mobile Users**: Quick mobile-friendly interface for on-the-go checks

## Future Enhancements

- [ ] Multiple station support
- [ ] Historical usage analytics and graphs
- [ ] Push notifications when a port becomes available
- [ ] Interactive map integration with navigation
- [ ] Reservation system integration
- [ ] Real-time WebSocket updates instead of polling

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
