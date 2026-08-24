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

/** Per-guide reading progress as the API publishes it. Null when never opened. */
export interface GuideProgress {
  scrollPercent: number;
  completed: boolean;
  lastOpenedAt: string;
  openCount: number;
}

export interface GuideEntry {
  path: string;
  title: string;
  type: GuideType;
  updated: string;
  /** Ready-made viewer URL, so the client never has to build the encoding itself. */
  href: string;
  progress: GuideProgress | null;
}

export interface ProjectEntry {
  name: string;
  path: string;
  guides: GuideEntry[];
}

export interface GuidesIndex {
  projects: ProjectEntry[];
}
