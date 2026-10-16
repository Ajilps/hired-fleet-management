export type AdminSession = {
  accessToken: string
  accessTokenExpiresAt: string
  user: { role: 'admin'; fullName: string; email: string; isActive: true }
}
