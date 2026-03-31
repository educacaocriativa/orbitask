// Cookie utilities — used by the Next.js middleware to read the JWT
// The client sets the cookie on login so middleware can check auth without localStorage

const TOKEN_KEY = 'orbitask:token'

export function setAuthCookie(token: string) {
  if (typeof document === 'undefined') return
  const maxAge = 60 * 60 * 24 * 7 // 7 days
  document.cookie = `${TOKEN_KEY}=${token}; path=/; max-age=${maxAge}; SameSite=Lax`
}

export function removeAuthCookie() {
  if (typeof document === 'undefined') return
  document.cookie = `${TOKEN_KEY}=; path=/; max-age=0`
}

export function getAuthCookie(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${TOKEN_KEY}=`))
  return match ? match.split('=')[1] : null
}

