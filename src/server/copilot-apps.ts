import { listProviders } from "@/integrations/registry";

/**
 * Well-known apps and services people name in automation requests. Used only to detect a request that needs an app
 * Flowline has no integration for, so Copilot says so instead of letting a model substitute something else.
 * Names of available integrations are always excluded (from the live registry).
 */
const KNOWN_APPS = [
  "Salesforce", "Zapier", "Make.com", "n8n", "Trello", "Asana", "Jira", "Confluence", "Discord", "Microsoft Teams", "Outlook",
  "Office 365", "OneDrive", "SharePoint", "Dynamics 365", "Dropbox", "Box", "Shopify", "WooCommerce", "Mailchimp", "Intercom",
  "Twilio", "WhatsApp", "Telegram", "Pipedrive", "Monday.com", "ClickUp", "Basecamp", "Figma", "Calendly", "Typeform", "Jotform",
  "QuickBooks", "Xero", "FreshBooks", "Twitter", "LinkedIn", "Facebook", "Instagram", "TikTok", "YouTube", "Google Drive",
  "Google Calendar", "Google Docs", "Google Analytics", "BigQuery", "Redshift", "MySQL", "MongoDB", "Supabase", "Firebase",
  "DynamoDB", "Amazon S3", "AWS Lambda", "Azure", "Datadog", "PagerDuty", "Sentry", "GitLab", "Bitbucket", "Webflow", "WordPress",
  "Squarespace", "Wix", "Coda", "SendGrid", "Mailgun", "Postmark", "Zoom", "Loom", "Miro", "Freshdesk", "Help Scout", "ServiceNow",
  "Klaviyo", "Braze", "Marketo", "Pardot", "Segment", "Mixpanel", "Amplitude", "Gong", "Outreach", "Apollo", "Clearbit",
  "Zoho", "Close CRM", "Copper", "Front", "Gorgias", "Kustomer", "Paddle", "PayPal", "Square", "Chargebee", "Recurly", "Harvest",
  "Toggl", "Todoist", "Evernote", "Smartsheet", "Workday", "BambooHR", "Greenhouse", "Lever", "DocuSign", "PandaDoc",
];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Apps named in the request that Flowline can't connect to (case-insensitive, whole words). */
export function unavailableAppsIn(request: string): string[] {
  const available = listProviders().map((p) => p.name.toLowerCase());
  return KNOWN_APPS.filter((app) => !available.includes(app.toLowerCase()) && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(app)}([^\\p{L}\\p{N}]|$)`, "iu").test(request));
}

export function availableIntegrationNames() {
  return listProviders().map((p) => p.name);
}
