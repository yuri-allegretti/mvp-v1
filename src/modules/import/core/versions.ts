export const PARSER_VERSION = "itau-v1";
export const LAYOUT_VERSION = "itau-layout-v1";
export const EXTERNAL_ID_VERSION = "hash-v1";
export const IMPORT_PIPELINE_VERSION = "pipeline-v1";

export const IMPORT_VERSIONS = Object.freeze({
  parserVersion: PARSER_VERSION,
  layoutVersion: LAYOUT_VERSION,
  externalIdVersion: EXTERNAL_ID_VERSION,
  importPipelineVersion: IMPORT_PIPELINE_VERSION,
});

export type ImportVersions = typeof IMPORT_VERSIONS;
