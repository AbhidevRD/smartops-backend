# Team Collaboration & Invitation System

## Overview

The Team Collaboration & Invitation System allows project owners to invite team members to join their projects via email. The system includes:

- **Email-based invitations** with 7-day expiry
- **Secure token-based verification** for accepting invites
- **Real-time updates** via Socket.io
- **Pending invite management** for project owners
- **Project member management** with roles (OWNER/MEMBER)

## Architecture

### Database Models

#### ProjectInvite
```prisma
model ProjectInvite {
  id         String        @id @default(uuid())
  email      String
  projectId  String
  invitedById String
  status     InviteStatus  @default(PENDING)
  token      String        @unique
  expiresAt  DateTime
  createdAt  DateTime      @default(now())
  
  project    Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  invitedBy  User          @relation(fields: [invitedById], references: [id], onDelete: Cascade)

  @@unique([email, projectId])
}

enum InviteStatus {
  PENDING
  ACCEPTED
  REJECTED
  EXPIRED
}
```

#### ProjectMember
```prisma
model ProjectMember {
  id        String   @id @default(uuid())
  projectId String
  userId    String
  role      ProjectRole @default(MEMBER)
  
  project   Project @relation("members", fields: [projectId], references: [id], onDelete: Cascade)
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
}

enum ProjectRole {
  OWNER
  MEMBER
}
```

## API Endpoints

### 1. Send Invite
**POST** `/api/invites/send`

**Authentication**: Required (JWT)

**Request Body**:
```json
{
  "email": "user@example.com",
  "projectId": "proj-123"
}
```

**Response** (201 Created):
```json
{
  "message": "Invite sent successfully",
  "invite": {
    "id": "invite-123",
    "email": "user@example.com",
    "projectId": "proj-123",
    "status": "PENDING",
    "expiresAt": "2026-05-07T12:34:56Z"
  }
}
```

**Error Cases**:
- 400: Invalid email format, user already member, duplicate pending invite
- 403: Only project owner can invite
- 404: Project not found

### 2. Accept Invite
**POST** `/api/invites/accept`

**Authentication**: Required (JWT)

**Request Body**:
```json
{
  "token": "crypto-random-token"
}
```

**Response** (200 OK):
```json
{
  "message": "Invite accepted successfully",
  "projectId": "proj-123"
}
```

**Requirements**:
- User email must match invite email
- Invite must not be expired or already processed
- User must not already be a project member

**Error Cases**:
- 400: Invite expired, already processed, user already member
- 403: Email mismatch
- 404: Invite not found

### 3. Reject Invite
**POST** `/api/invites/reject`

**Authentication**: Required (JWT)

**Request Body**:
```json
{
  "token": "crypto-random-token"
}
```

**Response** (200 OK):
```json
{
  "message": "Invite rejected"
}
```

### 4. Get Invite Info (Public)
**GET** `/api/invites/info?token=crypto-random-token`

**Authentication**: Not required

**Response** (200 OK):
```json
{
  "email": "user@example.com",
  "project": {
    "id": "proj-123",
    "name": "Project Name",
    "description": "Project description",
    "owner": {
      "id": "user-123",
      "name": "Owner Name",
      "email": "owner@example.com"
    },
    "memberCount": 5
  },
  "invitedBy": {
    "id": "user-456",
    "name": "Inviter Name",
    "email": "inviter@example.com"
  }
}
```

### 5. Get Project Invites (Owner Only)
**GET** `/api/invites/project/:projectId`

**Authentication**: Required (JWT, must be project owner)

**Response** (200 OK):
```json
{
  "invites": [
    {
      "id": "invite-123",
      "email": "user@example.com",
      "status": "PENDING",
      "createdAt": "2026-04-30T12:34:56Z",
      "expiresAt": "2026-05-07T12:34:56Z",
      "invitedBy": {
        "id": "user-123",
        "name": "Project Owner"
      }
    }
  ]
}
```

### 6. Cancel Invite (Owner Only)
**DELETE** `/api/invites/:inviteId`

**Authentication**: Required (JWT, must be project owner)

**Response** (200 OK):
```json
{
  "message": "Invite cancelled"
}
```

**Requirements**:
- Only project owner can cancel
- Can only cancel PENDING invites

### 7. Get Project Members
**GET** `/api/projects/:projectId/members`

**Authentication**: Required (JWT)

**Response** (200 OK):
```json
[
  {
    "id": "member-123",
    "projectId": "proj-123",
    "userId": "user-123",
    "role": "OWNER",
    "user": {
      "id": "user-123",
      "name": "Project Owner",
      "email": "owner@example.com",
      "avatarUrl": "https://..."
    }
  },
  {
    "id": "member-456",
    "projectId": "proj-123",
    "userId": "user-456",
    "role": "MEMBER",
    "user": {
      "id": "user-456",
      "name": "Team Member",
      "email": "member@example.com",
      "avatarUrl": "https://..."
    }
  }
]
```

## Frontend Components

### InvitePage (`/invite?token=...`)
Display invite details and allow accepting/rejecting invitations.

**Features**:
- Automatically redirect unauthenticated users to login
- Display project info (name, description, owner, member count)
- Show who invited the user
- Accept/Reject buttons
- Token expiry validation

