// Helpers for the `created_by` text column whose CHECK enforces is_valid_provenance().
// Valid prefixes: user:<uuid>, claude:<purpose>, sync_job:<name>, automation:<name>,
// trigger:<name>, import:<label>.

export const provenanceUser = (userId: string) => `user:${userId}`;
export const provenanceClaude = (purpose: string) => `claude:${purpose}`;
export const provenanceImport = (label: string) => `import:${label}`;
export const provenanceAutomation = (name: string) => `automation:${name}`;
