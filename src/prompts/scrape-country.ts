/**
 * Prompt template for country-level boundary generation.
 */

export function getCountryPrompt(target: string, outputDir: string): string {
  return `Generate DIGIT boundary data for the country: "${target}"

## Steps

1. **Research the country**:
   - Search for "${target} administrative divisions" and "${target} ISO 3166-2 codes"
   - Find the official list of first-level administrative divisions (states/provinces/regions)
   - Get ISO 3166-2 subdivision codes for each division
   - Get approximate centroid coordinates for the country and each subdivision

2. **Create the output directory**:
   - Determine the ISO 3166-1 alpha-2 code for the country (e.g. "IN" for India)
   - Use Bash to run: mkdir -p ${outputDir}/{ISO_CODE}
   - All files below go into ${outputDir}/{ISO_CODE}/

3. **Generate hierarchy-definition.json**:
   - Define the administrative hierarchy for this country
   - Typical: Country → State/Province → District → City/Town
   - Write to ${outputDir}/{ISO_CODE}/hierarchy-definition.json

4. **Generate boundaries-flat.json**:
   - Include the country itself as the root boundary
   - Include ALL first-level divisions (states/provinces/regions/etc.)
   - Each entry needs: code, tenantId, geometry (Point with coordinates)
   - For coordinates, use approximate centroids (search if needed)
   - Write to ${outputDir}/{ISO_CODE}/boundaries-flat.json

5. **Generate boundary-relationships.json**:
   - Country entry: parent = null, boundaryType = "Country"
   - Each subdivision: parent = country code, boundaryType = "State" (or equivalent)
   - Write to ${outputDir}/{ISO_CODE}/boundary-relationships.json

6. **Generate metadata.json**:
   - Include all sources you used with their URLs
   - Write to ${outputDir}/{ISO_CODE}/metadata.json

## Important

- Include ALL subdivisions — do not skip any
- For India: 28 states + 8 union territories = 36 subdivisions + 1 country = 37 total entries
- Use real coordinates — do not make them up
- Double-check ISO codes are correct
- Write valid JSON (no trailing commas, proper escaping)

After writing all files, output a summary of what was generated (total boundary count, file paths).
`;
}
