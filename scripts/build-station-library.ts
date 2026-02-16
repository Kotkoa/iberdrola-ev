/**
 * Build station library from Iberdrola API snapshots
 *
 * Usage:
 *   npx tsx scripts/build-station-library.ts
 *
 * Input: data/snapshots/*.json (Iberdrola API responses)
 * Output: public/stations/library.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { buildRawAddress } from '../src/utils/address';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface IberdrolaPhysicalSocket {
  socketType?: {
    socketName?: string;
    socketTypeId?: string;
  };
  appliedRate?: {
    recharge?: {
      finalPrice?: number;
    };
  };
  maxPower?: number;
}

interface IberdrolaLogicalSocket {
  physicalSocket?: IberdrolaPhysicalSocket[];
}

interface IberdrolaStation {
  cpId: number;
  socketNum?: number;
  cpStatus?: {
    statusCode?: string;
  };
  locationData: {
    cuprId: number;
    cuprName: string;
    latitude: number;
    longitude: number;
    cuprReservationIndicator?: boolean;
    supplyPointData?: {
      cpAddress?: IberdrolaAddress;
    };
  };
  logicalSocket?: IberdrolaLogicalSocket[];
}

interface IberdrolaResponse {
  entidad: IberdrolaStation[];
}

interface LibraryStation {
  cpId: number;
  cuprId: number;
  name: string;
  lat: number;
  lon: number;
  address: string;
  socketType: string;
  maxPower: number | null;
  priceKwh: number | null;
  totalPorts: number;
  free: boolean;
}

const SOCKET_TYPE_MAP: Record<string, string> = {
  '1': 'Schuko',
  '2': 'Type 2 (Mennekes)',
  '3': 'CHAdeMO',
  '4': 'CCS Combo 2',
};

function extractStation(item: IberdrolaStation): LibraryStation | null {
  if (!item.cpId || !item.locationData) {
    return null;
  }

  const { locationData, logicalSocket } = item;

  // Extract socket info from first physical socket
  const firstSocket = logicalSocket?.[0]?.physicalSocket?.[0];
  const socketTypeId = firstSocket?.socketType?.socketTypeId;
  const socketType = socketTypeId
    ? SOCKET_TYPE_MAP[socketTypeId] || `Type ${socketTypeId}`
    : 'Unknown';
  const maxPower = firstSocket?.maxPower ?? null;
  const priceKwh = firstSocket?.appliedRate?.recharge?.finalPrice ?? null;

  return {
    cpId: item.cpId,
    cuprId: locationData.cuprId,
    name: locationData.cuprName,
    lat: locationData.latitude,
    lon: locationData.longitude,
    address: buildRawAddress(locationData.supplyPointData?.cpAddress),
    socketType,
    maxPower,
    priceKwh,
    totalPorts: item.socketNum ?? 1,
    free: priceKwh === 0 || priceKwh === null,
  };
}

function main() {
  const snapshotsDir = path.join(__dirname, '..', 'data', 'snapshots');
  const outputDir = path.join(__dirname, '..', 'public', 'stations');
  const outputFile = path.join(outputDir, 'library.json');

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Read all JSON files from snapshots directory
  const files = fs.readdirSync(snapshotsDir).filter((f) => f.endsWith('.json'));

  if (files.length === 0) {
    console.error('No JSON files found in', snapshotsDir);
    process.exit(1);
  }

  console.log(`Found ${files.length} snapshot file(s)`);

  const stationsMap = new Map<number, LibraryStation>();

  for (const file of files) {
    const filePath = path.join(snapshotsDir, file);
    console.log(`Processing: ${file}`);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data: IberdrolaResponse = JSON.parse(content);

      if (!data.entidad || !Array.isArray(data.entidad)) {
        console.warn(`  Skipping: no 'entidad' array found`);
        continue;
      }

      let added = 0;
      let skipped = 0;

      for (const item of data.entidad) {
        const station = extractStation(item);
        if (station) {
          // Deduplicate by cpId (keep first occurrence)
          if (!stationsMap.has(station.cpId)) {
            stationsMap.set(station.cpId, station);
            added++;
          } else {
            skipped++;
          }
        }
      }

      console.log(`  Added: ${added}, Duplicates skipped: ${skipped}`);
    } catch (err) {
      console.error(`  Error processing ${file}:`, err);
    }
  }

  const stations = Array.from(stationsMap.values());
  const freeStations = stations.filter((s) => s.free);

  console.log(`\nTotal unique stations: ${stations.length}`);
  console.log(`Free stations: ${freeStations.length}`);

  // Write full library
  fs.writeFileSync(outputFile, JSON.stringify(stations, null, 2));
  console.log(`\nWritten: ${outputFile}`);

  // Write free-only library
  const freeOutputFile = path.join(outputDir, 'library-free.json');
  fs.writeFileSync(freeOutputFile, JSON.stringify(freeStations, null, 2));
  console.log(`Written: ${freeOutputFile}`);
}

main();
