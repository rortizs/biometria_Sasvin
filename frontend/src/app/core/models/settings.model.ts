export interface Settings {
  id: string;
  company_name: string;
  company_address: string | null;
  slogan: string | null;
  email_domain: string;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SettingsUpdate {
  company_name?: string;
  company_address?: string | null;
  slogan?: string | null;
  email_domain?: string;
  logo_url?: string | null;
}

export interface SettingsCreate {
  company_name: string;
  email_domain: string;
  company_address?: string | null;
  slogan?: string | null;
  logo_url?: string | null;
}
