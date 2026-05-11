export interface JiraAuthConfig {
  host: string;
  email: string;
  apiToken: string;
}

export interface JiraIssue {
  id: string;
  key: string;
  summary: string;
  status: string;
  issueType: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  project: string;
  created: string;
  updated: string;
  url: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraTransition {
  id: string;
  name: string;
}

export interface JiraApiIssue {
  id: string;
  key: string;
  self: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    priority: { name: string } | null;
    assignee: { displayName: string } | null;
    reporter: { displayName: string } | null;
    project: { key: string };
    created: string;
    updated: string;
  };
}

export interface JiraApiProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraSearchResponse {
  issues: JiraApiIssue[];
  total: number;
  startAt: number;
  maxResults: number;
}

export interface JiraCreateIssueResponse {
  id: string;
  key: string;
  self: string;
}
