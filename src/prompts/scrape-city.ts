/**
 * Prompt template for city-level boundary generation.
 */

export function getCityPrompt(target: string, outputDir: string, parentDir: string): string {
  return `Generate DIGIT boundary data for the city: "${target}"

## Steps

1. **Research the city** (check GitHub repos FIRST):
   - Search GitHub for existing boundary data: "${target} wards geojson github", "${target} ward boundaries data"
   - If a GitHub repo with ward/zone data exists, clone it with Bash and extract the data directly
   - If no repo found, search for "${target} wards list" or "${target} administrative zones"
   - Find the official list of wards/zones/divisions within this city
   - Get approximate coordinates for each ward/zone
   - Identify the municipal corporation structure

2. **Read parent data** (if available):
   - Try to read ${parentDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/boundaries-flat.json to get parent codes
   - If not available, derive from the target name
   - Determine a 3-letter code for the city (e.g. "BLR" for Bengaluru)

3. **Create the output directory**:
   - Use Bash to run: mkdir -p ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/{CITY_CODE}
   - Example: mkdir -p ${outputDir}/IN/KA/BLR
   - All files below go into ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/{CITY_CODE}/

4. **Generate boundaries-flat.json**:
   - Include the city itself
   - Include all wards/zones/divisions
   - Each entry needs: code (e.g. IN_KA_BLR_W01), tenantId, geometry
   - Write to ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/{CITY_CODE}/boundaries-flat.json

5. **Generate boundary-relationships.json**:
   - City entry: parent = district/state code, boundaryType = "City"
   - If the city has zones: zone parent = city, boundaryType = "Zone"
   - Wards: parent = zone (or city if no zones), boundaryType = "Ward"
   - Write to ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/{CITY_CODE}/boundary-relationships.json

6. **Generate metadata.json**:
   - Include all sources
   - Write to ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/{CITY_CODE}/metadata.json

## Important

- Include as many wards/zones as you can find from official sources
- Use real coordinates
- Codes: {COUNTRY}_{STATE}_{CITY}_{WARD_CODE}
- TenantIds: {country}.{state}.{city}.{ward} (all lowercase)
- Write valid JSON

After writing all files, output a summary of what was generated.
`;
}
