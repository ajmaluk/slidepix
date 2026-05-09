/**
 * Chat Organization — Groups & Projects
 * Stored locally in IndexedDB/localStorage for privacy.
 */

export interface ChatGroup {
  id: string;
  name: string;
  chatIds: string[];
  createdAt: number;
  color?: string;
}

export interface ChatProject {
  id: string;
  name: string;
  chatIds: string[];
  createdAt: number;
  icon?: string;
}

const GROUPS_KEY = "dalam-chat-groups";
const PROJECTS_KEY = "dalam-chat-projects";

// ─── Groups ───

export function loadGroups(): ChatGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveGroups(groups: ChatGroup[]) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

export function createGroup(name: string): ChatGroup {
  const groups = loadGroups();
  const group: ChatGroup = {
    id: crypto.randomUUID(),
    name,
    chatIds: [],
    createdAt: Date.now(),
  };
  groups.push(group);
  saveGroups(groups);
  return group;
}

export function addChatToGroup(groupId: string, chatId: string) {
  const groups = loadGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group && !group.chatIds.includes(chatId)) {
    group.chatIds.push(chatId);
    saveGroups(groups);
  }
}

export function removeChatFromGroup(groupId: string, chatId: string) {
  const groups = loadGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) {
    group.chatIds = group.chatIds.filter((id) => id !== chatId);
    saveGroups(groups);
  }
}

export function deleteGroup(groupId: string) {
  const groups = loadGroups().filter((g) => g.id !== groupId);
  saveGroups(groups);
}

export function renameGroup(groupId: string, newName: string) {
  const groups = loadGroups();
  const group = groups.find((g) => g.id === groupId);
  if (group) {
    group.name = newName;
    saveGroups(groups);
  }
}

// ─── Projects ───

export function loadProjects(): ChatProject[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveProjects(projects: ChatProject[]) {
  localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
}

export function createProject(name: string): ChatProject {
  const projects = loadProjects();
  const project: ChatProject = {
    id: crypto.randomUUID(),
    name,
    chatIds: [],
    createdAt: Date.now(),
  };
  projects.push(project);
  saveProjects(projects);
  return project;
}

export function addChatToProject(projectId: string, chatId: string) {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (project && !project.chatIds.includes(chatId)) {
    project.chatIds.push(chatId);
    saveProjects(projects);
  }
}

export function removeChatFromProject(projectId: string, chatId: string) {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (project) {
    project.chatIds = project.chatIds.filter((id) => id !== chatId);
    saveProjects(projects);
  }
}

export function deleteProject(projectId: string) {
  const projects = loadProjects().filter((p) => p.id !== projectId);
  saveProjects(projects);
}

export function renameProject(projectId: string, newName: string) {
  const projects = loadProjects();
  const project = projects.find((p) => p.id === projectId);
  if (project) {
    project.name = newName;
    saveProjects(projects);
  }
}

// ─── Chat Transfer (Export/Import) ───

export interface ExportedChat {
  version: 1;
  exportedAt: string;
  conversations: Array<{
    id: string;
    title: string;
    createdAt: string;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      timestamp: string;
      attachments?: any[];
    }>;
  }>;
  groups: ChatGroup[];
  projects: ChatProject[];
}

export function exportChats(conversations: any[]): string {
  const data: ExportedChat = {
    version: 1,
    exportedAt: new Date().toISOString(),
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
      messages: c.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
        attachments: m.attachments,
      })),
    })),
    groups: loadGroups(),
    projects: loadProjects(),
  };
  return JSON.stringify(data, null, 2);
}

export function downloadExport(conversations: any[]) {
  const json = exportChats(conversations);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dalam-chats-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseImport(jsonString: string): ExportedChat | null {
  try {
    const data = JSON.parse(jsonString);
    if (data.version === 1 && Array.isArray(data.conversations)) {
      return data as ExportedChat;
    }
    return null;
  } catch {
    return null;
  }
}
