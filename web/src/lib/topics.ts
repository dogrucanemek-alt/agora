// Category pages: the questions people ask before they know a server's name.
// Each topic is a search query; every number on the page is computed from the data at render time.

export type Topic = { slug: string; label: string; query: string; question: string };

export const TOPICS: Topic[] = [
  { slug: "postgres", label: "PostgreSQL", query: "postgres", question: "Which PostgreSQL MCP servers actually answer?" },
  { slug: "mysql", label: "MySQL", query: "mysql", question: "Which MySQL MCP servers actually answer?" },
  { slug: "github", label: "GitHub", query: "github", question: "Which GitHub MCP servers actually answer?" },
  { slug: "slack", label: "Slack", query: "slack", question: "Which Slack MCP servers actually answer?" },
  { slug: "notion", label: "Notion", query: "notion", question: "Which Notion MCP servers actually answer?" },
  { slug: "jira", label: "Jira", query: "jira", question: "Which Jira MCP servers actually answer?" },
  { slug: "google-drive", label: "Google Drive", query: "google drive", question: "Which Google Drive MCP servers actually answer?" },
  { slug: "gmail", label: "Gmail and email", query: "email", question: "Which email MCP servers actually answer?" },
  { slug: "calendar", label: "Calendar", query: "calendar", question: "Which calendar MCP servers actually answer?" },
  { slug: "browser", label: "Browser automation", query: "browser", question: "Which browser automation MCP servers actually answer?" },
  { slug: "web-search", label: "Web search", query: "web search", question: "Which web search MCP servers actually answer?" },
  { slug: "scraping", label: "Web scraping", query: "scrap", question: "Which web scraping MCP servers actually answer?" },
  { slug: "filesystem", label: "Files and filesystem", query: "file", question: "Which file and filesystem MCP servers actually answer?" },
  { slug: "memory", label: "Agent memory", query: "memory", question: "Which agent memory MCP servers actually answer?" },
  { slug: "payments", label: "Payments", query: "payment", question: "Which payment MCP servers actually answer?" },
  { slug: "stripe", label: "Stripe", query: "stripe", question: "Which Stripe MCP servers actually answer?" },
  { slug: "crypto", label: "Crypto and blockchain", query: "blockchain", question: "Which blockchain MCP servers actually answer?" },
  { slug: "aws", label: "AWS", query: "aws", question: "Which AWS MCP servers actually answer?" },
  { slug: "kubernetes", label: "Kubernetes", query: "kubernetes", question: "Which Kubernetes MCP servers actually answer?" },
  { slug: "docker", label: "Docker", query: "docker", question: "Which Docker MCP servers actually answer?" },
  { slug: "security", label: "Security", query: "security", question: "Which security MCP servers actually answer?" },
  { slug: "audit", label: "Audit and logging", query: "audit", question: "Which audit and logging MCP servers actually answer?" },
  { slug: "documentation", label: "Documentation", query: "docs", question: "Which documentation MCP servers actually answer?" },
  { slug: "weather", label: "Weather", query: "weather", question: "Which weather MCP servers actually answer?" },
  { slug: "maps", label: "Maps and location", query: "maps", question: "Which maps and location MCP servers actually answer?" },
  { slug: "finance", label: "Finance and markets", query: "stock", question: "Which finance and market data MCP servers actually answer?" },
  { slug: "crm", label: "CRM", query: "crm", question: "Which CRM MCP servers actually answer?" },
  { slug: "shopify", label: "Shopify and e-commerce", query: "shopify", question: "Which Shopify MCP servers actually answer?" },
  { slug: "figma", label: "Figma and design", query: "figma", question: "Which Figma MCP servers actually answer?" },
  { slug: "youtube", label: "YouTube", query: "youtube", question: "Which YouTube MCP servers actually answer?" },
];

export const topicBySlug = (slug: string) => TOPICS.find((t) => t.slug === slug) ?? null;
