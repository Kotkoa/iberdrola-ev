/**
 * Generates a Google Maps URL for the given coordinates
 * @param latitude - Latitude coordinate
 * @param longitude - Longitude coordinate
 * @param zoom - Optional zoom level (1-21, default: no zoom)
 * @returns Google Maps URL
 */
export const generateGoogleMapsUrl = (
  latitude: number,
  longitude: number,
  zoom?: number
): string => {
  const baseUrl = `https://www.google.com/maps?q=${latitude},${longitude}`
  return zoom ? `${baseUrl}&z=${zoom}` : baseUrl
}
