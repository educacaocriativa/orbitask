import { google } from 'googleapis'
import { env } from '../config/env'

// Handles keys pasted from JSON with surrounding quotes or escaped \n
function sanitizePrivateKey(key: string): string {
  let k = key.trim()
  // Strip surrounding JSON quotes if present: "-----BEGIN..."
  if (k.startsWith('"') && k.endsWith('"')) k = k.slice(1, -1)
  // Replace literal \n sequences with actual newlines
  return k.replace(/\\n/g, '\n')
}

// ── Auth client (singleton) ──────────────────────────────
function getDriveClient() {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || !env.GOOGLE_SHARED_DRIVE_ID) {
    return null
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: sanitizePrivateKey(env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!),
    },
    scopes: ['https://www.googleapis.com/auth/drive'],
  })

  return google.drive({ version: 'v3', auth })
}

export class GoogleDriveService {
  private drive = getDriveClient()
  private sharedDriveId = env.GOOGLE_SHARED_DRIVE_ID ?? ''

  get isConfigured() {
    return !!this.drive
  }

  // ── Create a folder inside a parent ──────────────────────
  async createFolder(name: string, parentId: string): Promise<{ id: string; url: string } | null> {
    if (!this.drive) return null

    try {
      const res = await this.drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [parentId],
        },
        supportsAllDrives: true,
        fields: 'id, webViewLink',
      })

      return {
        id: res.data.id!,
        url: res.data.webViewLink!,
      }
    } catch (err) {
      console.error('GoogleDrive createFolder error:', err)
      return null
    }
  }

  // ── Create board root folder in Shared Drive ─────────────
  async createBoardFolder(boardTitle: string): Promise<{ id: string; url: string } | null> {
    return this.createFolder(boardTitle, this.sharedDriveId)
  }

  // ── Create column folder inside board folder ─────────────
  async createColumnFolder(columnTitle: string, boardFolderId: string): Promise<{ id: string; url: string } | null> {
    return this.createFolder(columnTitle, boardFolderId)
  }

  // ── Create card folder inside column folder ──────────────
  async createCardFolder(cardTitle: string, userName: string, columnFolderId: string): Promise<{ id: string; url: string } | null> {
    const name = `${cardTitle}_${userName}`.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 100)
    return this.createFolder(name, columnFolderId)
  }

  // ── Share folder with a user (writer) ────────────────────
  async shareFolder(folderId: string, email: string): Promise<void> {
    if (!this.drive) return

    try {
      await this.drive.permissions.create({
        fileId: folderId,
        requestBody: {
          role: 'writer',
          type: 'user',
          emailAddress: email,
        },
        supportsAllDrives: true,
        sendNotificationEmail: false,
      })
    } catch (err) {
      // Don't fail if email doesn't have a Google account
      console.warn(`GoogleDrive share failed for ${email}:`, (err as any)?.message)
    }
  }

  // ── Share folder with multiple emails ────────────────────
  async shareFolderWithMany(folderId: string, emails: string[]): Promise<void> {
    await Promise.allSettled(emails.map((e) => this.shareFolder(folderId, e)))
  }
}

export const googleDrive = new GoogleDriveService()
