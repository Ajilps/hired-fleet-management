export type AdminSession = {
  isBrowserSession?: boolean
  accessToken: string
  accessTokenExpiresAt: string
  user: { role: 'admin'; fullName: string; email: string; isActive: true; passwordChangeRequired?: boolean }
}
