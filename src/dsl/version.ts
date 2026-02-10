/**
 * DSL specification versioning.
 *
 * Each DSL version is explicitly identified, and producers/consumers
 * must declare the version they emit or accept.
 */

/** Supported DSL specification versions. */
export const DSL_SPEC_VERSIONS = ['1.0.0'] as const;
export type DslSpecVersion = (typeof DSL_SPEC_VERSIONS)[number];

/** The current default DSL specification version. */
export const CURRENT_DSL_VERSION: DslSpecVersion = '1.0.0';

/** Check if a version string is a supported DSL spec version. */
export function isSupportedVersion(version: string): version is DslSpecVersion {
  return (DSL_SPEC_VERSIONS as readonly string[]).includes(version);
}

/** Compatibility check: is versionA compatible with versionB? */
export function isCompatible(versionA: string, versionB: string): boolean {
  // For now, exact version match is required.
  // Future: implement semver-compatible range checks.
  return versionA === versionB;
}
