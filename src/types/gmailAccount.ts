export interface GmailAccount {
  id: string;
  org_id: string;
  user_id: string;
  gmail_email: string;
  provider: string;
  access_token?: string;
  refresh_token: string;
  token_type?: string;
  scope?: string;
  expires_at?: string;
  status: 'active' | 'connected' | 'expired' | 'error' | 'disconnected';
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface GmailAuthUrlResponse {
  authUrl: string;
}

export interface GmailConnectionStatus {
  connected: boolean;
  account?: GmailAccount;
}
