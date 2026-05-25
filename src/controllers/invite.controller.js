import prisma from '../lib/prisma.js';
import crypto from 'crypto';
import { sendInviteEmail } from '../services/email.service.js';
import { requireProjectAdmin, sendAccessError } from '../utils/projectAccess.js';

// ============================================
// SEND INVITE
// ============================================
export const sendInvite = async (req, res) => {
  try {
    const { email, projectId } = req.body;
    const userId = req.user.id;
    const normalizedEmail = email?.trim().toLowerCase();

    // Validate input
    if (!normalizedEmail || !projectId) {
      return res.status(400).json({
        error: 'Email and projectId are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        error: 'Invalid email format'
      });
    }

    try {
      await requireProjectAdmin(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { owner: true }
    });

    if (!project) {
      return res.status(404).json({
        error: 'Project not found'
      });
    }

    const invitedUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    // Check if user is already a member
    if (invitedUser) {
      const existingMember = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: invitedUser.id
          }
        }
      });

      if (existingMember) {
        return res.status(400).json({
          error: 'User is already a member of this project'
        });
      }
    }

    const inviter = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true }
    });

    const inviteLinkBase = (process.env.FRONTEND_URL || 'http://localhost:3001').replace(/\/$/, '');

    const existingInvite = await prisma.projectInvite.findUnique({
      where: {
        email_projectId: {
          email: normalizedEmail,
          projectId
        }
      }
    });

    if (existingInvite?.status === 'PENDING' && existingInvite.expiresAt > new Date()) {
      return res.status(400).json({
        error: 'Invite already sent to this email for this project'
      });
    }

    // Generate unique invite token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = existingInvite
      ? await prisma.projectInvite.update({
        where: { id: existingInvite.id },
        data: {
          status: 'PENDING',
          invitedById: userId,
          token,
          expiresAt
        },
        include: {
          project: true,
          invitedBy: true
        }
      })
      : await prisma.projectInvite.create({
        data: {
          email: normalizedEmail,
          projectId,
          invitedById: userId,
          token,
          expiresAt
        },
        include: {
          project: true,
          invitedBy: true
        }
      });

    const inviteLink = `${inviteLinkBase}/invite?token=${token}`;
    let emailSent = false;
    let emailError = null;

    // Try to send email, but don't fail the invite creation if email fails
    try {
      await sendInviteEmail(
        normalizedEmail,
        inviteLink,
        project.name,
        inviter?.name || project.owner.name || 'A SmartOps user'
      );
      emailSent = true;
    } catch (err) {
      emailError = err.message;
      console.warn('Email notification failed, but invite was created:', err.message);
    }

    const response = {
      message: emailSent 
        ? 'Invite sent successfully' 
        : 'Invite created, but email notification could not be delivered. Share the invite link manually.',
      invite: {
        id: invite.id,
        email: invite.email,
        projectId: invite.projectId,
        status: invite.status,
        expiresAt: invite.expiresAt,
        inviteLink: inviteLink // Include link for manual sharing if email fails
      }
    };

    if (!emailSent && process.env.NODE_ENV === 'development') {
      response.emailError = emailError;
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('Send invite error:', error.message);
    res.status(500).json({
      error: 'Failed to send invite',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// ACCEPT INVITE
// ============================================
export const acceptInvite = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        error: 'Invite token is required'
      });
    }

    // Find invite
    const invite = await prisma.projectInvite.findUnique({
      where: { token },
      include: { project: true }
    });

    if (!invite) {
      return res.status(404).json({
        error: 'Invite not found'
      });
    }

    // Check if expired
    if (invite.expiresAt < new Date()) {
      // Mark as expired
      await prisma.projectInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' }
      });
      return res.status(400).json({
        error: 'Invite has expired'
      });
    }

    // Check if already accepted/rejected
    if (invite.status !== 'PENDING') {
      return res.status(400).json({
        error: `Invite has already been ${invite.status.toLowerCase()}`
      });
    }

    // Verify email matches logged-in user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({
        error: 'You can only accept invites sent to your email address'
      });
    }

    // Check if already a member
    const existingMember = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: invite.projectId,
          userId
        }
      }
    });

    if (existingMember) {
      return res.status(400).json({
        error: 'You are already a member of this project'
      });
    }

    // Accept invite and add to project
    await prisma.$transaction([
      prisma.projectInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' }
      }),
      prisma.projectMember.create({
        data: {
          projectId: invite.projectId,
          userId,
          role: 'MEMBER'
        }
      })
    ]);

    res.json({
      message: 'Invite accepted successfully',
      projectId: invite.projectId
    });

  } catch (error) {
    console.error('Accept invite error:', error.message);
    res.status(500).json({
      error: 'Failed to accept invite',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// REJECT INVITE
// ============================================
export const rejectInvite = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user.id;

    if (!token) {
      return res.status(400).json({
        error: 'Invite token is required'
      });
    }

    // Find invite
    const invite = await prisma.projectInvite.findUnique({
      where: { token }
    });

    if (!invite) {
      return res.status(404).json({
        error: 'Invite not found'
      });
    }

    // Verify user email matches
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
      return res.status(403).json({
        error: 'You can only reject invites sent to your email address'
      });
    }

    // Check if already processed
    if (invite.status !== 'PENDING') {
      return res.status(400).json({
        error: `Invite has already been ${invite.status.toLowerCase()}`
      });
    }

    // Reject invite
    await prisma.projectInvite.update({
      where: { id: invite.id },
      data: { status: 'REJECTED' }
    });

    res.json({
      message: 'Invite rejected'
    });

  } catch (error) {
    console.error('Reject invite error:', error.message);
    res.status(500).json({
      error: 'Failed to reject invite',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// GET INVITE INFO (for accept page)
// ============================================
export const getInviteInfo = async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        error: 'Invite token is required'
      });
    }

    // Find invite
    const invite = await prisma.projectInvite.findUnique({
      where: { token },
      include: {
        project: {
          include: {
            owner: {
              select: { id: true, name: true, email: true }
            },
            _count: {
              select: { members: true }
            }
          }
        },
        invitedBy: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    if (!invite) {
      return res.status(404).json({
        error: 'Invite not found'
      });
    }

    // Check if expired
    if (invite.expiresAt < new Date()) {
      return res.status(400).json({
        error: 'Invite has expired'
      });
    }

    // Check status
    if (invite.status !== 'PENDING') {
      return res.status(400).json({
        error: `Invite has been ${invite.status.toLowerCase()}`
      });
    }

    res.json({
      email: invite.email,
      project: {
        id: invite.project.id,
        name: invite.project.name,
        description: invite.project.description,
        owner: invite.project.owner,
        memberCount: invite.project._count.members
      },
      invitedBy: invite.invitedBy
    });

  } catch (error) {
    console.error('Get invite info error:', error.message);
    res.status(500).json({
      error: 'Failed to get invite info',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// GET PROJECT INVITES (for project owner)
// ============================================
export const getProjectInvites = async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user.id;

    try {
      await requireProjectAdmin(projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    // Get all invites for project
    const invites = await prisma.projectInvite.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: {
          select: { id: true, name: true }
        }
      }
    });

    res.json({
      invites: invites.map(invite => ({
        id: invite.id,
        email: invite.email,
        token: invite.token,
        status: invite.status,
        createdAt: invite.createdAt,
        expiresAt: invite.expiresAt,
        invitedBy: invite.invitedBy
      }))
    });

  } catch (error) {
    console.error('Get project invites error:', error.message);
    res.status(500).json({
      error: 'Failed to get project invites',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============================================
// CANCEL INVITE (owner can cancel pending invite)
// ============================================
export const cancelInvite = async (req, res) => {
  try {
    const { inviteId } = req.params;
    const userId = req.user.id;

    // Find invite
    const invite = await prisma.projectInvite.findUnique({
      where: { id: inviteId },
      include: { project: true }
    });

    if (!invite) {
      return res.status(404).json({
        error: 'Invite not found'
      });
    }

    try {
      await requireProjectAdmin(invite.projectId, req.user);
    } catch (accessError) {
      return sendAccessError(res, accessError);
    }

    // Can only cancel pending invites
    if (invite.status !== 'PENDING') {
      return res.status(400).json({
        error: 'Can only cancel pending invites'
      });
    }

    // Delete invite
    await prisma.projectInvite.delete({
      where: { id: inviteId }
    });

    res.json({
      message: 'Invite cancelled'
    });

  } catch (error) {
    console.error('Cancel invite error:', error.message);
    res.status(500).json({
      error: 'Failed to cancel invite',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
