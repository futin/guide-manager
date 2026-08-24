/** The registry file's shape — written by bin/register.js, read by the server. */
export type GuideType = 'study' | 'tutor';

export interface RegistryGuide {
  path: string;
  type: GuideType;
  title: string;
  updated: string;
}

export interface RegistryProject {
  name: string;
  path: string;
  guides: RegistryGuide[];
}

export interface Registry {
  projects: RegistryProject[];
}

/**
 * Breadcrumb context for one guide page. A file served merely because it sits
 * next to a registered guide has no registry entry, so `type` and `project`
 * are absent and the crumbs are left off rather than guessed.
 */
export interface GuideMeta {
  title: string;
  type?: GuideType;
  project?: string;
}
