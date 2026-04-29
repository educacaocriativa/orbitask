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

  // ── Create RECURSOS folder inside a card's section folder ─
  async createResourcesFolder(parentFolderId: string): Promise<{ id: string; url: string } | null> {
    return this.createFolder('RECURSOS', parentFolderId)
  }

  // ── Delete a folder (and all its contents) ───────────────
  async deleteFolder(folderId: string): Promise<void> {
    if (!this.drive) return
    try {
      await this.drive.files.delete({
        fileId: folderId,
        supportsAllDrives: true,
      })
    } catch (err) {
      console.warn('GoogleDrive deleteFolder error:', (err as any)?.message)
    }
  }

  // ── Rename an existing folder ────────────────────────────
  async renameFolder(folderId: string, newName: string): Promise<void> {
    if (!this.drive) return
    try {
      await this.drive.files.update({
        fileId: folderId,
        requestBody: { name: newName.replace(/[/\\?%*:|"<>]/g, '-').substring(0, 100) },
        supportsAllDrives: true,
      })
    } catch (err) {
      console.warn('GoogleDrive renameFolder error:', (err as any)?.message)
    }
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

  // ── Add members to the Shared Drive itself ───────────────
  async addMembersToSharedDrive(emails: string[]): Promise<void> {
    if (!this.drive) return
    await Promise.allSettled(emails.map(async (email) => {
      try {
        await this.drive!.permissions.create({
          fileId: this.sharedDriveId,
          requestBody: {
            role: 'writer',
            type: 'user',
            emailAddress: email,
          },
          supportsAllDrives: true,
          sendNotificationEmail: false,
        })
      } catch (err) {
        console.warn(`GoogleDrive add member failed for ${email}:`, (err as any)?.message)
      }
    }))
  }

  // ── List all permissions on a file/folder/drive ──────────
  async listPermissions(fileId: string): Promise<Array<{ id: string; emailAddress?: string | null; role?: string | null; type?: string | null }>> {
    if (!this.drive) return []
    try {
      const permissions: Array<{ id: string; emailAddress?: string | null; role?: string | null; type?: string | null }> = []
      let pageToken: string | undefined
      do {
        const res = await this.drive.permissions.list({
          fileId,
          supportsAllDrives: true,
          fields: 'nextPageToken, permissions(id, emailAddress, role, type)',
          pageToken,
        })
        for (const p of res.data.permissions ?? []) {
          if (p.id) permissions.push({ id: p.id, emailAddress: p.emailAddress, role: p.role, type: p.type })
        }
        pageToken = res.data.nextPageToken ?? undefined
      } while (pageToken)
      return permissions
    } catch (err) {
      console.warn('GoogleDrive listPermissions error:', (err as any)?.message)
      return []
    }
  }

  // ── Find permission ID for an email on a file/drive ──────
  private async findPermissionId(fileId: string, email: string): Promise<string | null> {
    if (!this.drive) return null
    try {
      const res = await this.drive.permissions.list({
        fileId,
        supportsAllDrives: true,
        fields: 'permissions(id, emailAddress)',
      })
      const perm = res.data.permissions?.find(
        (p) => p.emailAddress?.toLowerCase() === email.toLowerCase()
      )
      return perm?.id ?? null
    } catch (err) {
      console.warn(`GoogleDrive findPermissionId failed for ${email}:`, (err as any)?.message)
      return null
    }
  }

  // ── Revoke a user's permission from a folder/drive ───────
  async revokePermission(fileId: string, email: string): Promise<void> {
    if (!this.drive) return
    const permId = await this.findPermissionId(fileId, email)
    if (!permId) return
    try {
      await this.drive.permissions.delete({
        fileId,
        permissionId: permId,
        supportsAllDrives: true,
      })
    } catch (err) {
      console.warn(`GoogleDrive revokePermission failed for ${email}:`, (err as any)?.message)
    }
  }

  // ── Revoke permissions for multiple users from a folder ──
  async revokePermissionFromMany(fileId: string, emails: string[]): Promise<void> {
    await Promise.allSettled(emails.map((e) => this.revokePermission(fileId, e)))
  }

  // ── Remove members from the Shared Drive ─────────────────
  async removeMembersFromSharedDrive(emails: string[]): Promise<void> {
    await this.revokePermissionFromMany(this.sharedDriveId, emails)
  }

  // ── Test connection by listing Shared Drive ───────────────
  async testConnection(): Promise<{ ok: boolean; error?: string; details?: unknown }> {
    if (!this.drive) return { ok: false, error: 'Not configured' }
    try {
      await this.drive.drives.get({
        driveId: this.sharedDriveId,
        fields: 'id, name',
      })
      return { ok: true }
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message ?? String(err),
        details: err?.response?.data ?? null,
      }
    }
  }
}

export const googleDrive = new GoogleDriveService()
