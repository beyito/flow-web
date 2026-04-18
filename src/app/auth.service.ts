export interface AuthProfile {
  username: string;
  roles: string[];
  company: string;
  parentCompany: string;
}

const AUTH_TOKEN_KEY = 'flow-web-auth-token';
const AUTH_PROFILE_KEY = 'flow-web-auth-profile';

export class AuthService {
  private profile: AuthProfile | null = null;

  constructor() {
    const savedProfile = localStorage.getItem(AUTH_PROFILE_KEY);
    if (savedProfile) {
      this.profile = JSON.parse(savedProfile) as AuthProfile;
    }
  }

  public isAuthenticated(): boolean {
    return !!this.getToken();
  }

  public getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  }

  public getProfile(): AuthProfile | null {
    return this.profile;
  }

  public async login(username: string, password: string): Promise<AuthProfile> {
    const response = await fetch('http://localhost:8080/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    if (!response.ok) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    const data = await response.json();
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    const profile: AuthProfile = {
      username: data.username,
      roles: data.roles || [],
      company: data.company || '',
      parentCompany: data.parentCompany || ''
    };
    this.profile = profile;
    localStorage.setItem(AUTH_PROFILE_KEY, JSON.stringify(profile));
    return profile;
  }

  public logout(): void {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_PROFILE_KEY);
    this.profile = null;
  }

  public async register(username: string, password: string, role: string, company: string, parentCompany: string): Promise<void> {
    const response = await fetch('http://localhost:8080/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password, role, company, parentCompany })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(error || 'No se pudo registrar el usuario');
    }
  }

  public hasRole(role: string): boolean {
    return this.profile?.roles.includes(role) ?? false;
  }

  public hasManagerRole(): boolean {
    return this.hasRole('POLICY_MANAGER');
  }
}
