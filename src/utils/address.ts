interface AddressParts {
  streetName?: string;
  streetNum?: string;
  townName?: string;
  regionName?: string;
}

/**
 * Builds a raw address string from structured address parts.
 * Output: "Street Name 13, Town, Region"
 */
export function buildRawAddress(addr?: AddressParts): string {
  if (!addr) return 'Address unknown';
  return `${addr.streetName || ''} ${addr.streetNum || ''}, ${addr.townName || ''}, ${addr.regionName || ''}`.trim();
}

/**
 * Converts a string to Title Case (capitalizes first letter of each word)
 */
function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Formats an address from Iberdrola API format to a clean display format
 *
 * Input examples:
 * - "Franciscanes Purisima Concepcio 13, PEGO, ALICANTE"
 * - "CALLE MAYOR 45, VALENCIA, VALENCIA"
 *
 * Output: "Franciscanes Purisima Concepcio, 13 · Pego"
 */
export function formatAddress(addressFull: string | null | undefined): string | null {
  if (!addressFull) return null;

  const parts = addressFull.split(',').map((part) => part.trim());
  if (parts.length < 2) return toTitleCase(addressFull);

  const streetWithNumber = parts[0];
  const city = parts[1];

  const streetMatch = streetWithNumber.match(/^(.+?)\s+(\d+\S*)$/);

  let formattedStreet: string;
  if (streetMatch) {
    const [, street, number] = streetMatch;
    formattedStreet = `${toTitleCase(street)}, ${number}`;
  } else {
    formattedStreet = toTitleCase(streetWithNumber);
  }

  const formattedCity = toTitleCase(city);

  return `${formattedStreet} · ${formattedCity}`;
}
