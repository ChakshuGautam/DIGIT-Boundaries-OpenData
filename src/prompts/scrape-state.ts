/**
 * Prompt template for state-level boundary generation.
 */

export function getStatePrompt(target: string, outputDir: string, parentDir: string): string {
  return `Generate DIGIT boundary data for the state/province: "${target}"

## Steps

1. **Research the state/province**:
   - Search for "${target} districts list" and "${target} administrative divisions"
   - Find the official list of districts/counties/municipalities
   - Get approximate centroid coordinates for each district
   - Identify the ISO 3166-2 code for this state if not already known

2. **Read parent data** (if available):
   - Try to read ${parentDir}/{COUNTRY_ISO}/boundaries-flat.json to get the parent country code and state code
   - If not available, derive the codes from the target name and ISO standards
   - Determine the ISO 3166-2 suffix for this state (e.g. "KA" for Karnataka)

3. **Create the output directory**:
   - Use Bash to run: mkdir -p ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}
   - Example: mkdir -p ${outputDir}/IN/KA
   - All files below go into ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/

4. **Generate boundaries-flat.json**:
   - Include the state itself as the root boundary for this file
   - Include ALL districts/second-level divisions
   - Each entry needs: code (e.g. IN_KA_BLR_D for Bengaluru District), tenantId, geometry
   - Write to ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/boundaries-flat.json

5. **Generate boundary-relationships.json**:
   - State entry: parent = country code, boundaryType = "State"
   - Each district: parent = state code, boundaryType = "District"
   - Write to ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/boundary-relationships.json

6. **Generate metadata.json**:
   - Include all sources you used
   - Write to ${outputDir}/{COUNTRY_ISO}/{STATE_SUFFIX}/metadata.json

## Important

- Include ALL districts/second-level divisions — do not skip any
- Use real coordinates from GeoNames or OSM
- Codes follow the pattern: {COUNTRY}_{STATE}_{DISTRICT_ABBREV}
- TenantIds follow: {country}.{state}.{district} (all lowercase)
- Write valid JSON

After writing all files, output a summary of what was generated.
`;
}
