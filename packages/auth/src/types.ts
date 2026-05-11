import type { UserType } from "@cio-agent/shared/types";

export interface JwtPayload {
  sub:                    string;   // user_id
  tenant_id:              string;
  role_id:                string;
  user_type:              UserType;
  account_application_id: string;
  jti:                    string;   // unique token id (for revocation)
  iat?:                   number;
  exp?:                   number;
}

export interface RefreshTokenPayload {
  sub:       string;   // user_id
  tenant_id: string;
  jti:       string;
  iat?:      number;
  exp?:      number;
}

export interface TokenPair {
  access_token:  string;
  refresh_token: string;
  expires_in:    number;  // seconds
}
