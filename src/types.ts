/**
 * DIGIT Boundary Service V2 TypeScript types.
 */

// ---------------------------------------------------------------------------
// Boundary Entity (boundaries-flat.json)
// ---------------------------------------------------------------------------

export interface BoundaryEntity {
  code: string;
  tenantId: string;
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [longitude, latitude]
  };
}

// ---------------------------------------------------------------------------
// Boundary Relationship (boundary-relationships.json)
// ---------------------------------------------------------------------------

export interface BoundaryRelationship {
  tenantId: string;
  code: string;
  hierarchyType: string;
  boundaryType: string;
  parent: string | null;
}

// ---------------------------------------------------------------------------
// Hierarchy Definition (hierarchy-definition.json)
// ---------------------------------------------------------------------------

export interface BoundaryHierarchyLevel {
  boundaryType: string;
  parentBoundaryType: string | null;
  active: boolean;
}

export interface HierarchyDefinition {
  tenantId: string;
  hierarchyType: string;
  boundaryHierarchy: BoundaryHierarchyLevel[];
}

// ---------------------------------------------------------------------------
// Metadata (metadata.json)
// ---------------------------------------------------------------------------

export interface DataSource {
  name: string;
  url: string;
  accessedAt: string; // ISO 8601
}

export interface Metadata {
  name: string;
  code: string;
  level: "country" | "state" | "city";
  isoCode: string;
  parentCode: string | null;
  tenantId: string;
  generatedAt: string; // ISO 8601
  sources: DataSource[];
}

// ---------------------------------------------------------------------------
// Catalog (data/catalog.json)
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  code: string;
  name: string;
  level: "country" | "state" | "city";
  path: string;
  generatedAt: string;
  boundaryCount: number;
}

export interface Catalog {
  version: string;
  generated: CatalogEntry[];
  lastUpdated: string | null;
}

// ---------------------------------------------------------------------------
// CLI types
// ---------------------------------------------------------------------------

export type Level = "country" | "state" | "city";

export interface GenerateOptions {
  target: string;
  level: Level;
}

export interface ValidateOptions {
  path: string;
}
