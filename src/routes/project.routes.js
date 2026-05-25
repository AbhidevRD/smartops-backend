import express from 'express';
import auth from '../middleware/auth.middleware.js';
import {
 createProject,
 getProjects,
 getProject,
 updateProject,
 deleteProject,
 joinProjectByCode,
 getProjectCode,
 regenerateProjectCode
} from '../controllers/project.controller.js';
import {
 getProjectMembers,
 addProjectMember,
 updateProjectMember,
 removeProjectMember,
 getTeamStats
} from '../controllers/member.controller.js';
import {
 sendInvite,
 acceptInvite,
 rejectInvite,
 getInviteInfo
} from '../controllers/invite.controller.js';
import { getTasks } from '../controllers/task.controller.js';

const router = express.Router();

// Invite routes
router.post('/invite', auth, sendInvite);
router.post('/invite/accept', auth, acceptInvite);
router.post('/invite/reject', auth, rejectInvite);
router.get('/invite/info', getInviteInfo);

// Join project by code route (place before /:id routes to avoid conflicts)
router.post('/join', auth, joinProjectByCode);

// Project CRUD
router.post('/', auth, createProject);
router.get('/', auth, getProjects);

// More specific routes before generic /:id
router.get('/:projectId/tasks', auth, (req, res) => {
 req.query = {
  ...req.query,
  projectId: req.params.projectId
 };
 return getTasks(req, res);
});
router.get('/:projectId/members', auth, getProjectMembers);
router.post('/:projectId/members', auth, addProjectMember);
router.put('/:projectId/members/:memberId', auth, updateProjectMember);
router.delete('/:projectId/members/:memberId', auth, removeProjectMember);
router.get('/:projectId/stats', auth, getTeamStats);

// Join code routes
router.get('/:id/code', auth, getProjectCode);
router.patch('/:id/regenerate-code', auth, regenerateProjectCode);

// Generic routes last
router.get('/:id', auth, getProject);
router.put('/:id', auth, updateProject);
router.delete('/:id', auth, deleteProject);

export default router;