### InviteModal
Modal component for sending invites from project dashboard.

**Features**:
- Email input with validation
- Error/success messaging
- Loading state during submission
- Automatically close after success

### ProjectMembers
Display all project members and manage invitations.

**Features**:
- List all active members with roles
- Show pending invites (owner only)
- Cancel pending invites (owner only)
- Invite new members button (owner only)
- Real-time member updates via Socket.io

## Backend Controllers

### invite.controller.js

#### sendInvite(req, res)
- Validates project ownership
- Checks for duplicate invites
- Generates crypto token with 7-day expiry
- Creates ProjectInvite record
- Sends email with invite link
- Returns invite details

#### acceptInvite(req, res)
- Validates token existence and expiry
- Verifies email match
- Checks member status
- Creates ProjectMember record
- Updates invite status to ACCEPTED

#### rejectInvite(req, res)
- Validates token and email
- Updates invite status to REJECTED
- Maintains audit trail

#### getInviteInfo(req, res)
- Public endpoint (no auth required)
- Displays project details
- Shows inviter information
- Validates token expiry

#### getProjectInvites(req, res)
- Owner-only endpoint
- Lists all project invites
- Includes status and timestamps
- Filters by project

#### cancelInvite(req, res)
- Owner-only endpoint
- Deletes pending invites only
- Prevents canceling accepted/rejected

## Email Templates

### Invite Email
Professional HTML email with:
- Project name and description
- Inviter name
- Accept invite button (links to `/invite?token=...`)
- Invitation link as fallback
- 7-day expiry notice
- SmartOps branding

**Email Service**: Uses Resend API with Gmail/Nodemailer fallback

## Authentication Flow

### Invite Journey
1. **Owner sends invite** → `/api/invites/send`
   - Backend validates ownership
   - Creates ProjectInvite with crypto token
   - Sends email with invite link

2. **Guest receives email** → Clicks invite link
   - Frontend extracts token from URL
   - Redirects to login if not authenticated
   - Calls `/api/invites/info` to display project details

3. **Guest accepts invite** → `/api/invites/accept`
   - Frontend sends token in request body
   - Backend verifies token, email, and expiry
   - Creates ProjectMember record
   - Redirects to project dashboard

4. **Owner sees new member** → Socket.io updates
   - Real-time notification sent to project room
   - Member list automatically updated
   - Invite moved from pending to accepted

## Security Features

1. **Token-based verification**
   - Crypto-random 64-character tokens
   - Unique constraint on token field
   - 7-day expiry validation

2. **Email verification**
   - User email must match invite email
   - Prevents invite hijacking

3. **Ownership verification**
   - Only project owner can send/cancel invites
   - Only owner can view all project invites

4. **Duplicate prevention**
   - Unique constraint on (email, projectId)
   - Prevents multiple pending invites to same email

5. **Status validation**
   - Prevents accepting already-processed invites
   - Auto-marks expired invites

## Testing

Run the test suite:
```bash
node scripts/test_invites.js
```

Tests include:
- Creating projects
- Sending invites
- Getting invite info
- Listing project invites
- Canceling invites
- Preventing duplicate invites
- Error cases

## Database Migration

Run migration to create ProjectInvite table:
```bash
npx prisma migrate dev --name add_project_invites
```

This creates:
- `project_invites` table
- `InviteStatus` enum (PENDING, ACCEPTED, REJECTED, EXPIRED)
- Unique constraints on (email, projectId) and token
- Foreign keys to projects and users tables

## Environment Variables

Required for email functionality:
```env
RESEND_API_KEY=your_resend_key
FROM_EMAIL=noreply@smartops.ai
GMAIL_EMAIL=your_gmail@gmail.com
GMAIL_PASSWORD=your_gmail_app_password
FRONTEND_URL=http://localhost:3001
```

## Socket.io Integration

Real-time updates for team collaboration:

```javascript
// When invite accepted
io.to(projectId).emit('member-added', {
  member: { id, name, email, role },
  timestamp: new Date()
});

// When invite sent
io.to(projectId).emit('invite-sent', {
  email,
  status: 'PENDING'
});

// When invite canceled
io.to(projectId).emit('invite-canceled', {
  email
});
```

## Future Enhancements

1. **Bulk invites** - CSV upload for multiple invites
2. **Invite templates** - Customize invite message
3. **Role management** - Assign different roles to members
4. **Invite expiry reminders** - Send reminder before expiry
5. **Member removal** - Allow owners to remove members
6. **Permission levels** - Fine-grained access control

## Troubleshooting

### Invite not received
- Check RESEND_API_KEY is configured
- Verify email is in Resend verified domain
- Check Gmail fallback is configured
- See EmailLog table for delivery logs

### Token expired
- Invites expire after 7 days
- Owner can cancel and resend
- Frontend should validate expiry before showing accept button

### Email mismatch error
- User must be logged in with same email as invite
- Logout and login with correct account

### Invite not found
- Token may be malformed
- Invite may have been canceled
- Check token in URL query parameter

## Support

For issues or questions, contact the SmartOps development team.
