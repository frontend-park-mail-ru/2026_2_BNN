/** Профиль пользователя, возвращаемый API. */
export interface User {
  id: string;
  login: string;
  avatar: string | null;
  created_at: string;
  updated_at: string;
  is_2fa_enabled: boolean;
  oauth_provider: "github" | null;
}
